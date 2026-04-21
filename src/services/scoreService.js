/**
 * ScoreService - tracks a distraction score that accumulates when on
 * bad apps and decays on good apps. Port of ReassessmentScoreService.swift.
 *
 * Score is clamped 0-100. When it crosses the threshold, the
 * onThresholdReached callback fires (triggering check-in overlay).
 */

import { remoteLogger } from './remoteLogger';

// Named presets for different strictness levels
const PRESETS = {
  relaxed: {
    distractingRate: 0.01,
    unknownRate: 0.02,
    productiveDecayRate: 0.15,
    passiveDecayRate: 0.15,
    threshold: 80,
  },
  default: {
    distractingRate: 0.03,
    unknownRate: 0.04,
    productiveDecayRate: 0.1,
    passiveDecayRate: 0.1,
    threshold: 50,
  },
  strict: {
    distractingRate: 0.08,
    unknownRate: 0.1,
    productiveDecayRate: 0.05,
    passiveDecayRate: 0.05,
    threshold: 30,
  },
  aggressive: {
    distractingRate: 0.15,
    unknownRate: 0.18,
    productiveDecayRate: 0.03,
    passiveDecayRate: 0.03,
    threshold: 20,
  },
};

export class ScoreService {
  /**
   * @param {object} callbacks
   * @param {function} callbacks.onThresholdReached - called when score >= threshold (not snoozed)
   * @param {function} callbacks.onScoreUpdate - called with (currentScore, threshold) after every change
   */
  constructor({ onThresholdReached, onScoreUpdate } = {}) {
    this.currentScore = 0;
    this.distractingRate = 0.03;
    this.unknownRate = 0.04;
    this.productiveDecayRate = 0.1;
    this.passiveDecayRate = 0.1;
    this.threshold = 50;
    this.snoozedUntil = null;
    this.lastCheckTime = Date.now();
    this.pollLog = []; // { timestamp, totalScore } - last 50 entries
    // When true, recordApp and applyPassiveDecay are no-ops. Flipped by
    // monitoringController when the user stops monitoring.
    this._paused = false;

    this._onThresholdReached = onThresholdReached || (() => {});
    this._onScoreUpdate = onScoreUpdate || (() => {});
  }

  /**
   * Pause or resume score tracking. When paused, recordApp and
   * applyPassiveDecay early-return so the score freezes in place.
   */
  setPaused(paused) {
    this._paused = !!paused;
  }

