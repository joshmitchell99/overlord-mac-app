/**
 * DecisionEngine - connects WordListService + ScoreService to make
 * blocking and check-in decisions based on app activity.
 *
 * Receives app updates, classifies them, feeds the score service,
 * and triggers blocking or check-in overlays as needed.
 *
 * Ports the polling + browser site extraction behavior from the Swift
 * ReassessmentScoreService so scores tick up consistently and the
 * effective "app" for browsers is the site, not the browser chrome.
 *
 * Site extraction now uses WebsiteExtractor (a port of the Swift
 * WebsiteExtractor.swift with its ~1500-entry keyword DB). URL parsing
 * remains as a secondary fallback when the title doesn't match the DB.
 */

import { remoteLogger } from './remoteLogger';
import { extractWebsite, isBrowser as webIsBrowser, stripIndicators } from './websiteExtractor';

const MAX_RECENT_APPS = 50;
const POLL_REREC_MS = 10_000; // re-record current app every 10s even if no change

const TLDS = ['.com', '.org', '.net', '.io', '.co', '.app', '.dev', '.tv', '.gg', '.me', '.ai'];

/**
 * Derive the URL-based site name fallback (used only when the curated DB
 * in WebsiteExtractor doesn't match). Parses hostname, strips TLD, takes
 * the rightmost dot-chunk.
 */
function siteNameFromURL(url) {
  if (!url) return null
  try {
    let host = new URL(url).hostname.replace(/^www\./, '');
    let domain = host;
    for (const tld of TLDS) {
      if (domain.toLowerCase().endsWith(tld)) {
        domain = domain.slice(0, -tld.length);
        break;
      }
    }
    const parts = domain.split('.');
    domain = parts[parts.length - 1] || domain;
    if (domain) return domain.charAt(0).toUpperCase() + domain.slice(1);
  } catch { /* bad URL */ }
  return null
}

/**
 * Resolve the effective display name for a browser window.
 * Two lanes, mirroring the Swift app's extraction pipeline:
 *   1. WebsiteExtractor (curated ~1500-entry title-keyword DB)
 *   2. URL parsing (generic domain extraction)
 * Returns null if neither produces a name - caller should fall back to app.
 */
function resolveBrowserSite(appName, windowTitle, url) {
  const fromDb = extractWebsite(appName, windowTitle)
  if (fromDb) return fromDb

  const fromUrl = siteNameFromURL(url)
  if (fromUrl) return fromUrl

  // No match found. Return null so the caller falls back to the app name
  // (e.g. "Google Chrome") rather than dumping the full window title as the
  // "app" - matches Swift's `WebsiteExtractor.extractWebsite(...) ?? windowOwner`.
  return null
}

/**
 * Normalize an incoming timestamp to ms-since-epoch.
 * app-monitor.swift outputs seconds, but other callers use ms.
 */
function normalizeTimestampMs(ts) {
  if (!ts) return Date.now();
  // ms values for "now" are ~1.76e12; seconds are ~1.76e9
  return ts < 1e12 ? ts * 1000 : ts;
}

