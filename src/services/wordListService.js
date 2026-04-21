/**
 * WordListService - manages blocking/distracting/productive word lists
 * and classifies apps based on substring matching.
 *
 * Each word entry:
 *   { word, score, list, schedule, addedBy, reason }
 *
 * Port of MacBlockingListService from the Swift app.
 */

// Default mock words for development/testing
// Scores use the 0-10 scale matching the Swift app (0 = productive, 5 = distracting, 10 = blocked)
const DEFAULT_WORDS = [
  // Blocked - score 9-10, hard-blocked sites
  { word: 'Reddit', score: 9, list: 'blocked', schedule: null, addedBy: 'default', reason: 'Social media' },
  { word: 'Twitter', score: 9, list: 'blocked', schedule: null, addedBy: 'default', reason: 'Social media' },
  { word: 'TikTok', score: 9, list: 'blocked', schedule: null, addedBy: 'default', reason: 'Social media' },
  { word: 'Instagram', score: 9, list: 'blocked', schedule: null, addedBy: 'default', reason: 'Social media' },
  { word: 'Facebook', score: 9, list: 'blocked', schedule: null, addedBy: 'default', reason: 'Social media' },

  // Distracting - score 5-8, contributes to check-in threshold
  { word: 'YouTube', score: 7, list: 'distracting', schedule: null, addedBy: 'default', reason: 'Video streaming' },
  { word: 'Discord', score: 5, list: 'distracting', schedule: null, addedBy: 'default', reason: 'Chat platform' },
  { word: 'Hacker News', score: 6, list: 'distracting', schedule: null, addedBy: 'default', reason: 'News aggregator' },
  { word: 'Twitch', score: 8, list: 'distracting', schedule: null, addedBy: 'default', reason: 'Live streaming' },

  // Productive - score 0, causes score decay
  { word: 'VS Code', score: 0, list: 'productive', schedule: null, addedBy: 'default', reason: 'Code editor' },
  { word: 'Terminal', score: 0, list: 'productive', schedule: null, addedBy: 'default', reason: 'Development tool' },
  { word: 'Figma', score: 0, list: 'productive', schedule: null, addedBy: 'default', reason: 'Design tool' },
  { word: 'Notion', score: 0, list: 'productive', schedule: null, addedBy: 'default', reason: 'Productivity tool' },
  { word: 'Linear', score: 0, list: 'productive', schedule: null, addedBy: 'default', reason: 'Project management' },
  { word: 'GitHub', score: 0, list: 'productive', schedule: null, addedBy: 'default', reason: 'Code hosting' },
];

export class WordListService {
  constructor() {
    /** @type {Map<string, object>} keyed by lowercase word */
    this._words = new Map();

    // Load defaults
    this.loadWords(DEFAULT_WORDS);
  }

  /**
   * Bulk load words, replacing ALL existing entries (full replace, not merge).
   * @param {Array} words - array of word objects
   */
  loadWords(words) {
    this._words.clear();
    for (const w of words) {
      if (!w || !w.word) continue;
      this._words.set(w.word.toLowerCase(), { ...w });
    }
  }

  /**
   * Clear all words.
   */
  clear() {
    this._words.clear();
  }

  /**
   * Add or update a single word entry.
   * @param {object} wordEntry - { word, score, list, schedule?, addedBy?, reason? }
   */
  addWord(wordEntry) {
    const entry = {
      score: 0,
      schedule: null,
      addedBy: 'user',
      reason: '',
      ...wordEntry,
    };
    this._words.set(entry.word.toLowerCase(), entry);
  }

  /**
   * Remove a word by its string value.
   * @param {string} wordStr
   */
  removeWord(wordStr) {
    this._words.delete(wordStr.toLowerCase());
  }

  /**
   * Check whether a word entry has an active temporary unblock.
   * Matches Swift's BlockingWord.hasActiveUnblock.
   * @param {object} entry
   * @returns {boolean}
   */
  _hasActiveUnblock(entry) {
    if (!entry.unblock_until) return false;
    // unblock_until is stored as ms-since-epoch (matching Swift's Int64(date * 1000))
    return Date.now() < entry.unblock_until;
  }

  /**
   * Set a temporary unblock on a word entry (stores unblock_until as ms-since-epoch).
   * Matches Swift's unblockUntil field persisted to Firebase.
   * @param {string} wordStr - the word to unblock
   * @param {number} durationMinutes - how long to unblock
   * @returns {boolean} true if the word was found and updated
   */
  setUnblockUntil(wordStr, durationMinutes) {
    const key = wordStr.toLowerCase();
    const entry = this._words.get(key);
    if (!entry) return false;
    entry.unblock_until = Date.now() + durationMinutes * 60000;
    return true;
  }

