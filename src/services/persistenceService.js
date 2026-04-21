/**
 * PersistenceService - saves and restores local state (score)
 * via Electron IPC to a JSON file in the app data directory.
 *
 * Temporary unblocks are now persisted via unblock_until on word entries
 * in Firebase (matching Swift), not in local state.
 */

export class PersistenceService {
  constructor() {
    this.saveInterval = null
  }

  async restore(scoreService) {
    if (!window.electronAPI?.storeGet) return

    // Restore score state
    const scoreState = await window.electronAPI.storeGet('scoreState')
    if (scoreState) {
      scoreService.currentScore = scoreState.currentScore || 0
      scoreService.distractingRate = scoreState.distractingRate ?? 0.03
      scoreService.unknownRate = scoreState.unknownRate ?? 0.04
      scoreService.productiveDecayRate = scoreState.productiveDecayRate ?? 0.1
      scoreService.passiveDecayRate = scoreState.passiveDecayRate ?? 0.1
      scoreService.threshold = scoreState.threshold ?? 50
      if (scoreState.snoozedUntil && scoreState.snoozedUntil > Date.now()) {
        scoreService.snoozedUntil = scoreState.snoozedUntil
      }
      // Restore pollLog - keep up to 30 days of history
      if (Array.isArray(scoreState.pollLog)) {
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
        scoreService.pollLog = scoreState.pollLog.filter(e => e.timestamp > thirtyDaysAgo)
      }
    }
  }

  startAutoSave(scoreService, intervalMs = 30000) {
    this.saveInterval = setInterval(() => {
      this.save(scoreService)
    }, intervalMs)
  }

  stopAutoSave() {
    if (this.saveInterval) {
      clearInterval(this.saveInterval)
      this.saveInterval = null
    }
  }

  async save(scoreService) {
    if (!window.electronAPI?.storeSet) return

    // Trim pollLog to 30 days before writing - keeps the JSON file bounded
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    if (Array.isArray(scoreService.pollLog)) {
      scoreService.pollLog = scoreService.pollLog.filter(e => e.timestamp > thirtyDaysAgo)
    }

    await window.electronAPI.storeSet('scoreState', scoreService.getState())
    await window.electronAPI.storeSet('lastSaved', Date.now())
  }
}

export const persistence = new PersistenceService()