export class DecisionEngine {
  /**
   * @param {object} deps
   * @param {import('./wordListService').WordListService} deps.wordListService
   * @param {import('./scoreService').ScoreService} deps.scoreService
   * @param {function} deps.onBlock - called when a blocked app is detected
   * @param {function} deps.onCheckin - called when score threshold triggers a check-in
   * @param {function} [deps.onUnknownApp] - called with (appName) for apps not in any list
   * @param {function} [deps.getGlobalScore] - (appName) -> number|null, cached AI/global score for unknowns
   * @param {function} [deps.onEarlyCompliance] - called when an overlay is up and the user navigates away from the blocked target
   */
  constructor({ wordListService, scoreService, onBlock, onCheckin, onUnknownApp, getGlobalScore, onEarlyCompliance }) {
    this.wordListService = wordListService;
    this.scoreService = scoreService;
    this._onBlock = onBlock || (() => {});
    this._onCheckin = onCheckin || (() => {});
    this._onUnknownApp = onUnknownApp || (() => {});
    this._getGlobalScore = getGlobalScore || (() => null);
    this._onEarlyCompliance = onEarlyCompliance || (() => {});

    /** Matched-word key that triggered the current active overlay. Used by
     * the compliance check so we can early-dismiss the countdown panel when
     * the user actually navigates away from the offending app/tab. */
    this._activeBlockKey = null;

    /** @type {Array<object>} recent app history with classifications */
    this._recentApps = [];

    /**
     * Deduped map of distracting/unknown apps seen since the last reassessment.
     * Keyed by lowercased effective app name. Values: { word, score, firstSeen, lastSeen, classification }.
     * This is the canonical list fed into the reassessment overlay (matches Swift's recentUnknownWords).
     * @type {Map<string, object>}
     */
    this._unknownSeen = new Map();

    /**
     * Deduped map of distracting/unknown apps seen so far TODAY.
     * Same shape as _unknownSeen but only reset at the day boundary (midnight local),
     * not on check-in. Used to show "what you've been on all day" in the overlay.
     * @type {Map<string, object>}
     */
    this._todaySeen = new Map();
    this._todayDateKey = new Date().toDateString();

    /** @type {number|null} last processed timestamp in ms */
    this._lastUpdateTime = null;

    /** Last known app info for the polling re-record timer */
    this._lastKnown = null;

    /**
     * Block cooldown map - short 3s rate limit so the 1s app-monitor poll
     * doesn't fire duplicate overlay spawns during the instant an overlay
     * is being brought up.
     * @type {Map<string, number>} app name (lowercase) -> fired-at ms timestamp
     */
    this._blockCooldown = new Map();

    /**
     * Overlay-showing flag - set when a block overlay is spawned, cleared
     * when the overlay reports dismiss/grant back via App.jsx. While set,
     * new blocks are suppressed so we never stack overlays. The 15-min
     * safety timeout auto-clears stale flags if a dismiss event is somehow
     * missed, preventing the old "stuck forever" bug.
     * @type {number|null} timestamp ms when overlay was shown, or null
     */
    this._overlayShownAt = null;

    /**
     * Paused flag - when true, processAppUpdate and _record short-circuit
     * so no classification, scoring, or block/check-in callback fires even
     * if an app-status-update event sneaks through after monitoringController
     * stopped the native polling. Mirrors ScoreService._paused.
     * @type {boolean}
     */
    this._paused = false;

    /**
     * Blocking-paused flag - softer version of _paused. When true, the
     * _onBlock callback is suppressed (no hard-block overlay), but scoring,
     * classification, and check-ins still run. Used by the "Stop blocking"
     * popover option so the user can bypass blocks temporarily without
     * disabling the whole accountability loop.
     * @type {boolean}
     */
    this._blockingPaused = false;

    // Start polling re-record timer (matches Swift's pollingTimer)
    this._pollTimer = setInterval(() => {
      if (!this._lastKnown) return;
      // Re-record the same app so the score keeps moving even without focus changes
      this._record({ ...this._lastKnown, timestamp: Date.now() });
    }, POLL_REREC_MS);
  }

  /**
   * Process an app activity update. Called by the Electron main process
   * whenever the focused app changes (or on the binary's poll interval).
   *
   * @param {object} appInfo
   * @param {string} appInfo.app - raw app name (e.g. "Google Chrome")
   * @param {string} appInfo.bundleId - macOS bundle ID
   * @param {string} appInfo.windowTitle - current window title
   * @param {string|null} appInfo.url - browser URL if applicable
   * @param {number} appInfo.timestamp - epoch ms OR seconds (auto-normalized)
   */
  processAppUpdate(appInfo) {
    if (this._paused) return;
    this._lastKnown = { ...appInfo };
    this._record(appInfo);
  }