  /**
   * Clamp a value between min and max.
   */
  _clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
  }

  /**
   * Record an app classification and update the score.
   * Matches Swift ReassessmentScoreService.recordActivity() scoring logic:
   * - blocked: no score contribution (already hard-blocked)
   * - distracting: always 30 * distractingRate * elapsed (hardcoded multiplier)
   * - unknown: wordScore * unknownRate * elapsed
   * - productive: decay
   *
   * @param {object} classification - from WordListService.classifyApp()
   *   { list: 'blocked'|'distracting'|'productive'|'unknown', matchedWord, score }
   * @param {number} elapsedSeconds - time since last check
   */
  recordApp(classification, elapsedSeconds, app = null) {
    if (this._paused) return;
    const { list, score: wordScore } = classification;
    const elapsed = Math.min(elapsedSeconds, 30); // cap at 30s to avoid spikes

    let delta = 0;

    switch (list) {
      case 'blocked':
        // No score contribution - already hard-blocked (matches Swift)
        break;
      case 'distracting':
        // Always use 30 as multiplier regardless of word score (matches Swift)
        delta = 30 * this.distractingRate * elapsed;
        break;
      case 'unknown':
        // Use the word's score (from global cache or default 5)
        delta = (wordScore || 5) * this.unknownRate * elapsed;
        break;
      case 'productive':
        delta = -(this.productiveDecayRate * elapsed);
        break;
      default:
        break;
    }

    const scoreBefore = this.currentScore;
    this.currentScore = this._clamp(this.currentScore + delta, 0, 100);
    const actualDelta = this.currentScore - scoreBefore;
    this.lastCheckTime = Date.now();

    this._pushLog({
      reason: 'activity',
      delta: actualDelta,
      app,
      list,
      wordScore: wordScore ?? null,
      elapsed,
    });

    // Notify listener of score change
    this._onScoreUpdate(this.currentScore, this.threshold);

    // Check if threshold is reached and not snoozed
    if (this.currentScore >= this.threshold && !this.isSnoozed()) {
      remoteLogger.warn('Score threshold reached', {
        score: this.currentScore,
        threshold: this.threshold,
      });
      this._onThresholdReached();
    }
  }

  /**
   * Push a structured entry to pollLog. All score-mutating methods funnel
   * through here so each data point carries enough context for the score
   * graph tooltip to explain what caused the change.
   *
   * @param {object} info - { reason, delta, app?, list?, cause?, ... }
   */
  _pushLog(info) {
    this.pollLog.push({
      timestamp: Date.now(),
      totalScore: this.currentScore,
      ...info,
    });
    // Keep up to ~30 days of history (at ~10s polling, that's ~260k entries).
    // Cap at 300k as a safety ceiling; persistence layer trims by age.
    if (this.pollLog.length > 300000) this.pollLog = this.pollLog.slice(-300000);
  }

  /**
   * Bump score by a fixed amount (e.g. NSFW detection triggers +30).
   * @param {number} amount - delta to add (clamped 0-100 after)
   * @param {string} cause - short tag for tooltip, e.g. 'nsfw'
   */
  spike(amount, cause = 'spike') {
    if (this._paused) return;
    const scoreBefore = this.currentScore;
    this.currentScore = this._clamp(this.currentScore + amount, 0, 100);
    const actualDelta = this.currentScore - scoreBefore;
    this._pushLog({ reason: 'spike', delta: actualDelta, cause });
    this._onScoreUpdate(this.currentScore, this.threshold);
  }

  /**
   * Apply passive decay - called every 30s tick.
   * Subtracts passiveDecayRate * 30 from score.
   */
  applyPassiveDecay() {
    if (this._paused) return;
    if (this.currentScore <= 0) return;

    const decay = this.passiveDecayRate * 30;
    const scoreBefore = this.currentScore;
    this.currentScore = this._clamp(this.currentScore - decay, 0, 100);
    const actualDelta = this.currentScore - scoreBefore;
    this._pushLog({ reason: 'passive_decay', delta: actualDelta });
    this._onScoreUpdate(this.currentScore, this.threshold);
  }

  /**
   * Snooze check-ins for a given number of minutes.
   * @param {number} minutes
   * @param {string} cause - short tag, e.g. 'user_snooze', 'checkin_dismiss'
   */
  snooze(minutes, cause = 'user') {
    const scoreBefore = this.currentScore;
    this.snoozedUntil = new Date(Date.now() + minutes * 60 * 1000);
    // Reset score when snoozing (matches Swift behavior)
    this.currentScore = 0;
    const actualDelta = this.currentScore - scoreBefore;
    this._pushLog({ reason: 'snooze', delta: actualDelta, minutes, cause });
    this._onScoreUpdate(this.currentScore, this.threshold);
  }

  /**
   * Check if check-ins are currently snoozed.
   * @returns {boolean}
   */
  isSnoozed() {
    if (!this.snoozedUntil) return false;
    if (new Date() >= this.snoozedUntil) {
      // Snooze expired - clear it
      this.snoozedUntil = null;
      return false;
    }
    return true;
  }

  /**
   * Reset score to 0 and clear snooze.
   * @param {string} cause - short tag, e.g. 'checkin_triggered', 'admin_manual'
   */
  reset(cause = 'manual') {
    const scoreBefore = this.currentScore;
    this.currentScore = 0;
    this.snoozedUntil = null;
    this.lastCheckTime = Date.now();
    const actualDelta = this.currentScore - scoreBefore;
    this._pushLog({ reason: 'reset', delta: actualDelta, cause });
    this._onScoreUpdate(this.currentScore, this.threshold);
  }

  /**
   * Get a snapshot of all current state values.
   * @returns {object}
   */
  getState() {
    return {
      currentScore: this.currentScore,
      distractingRate: this.distractingRate,
      unknownRate: this.unknownRate,
      productiveDecayRate: this.productiveDecayRate,
      passiveDecayRate: this.passiveDecayRate,
      threshold: this.threshold,
      snoozedUntil: this.snoozedUntil,
      lastCheckTime: this.lastCheckTime,
      isSnoozed: this.isSnoozed(),
      pollLog: this.pollLog,
    };
  }

  /**
   * Apply a named preset configuration.
   * @param {'relaxed'|'default'|'strict'|'aggressive'} name
   */
  applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) {
      console.warn(`ScoreService: unknown preset "${name}"`);
      return;
    }

    this.distractingRate = preset.distractingRate;
    this.unknownRate = preset.unknownRate;
    this.productiveDecayRate = preset.productiveDecayRate;
    this.passiveDecayRate = preset.passiveDecayRate;
    this.threshold = preset.threshold;

    // Notify of updated threshold
    this._onScoreUpdate(this.currentScore, this.threshold);
  }
}
