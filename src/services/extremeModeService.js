/**
 * Extreme Mode Service
 *
 * Manages a LaunchAgent that restarts the app if force-quit.
 * Uses KeepAlive with SuccessfulExit=false so macOS restarts on abnormal exit
 * but not on clean quit.
 */

export class ExtremeModeService {
  constructor() {
    this.isEnabled = false
    this.onStateChange = null
  }

  async enable() {
    if (!window.electronAPI?.setExtremeMode) return false
    const result = await window.electronAPI.setExtremeMode(true)
    if (result.success) {
      this.isEnabled = true
      if (this.onStateChange) this.onStateChange(this.getState())
    }
    return result.success
  }

  async disable() {
    if (!window.electronAPI?.setExtremeMode) return false
    const result = await window.electronAPI.setExtremeMode(false)
    if (result.success) {
      this.isEnabled = false
      if (this.onStateChange) this.onStateChange(this.getState())
    }
    return result.success
  }

  async checkStatus() {
    if (!window.electronAPI?.getExtremeModeStatus) return
    const status = await window.electronAPI.getExtremeModeStatus()
    this.isEnabled = status.enabled
    if (this.onStateChange) this.onStateChange(this.getState())
  }

  getState() {
    return { isEnabled: this.isEnabled }
  }
}

export const extremeMode = new ExtremeModeService()