  /**
   * Internal record path - used by both the incoming-update handler and
   * the polling re-record timer.
   */
  _record(appInfo) {
    if (this._paused) return;
    const { app: rawApp, bundleId, windowTitle, url, timestamp } = appInfo;
    if (!rawApp) return;

    const now = normalizeTimestampMs(timestamp);

    // For browsers, use the site name as the effective app (matches Swift).
    // Uses WebsiteExtractor (curated DB) first, then URL parse, then stripped title.
    const isBrowser = webIsBrowser(rawApp);
    const effectiveApp = isBrowser
      ? (resolveBrowserSite(rawApp, windowTitle, url) || rawApp)
      : rawApp;

    // Classify using raw app + title + url + resolved site name. Passing
    // effectiveApp lets blocklist entries like "reddit" match a Chrome tab
    // whose title doesn't literally contain the word.
    const classification = this.wordListService.classifyApp(rawApp, windowTitle, url, effectiveApp);

    // elapsed in seconds since last record
    const elapsed = this._lastUpdateTime
      ? Math.max(0, (now - this._lastUpdateTime) / 1000)
      : 0;
    this._lastUpdateTime = now;

    // For unknowns, inject the cached global/AI score so ScoreService weights them properly
    let scoredClassification = classification;
    if (classification.list === 'unknown' && effectiveApp) {
      const cached = this._getGlobalScore(effectiveApp);
      if (typeof cached === 'number') {
        scoredClassification = { ...classification, score: cached };
      }
      // Also notify so the service can kick off a Firestore/AI lookup if not cached
      this._onUnknownApp(effectiveApp);
    }

    // Feed classification + elapsed time to score service (pass effectiveApp
    // so the score graph tooltip can show which app drove each change).
    this.scoreService.recordApp(scoredClassification, elapsed, effectiveApp);

    // Track distracting/unknown entries in the deduped "unknown seen" map.
    // This is the list the reassessment overlay surfaces - each distinct
    // effective app appears once, with its highest-observed score.
    if (
      (classification.list === 'distracting' || classification.list === 'unknown') &&
      effectiveApp
    ) {
      const key = effectiveApp.toLowerCase();
      const finalScore = scoredClassification.score ?? classification.score ?? 5;

      // elapsed is already capped by scoreService logic, but cap here too for safety.
      // This represents the time-spent since the previous poll.
      const addedSec = Math.min(Math.max(elapsed, 0), 30);

      const upsert = (map) => {
        const existing = map.get(key);
        if (existing) {
          existing.lastSeen = now;
          existing.timeSpentSec = (existing.timeSpentSec || 0) + addedSec;
          if (finalScore > existing.score) existing.score = finalScore;
        } else {
          map.set(key, {
            word: effectiveApp,
            score: finalScore,
            classification: classification.list,
            firstSeen: now,
            lastSeen: now,
            timeSpentSec: addedSec,
          });
        }
      };

      upsert(this._unknownSeen);

      // Roll over the "today" map at the local-day boundary
      const todayKey = new Date(now).toDateString();
      if (todayKey !== this._todayDateKey) {
        this._todaySeen.clear();
        this._todayDateKey = todayKey;
      }
      upsert(this._todaySeen);
    }

    // Track in recent apps history (use effective app so chips/picker show site)
    this._recentApps.unshift({
      app: effectiveApp,
      rawApp,
      bundleId,
      windowTitle,
      url,
      timestamp: now,
      classification: classification.list,
      matchedWord: classification.matchedWord,
      score: classification.score,
    });

    if (this._recentApps.length > MAX_RECENT_APPS) {
      this._recentApps = this._recentApps.slice(0, MAX_RECENT_APPS);
    }

    // If classification is blocked, trigger blocking overlay (unless rate-limited).
    // Keyed by matched word so different sites in the same browser don't collide.
    // Short 3s cooldown only exists to stop the 1s app-monitor poll from spawning
    // duplicate overlays while one is already showing. If the user dismisses but
    // stays on the site, the next poll after 3s re-fires the block.
    // Compliance check: if an overlay is already up and we're looking at
    // what's effectively the same blocked target, suppress below as normal.
    // But if the current classification is non-blocked OR targets a different
    // word, the user has navigated away - tell the countdown panel to stop
    // early.
    if (this._overlayShownAt !== null && this._activeBlockKey) {
      const currentKey = (classification.matchedWord || effectiveApp || rawApp || '').toLowerCase();
      const stillOnTarget = classification.list === 'blocked' && currentKey === this._activeBlockKey;
      if (!stillOnTarget) {
        this._onEarlyCompliance();
      }
    }

    if (classification.list === 'blocked') {
      const appKey = (classification.matchedWord || effectiveApp || rawApp).toLowerCase();

      if (this._blockingPaused) {
        // Blocking is temporarily paused - user chose "Stop blocking" from
        // the status bar popover. Classification + scoring still happen; we
        // just don't fire the overlay.
        return;
      }

      if (this._overlayShownAt !== null) {
        const ageMs = now - this._overlayShownAt;
        console.log(`[decisionEngine] BLOCK SUPPRESSED - overlay flag set ${ageMs}ms ago (app=${appKey})`);
        return;
      }

      const COOLDOWN_MS = 3000;
      const cooldownExpiry = this._blockCooldown.get(appKey);
      if (cooldownExpiry && (now - cooldownExpiry) < COOLDOWN_MS) {
        console.log(`[decisionEngine] BLOCK SUPPRESSED - cooldown (${now - cooldownExpiry}ms ago)`);
        return;
      }

      this._blockCooldown.set(appKey, now);
      this._overlayShownAt = now;
      this._activeBlockKey = appKey;
      console.log(`[decisionEngine] BLOCK FIRING - app=${appKey} word=${classification.matchedWord}`);

      remoteLogger.info('App blocked', {
        app: rawApp,
        effectiveApp,
        matchedWord: classification.matchedWord,
        score: classification.score,
        windowTitle,
      });

      // Find the matched word entry so we can pass its schedule to the overlay
      const matchedEntry = this.wordListService.getWords().find(
        w => w.word.toLowerCase() === (classification.matchedWord || '').toLowerCase()
      );

      this._onBlock({
        appName: effectiveApp || rawApp,
        bundleId,
        windowTitle,
        url,
        matchedWord: classification.matchedWord,
        reasoning: `"${classification.matchedWord}" is on your blocked list`,
        schedule: matchedEntry?.schedule || null,
      });
    }
  }