  /**
   * Clear the temporary unblock on a word entry.
   * @param {string} wordStr
   */
  clearUnblockUntil(wordStr) {
    const key = wordStr.toLowerCase();
    const entry = this._words.get(key);
    if (entry) {
      entry.unblock_until = null;
    }
  }

  /**
   * Classify an app by checking word matches against app name, window title, and URL.
   * Priority: blocked > distracting > productive > unknown.
   *
   * @param {string} appName
   * @param {string} windowTitle
   * @param {string|null} url
   * @param {string} [effectiveApp] - resolved browser site name (e.g. "Reddit" when
   *   appName is "Google Chrome" on a reddit tab). Checked alongside appName so
   *   blocklist entries for the site match even when the title doesn't contain
   *   the site name literally.
   * @returns {{ list: string, matchedWord: string|null, score: number }}
   */
  classifyApp(appName, windowTitle, url, effectiveApp) {
    const targets = [
      (appName || '').toLowerCase(),
      (windowTitle || '').toLowerCase(),
      (url || '').toLowerCase(),
      (effectiveApp || '').toLowerCase(),
    ];

    // Collect all matching words grouped by list priority
    let blockedMatch = null;
    let distractingMatch = null;
    let productiveMatch = null;

    for (const entry of this._words.values()) {
      // Skip expired schedule entries
      if (entry.schedule && entry.schedule.endDate) {
        const endDate = new Date(entry.schedule.endDate);
        if (endDate < new Date()) continue;
      }

      const needle = entry.word.toLowerCase();
      // Also check associated words if present
      const allNeedles = [needle];
      if (entry.associated_words && Array.isArray(entry.associated_words)) {
        allNeedles.push(...entry.associated_words.map(w => w.toLowerCase()));
      }
      // Also support camelCase associatedWords for backwards compat
      if (entry.associatedWords && Array.isArray(entry.associatedWords)) {
        allNeedles.push(...entry.associatedWords.map(w => w.toLowerCase()));
      }

      const matched = allNeedles.some((n) => {
        if (n.length <= 3) {
          // Short words: require word boundary match (whole word surrounded by non-alphanumeric)
          // e.g. "x" matches "Home / X" but not "example"
          try {
            const pattern = new RegExp(`(?<![a-zA-Z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-zA-Z0-9])`, 'i');
            return targets.some((t) => pattern.test(t));
          } catch {
            return targets.some((t) => t === n);
          }
        } else {
          // Longer words: substring match
          return targets.some((t) => t.includes(n));
        }
      });
      if (!matched) continue;

      // Keep the highest-priority match per list type
      switch (entry.list) {
        case 'blocked':
          // Skip if temporarily unblocked (matches Swift's hasActiveUnblock check)
          if (this._hasActiveUnblock(entry)) continue;
          if (!blockedMatch || entry.score > blockedMatch.score) {
            blockedMatch = entry;
          }
          break;
        case 'distracting':
          if (!distractingMatch || entry.score > distractingMatch.score) {
            distractingMatch = entry;
          }
          break;
        case 'productive':
          if (!productiveMatch) {
            productiveMatch = entry;
          }
          break;
      }
    }

    // Return highest priority match
    if (blockedMatch) {
      return { list: 'blocked', matchedWord: blockedMatch.word, score: blockedMatch.score };
    }
    if (distractingMatch) {
      return { list: 'distracting', matchedWord: distractingMatch.word, score: distractingMatch.score };
    }
    if (productiveMatch) {
      return { list: 'productive', matchedWord: productiveMatch.word, score: productiveMatch.score };
    }

    return { list: 'unknown', matchedWord: null, score: 5 };
  }

  /**
   * Returns all words as an array.
   * @returns {Array}
   */
  getWords() {
    return Array.from(this._words.values());
  }

  /**
   * Filter words by list type.
   * @param {'blocked'|'distracting'|'productive'} list
   * @returns {Array}
   */
  getWordsByList(list) {
    return this.getWords().filter((w) => w.list === list);
  }

  /**
   * Returns count stats for each list type.
   * @returns {{ blocked: number, distracting: number, productive: number, total: number }}
   */
  stats() {
    const words = this.getWords();
    return {
      blocked: words.filter((w) => w.list === 'blocked').length,
      distracting: words.filter((w) => w.list === 'distracting').length,
      productive: words.filter((w) => w.list === 'productive').length,
      total: words.length,
    };
  }
}
