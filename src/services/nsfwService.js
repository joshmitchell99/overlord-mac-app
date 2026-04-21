/**
 * NSFW Detection Service - hooks into screen captures and scans for
 * sensitive content using Apple's SensitiveContentAnalysis framework
 * via the native nsfw-scan binary.
 *
 * When NSFW content is flagged, fires onFlagged callback (wired in
 * services/index.js to spike the reassessment score).
 */

export class NSFWService {
  constructor() {
    this.isEnabled = true
    this.lastResult = 'clean' // clean, flagged, error, skipped
    this.flagCountToday = 0
    this.scanCountToday = 0
    this.onFlagged = null // callback - called when NSFW detected
    this._originalOnCapture = null
  }

  /**
   * Start scanning by hooking into an existing ScreenCaptureService.
   * Each time a screenshot is captured, we also run NSFW analysis on it.
   */
  startScanning(screenCaptureService) {
    if (!screenCaptureService) return

    // Preserve any existing onCapture callback so we don't break it
    this._originalOnCapture = screenCaptureService.onCapture

    screenCaptureService.onCapture = (captureResult) => {
      // Call the original callback first
      if (this._originalOnCapture) {
        this._originalOnCapture(captureResult)
      }

      // Then run NSFW scan if we got a valid capture with a file path
      if (captureResult && captureResult.success && captureResult.path) {
        this._scan(captureResult.path)
      }
    }
  }

  /**
   * Stop scanning - restore the original onCapture callback.
   */
  stopScanning(screenCaptureService) {
    if (screenCaptureService) {
      screenCaptureService.onCapture = this._originalOnCapture || null
    }
    this._originalOnCapture = null
  }

  async _scan(imagePath) {
    if (!this.isEnabled || !window.electronAPI?.nsfwScan) return

    try {
      this.scanCountToday++
      const result = await window.electronAPI.nsfwScan(imagePath)
      this.lastResult = result.result

      if (result.result === 'flagged') {
        this.flagCountToday++
        console.warn('[NSFW] Content flagged!')
        if (this.onFlagged) this.onFlagged()
      }
    } catch (err) {
      console.error('[NSFW] Scan error:', err)
      this.lastResult = 'error'
    }
  }

  resetDailyCounters() {
    this.flagCountToday = 0
    this.scanCountToday = 0
  }

  getState() {
    return {
      isEnabled: this.isEnabled,
      lastResult: this.lastResult,
      flagCountToday: this.flagCountToday,
      scanCountToday: this.scanCountToday,
    }
  }
}

export const nsfw = new NSFWService()
