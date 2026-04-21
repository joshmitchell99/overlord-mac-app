/**
 * AllowanceService - tracks temporarily unblocked apps.
 *
 * When a user successfully type-to-unblocks or gets an access request
 * approved, the app is allowed for N minutes.
 */

export class AllowanceService {
  constructor() {
    /** @type {Array<{ app: string, expiresAt: number }>} */
    this.allowances = []
  }

  /**
   * Grant temporary access to an app.
   * @param {string} app - app name or keyword to allow
   * @param {number} durationMinutes - how long to allow
   */
  grant(app, durationMinutes) {
    // Remove any existing allowance for this app
    this.allowances = this.allowances.filter(a => a.app.toLowerCase() !== app.toLowerCase())
    this.allowances.push({ app: app.toLowerCase(), expiresAt: Date.now() + durationMinutes * 60000 })
  }

  /**
   * Check if an app is currently allowed by any active allowance.
   * @param {string} appName
   * @param {string} windowTitle
   * @param {string|null} url
   * @returns {boolean}
   */
  isAllowed(appName, windowTitle, url) {
    // Clean expired
    this.allowances = this.allowances.filter(a => a.expiresAt > Date.now())
    // Check if any allowance matches (case-insensitive substring)
    const searchTexts = [appName, windowTitle, url].filter(Boolean).map(s => s.toLowerCase())
    return this.allowances.some(a => searchTexts.some(t => t.includes(a.app)))
  }

  /**
   * Get all active (non-expired) allowances.
   * @returns {Array<{ app: string, expiresAt: number }>}
   */
  getAll() {
    return this.allowances.filter(a => a.expiresAt > Date.now())
  }

  /**
   * Revoke an allowance for a specific app.
   * @param {string} app
   */
  revoke(app) {
    this.allowances = this.allowances.filter(a => a.app.toLowerCase() !== app.toLowerCase())
  }

  /** Clear all allowances. */
  clear() {
    this.allowances = []
  }

  /** Serialize for persistence. */
  toJSON() {
    return this.allowances
  }

  /** Load from persisted data. */
  loadFromJSON(arr) {
    this.allowances = arr || []
  }
}

// Singleton instance
export const allowanceService = new AllowanceService()
