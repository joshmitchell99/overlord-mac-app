/**
 * Screen Capture Service - manages periodic screenshot capture via native Swift binary.
 *
 * Spawns the native screen-capture binary on a timer, tracks session state,
 * and fires callbacks on each successful capture.
 */

export class ScreenCaptureService {
  constructor() {
    this.isRecording = false
    this.captureInterval = 60 // seconds between captures
    this.timer = null
    this.screenshotCount = 0
    this.sessionId = null
    this.quality = 0.5
    this.scale = 0.5
    this.onCapture = null // callback({ path, width, height, bytes })
    this.onStateChange = null
  }

  startRecording(options = {}) {
    this.stopRecording()
    this.captureInterval = options.interval || 60
    this.quality = options.quality || 0.5
    this.scale = options.scale || 0.5
    this.sessionId = `session_${Date.now()}`
    this.screenshotCount = 0
    this.isRecording = true

    // Capture immediately
    this._capture()

    // Then on interval
    this.timer = setInterval(() => this._capture(), this.captureInterval * 1000)
    if (this.onStateChange) this.onStateChange(this.getState())
  }

  stopRecording() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.isRecording = false
    this.sessionId = null
    if (this.onStateChange) this.onStateChange(this.getState())
  }

  async _capture() {
    if (!window.electronAPI?.captureScreen) return

    try {
      const result = await window.electronAPI.captureScreen(this.quality, this.scale)
      if (result && result.success) {
        this.screenshotCount++
        if (this.onCapture) this.onCapture(result)
        if (this.onStateChange) this.onStateChange(this.getState())
      } else {
        console.error('[ScreenCapture] Capture returned failure:', result?.error)
      }
    } catch (err) {
      console.error('[ScreenCapture] Capture failed:', err)
    }
  }

  getState() {
    return {
      isRecording: this.isRecording,
      captureInterval: this.captureInterval,
      screenshotCount: this.screenshotCount,
      sessionId: this.sessionId,
    }
  }
}

export const screenCapture = new ScreenCaptureService()