  /**
   * Mark the current blocking overlay as dismissed (called by App.jsx when
   * the native side reports 'dismissed' or 'grant-allowance'). Clears the
   * suppression flag so future blocked-app matches can re-fire the overlay.
   */
  markOverlayDismissed() {
    this._overlayShownAt = null;
    this._activeBlockKey = null;
  }

  /**
   * Clear any recorded cooldown for a word so the next match can re-fire immediately.
   * Used after granting a temporary unblock so the block re-arms as soon as the
   * unblock window expires.
   */
  clearActiveBlock(appName) {
    if (appName) {
      this._blockCooldown.delete(appName.toLowerCase());
    } else {
      this._blockCooldown.clear();
    }
  }

  getRecentApps() {
    return this._recentApps;
  }

  /**
   * Build a formatted summary of recent distracting/unknown apps
   * for the check-in overlay context.
   */
  /**
   * Build the short, deduped list of distracting/unknown sites seen since
   * the last reassessment. Matches Swift's `recentUnknownWords` approach:
   * sorted by score descending, capped at the top 10.
   */
  getAppSummary() {
    const entries = Array.from(this._unknownSeen.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    if (entries.length === 0) return 'No notable distracting activity detected.';

    return entries.map((e) => {
      const mins = Math.round((e.timeSpentSec || 0) / 60);
      const timeStr = mins > 0 ? `, ${mins}m` : '';
      return `- ${e.word} (score: ${e.score}/10${timeStr})`;
    }).join('\n');
  }

  /**
   * Return the deduped unknown-seen entries as a sorted array (for UI use).
   */
  getUnknownSeen() {
    return Array.from(this._unknownSeen.values()).sort((a, b) => b.score - a.score);
  }

  /**
   * Build the "so far today" summary. Same format as getAppSummary(), reads
   * from _todaySeen which only resets at day boundaries (not at check-in).
   */
  getTodaySummary() {
    const entries = Array.from(this._todaySeen.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    if (entries.length === 0) return 'Nothing tracked yet today.';
    return entries.map((e) => {
      const mins = Math.round((e.timeSpentSec || 0) / 60);
      const timeStr = mins > 0 ? `, ${mins}m` : '';
      return `- ${e.word} (score: ${e.score}/10${timeStr})`;
    }).join('\n');
  }

  /**
   * Return today's deduped seen apps as a sorted array (for UI use).
   */
  getTodaySeen() {
    return Array.from(this._todaySeen.values()).sort((a, b) => b.score - a.score);
  }

  /**
   * Clear the deduped "unknown seen" map. Called after a reassessment completes
   * (matches Swift's completeReassessment behavior). Does NOT clear the
   * "today" map - that rolls over at midnight only.
   */
  resetUnknowns() {
    this._unknownSeen.clear();
  }

  /**
   * Stop the polling timer (for tests / teardown).
   */
  destroy() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  /**
   * Pause decision-making. Stops the re-record timer AND sets the _paused
   * flag so any in-flight app-status-update events that arrive after the
   * native monitor was stopped won't trigger blocks or check-ins.
   */
  pause() {
    this._paused = true;
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  /**
   * Resume decision-making. Clears the paused flag and restarts the
   * re-record timer.
   */
  resume() {
    this._paused = false;
    if (this._pollTimer) return;
    this._pollTimer = setInterval(() => {
      if (!this._lastKnown) return;
      this._record({ ...this._lastKnown, timestamp: Date.now() });
    }, POLL_REREC_MS);
  }

  /**
   * Toggle the blocking-only pause. See _blockingPaused for semantics.
   * @param {boolean} paused
   */
  setBlockingPaused(paused) {
    this._blockingPaused = !!paused;
  }
}
