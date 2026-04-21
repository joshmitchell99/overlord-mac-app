/**
 * GlobalScoreService - looks up unproductive scores for apps we don't yet
 * have classified. Mirrors the Swift ReassessmentScoreService logic:
 *
 *   1. Check in-memory cache
 *   2. Check Firestore `GlobalAppScores/{docId}` (shared across users)
 *   3. Otherwise queue for AI scoring via /score-apps, batch-flushed every 2 min
 *
 * When a score is resolved, it's cached locally AND written back into the
 * WordListService so subsequent `classifyApp()` calls pick it up.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from './firebaseService';

const BACKEND_URL = 'https://overlordserver.up.railway.app';
const FLUSH_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes (matches Swift)

export class GlobalScoreService {
  /**
   * @param {object} deps
   * @param {import('./wordListService').WordListService} deps.wordList
   * @param {() => string} [deps.getMacInstructions] - returns current mac instructions
   */
  constructor({ wordList, getMacInstructions }) {
    this.wordList = wordList;
    this._getMacInstructions = getMacInstructions || (() => '');

    /** @type {Map<string, number>} lowercase app name -> score */
    this._cache = new Map();

    /** Apps pending AI scoring */
    this._pending = new Set();

    /** Apps currently being fetched (dedupe in-flight) */
    this._inFlight = new Set();

    /** Apps currently being AI-scored */
    this._inFlightAI = new Set();

    this._flushTimer = setInterval(() => this._flushQueue(), FLUSH_INTERVAL_MS);
  }

  /**
   * Return an app's cached score immediately, or fallback (null).
   */
  getCached(appName) {
    const key = appName.toLowerCase();
    return this._cache.has(key) ? this._cache.get(key) : null;
  }

  /**
   * Called when an unknown app is seen. Kicks off Firestore lookup, and
   * if nothing found, queues for AI scoring.
   */
  observeUnknown(appName) {
    if (!appName) return;
    const key = appName.toLowerCase();
    if (this._cache.has(key)) return;
    if (this._inFlight.has(key)) return;

    this._inFlight.add(key);

    const docId = key.replace(/[/.]/g, '_');
    getDoc(doc(db, 'GlobalAppScores', docId))
      .then(snap => {
        this._inFlight.delete(key);
        if (snap.exists()) {
          const data = snap.data();
          const score = data.unproductiveScore;
          if (typeof score === 'number') {
            this._applyScore(appName, score);
            return;
          }
        }
        // Not in global - queue for AI scoring
        this._pending.add(appName);
      })
      .catch(() => {
        this._inFlight.delete(key);
        this._pending.add(appName);
      });
  }

  /**
   * Apply a resolved score: cache + update the word list entry if present.
   */
  _applyScore(appName, score) {
    const key = appName.toLowerCase();
    this._cache.set(key, score);

    // If the word is already in the list, update its score in place
    const existing = this.wordList.getWords?.().find(w => w.word.toLowerCase() === key);
    if (existing) {
      this.wordList.addWord({ ...existing, score });
    }
  }

  /**
   * Flush pending unknowns to the /score-apps endpoint for AI scoring.
   */
  async _flushQueue() {
    if (this._pending.size === 0) return;

    const appsToScore = Array.from(this._pending).filter(a => !this._inFlightAI.has(a.toLowerCase()));
    if (appsToScore.length === 0) return;

    this._pending.clear();
    for (const a of appsToScore) this._inFlightAI.add(a.toLowerCase());

    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();

      const resp = await fetch(`${BACKEND_URL}/score-apps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          apps: appsToScore,
          mac_instructions: this._getMacInstructions() || '',
        }),
      });

      if (!resp.ok) throw new Error(`score-apps ${resp.status}`);
      const json = await resp.json();
      const scores = json.scores || {};

      for (const [name, score] of Object.entries(scores)) {
        if (typeof score === 'number') this._applyScore(name, score);
      }
    } catch (err) {
      console.warn('[globalScore] flush failed:', err.message);
    } finally {
      for (const a of appsToScore) this._inFlightAI.delete(a.toLowerCase());
    }
  }

  destroy() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
  }
}
