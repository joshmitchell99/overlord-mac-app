/**
 * PomodoroService - Focus session timer with notifications.
 *
 * Session types: 'none' | 'regular' | 'focus'
 * Focus sessions have a countdown timer; regular sessions just track elapsed time.
 */

export class PomodoroService {
  constructor() {
    this.isActive = false
    this.sessionType = 'none' // 'none' | 'regular' | 'focus'
    this.duration = 25 * 60 // default 25 min in seconds
    this.remaining = 0
    this.startedAt = null
    this.timer = null
    this.onTick = null // callback(remaining)
    this.onComplete = null // callback()
    this.onStateChange = null // callback(state)
  }

  startFocusSession(durationMinutes) {
    this.stopSession()
    this.duration = durationMinutes * 60
    this.remaining = this.duration
    this.startedAt = Date.now()
    this.isActive = true
    this.sessionType = 'focus'
    this.timer = setInterval(() => this._tick(), 1000)
    this._notifyStateChange()
  }

  startRegularSession() {
    this.stopSession()
    this.isActive = true
    this.sessionType = 'regular'
    this.startedAt = Date.now()
    this._notifyStateChange()
  }

  stopSession() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.isActive = false
    this.sessionType = 'none'
    this.remaining = 0
    this.startedAt = null
    this._notifyStateChange()
  }

  _tick() {
    this.remaining = Math.max(0, this.remaining - 1)
    if (this.onTick) this.onTick(this.remaining)
    if (this.remaining <= 0) {
      this._complete()
    }
  }

  _complete() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.isActive = false
    this.sessionType = 'none'
    // Send system notification
    if (window.electronAPI?.sendNotification) {
      window.electronAPI.sendNotification('Focus Session Complete', 'Great work! Time for a break.')
    } else if (Notification.permission === 'granted') {
      new Notification('Focus Session Complete', { body: 'Great work! Time for a break.' })
    }
    if (this.onComplete) this.onComplete()
    this._notifyStateChange()
  }

  _notifyStateChange() {
    if (this.onStateChange) this.onStateChange(this.getState())
  }

  getState() {
    return {
      isActive: this.isActive,
      sessionType: this.sessionType,
      duration: this.duration,
      remaining: this.remaining,
      startedAt: this.startedAt,
      elapsed: this.startedAt ? Math.floor((Date.now() - this.startedAt) / 1000) : 0,
    }
  }

  formatTime(seconds) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }
}

// Singleton
export const pomodoro = new PomodoroService()
