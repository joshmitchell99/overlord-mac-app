const LOKI_ENDPOINT = 'https://forfeit-logging-40d08dbe3a96.herokuapp.com/loki/api/v1/push'
const SERVICE_NAME = 'overlord-mac-react'
const BATCH_INTERVAL = 10000 // 10 seconds
const MAX_BATCH_SIZE = 50

class RemoteLogger {
  constructor() {
    this.buffer = []
    this.batchTimer = null
    this.userEmail = null
    this.minLevel = 'info' // 'debug' | 'info' | 'warning' | 'error'
  }

  setUser(email) {
    this.userEmail = email
  }

  start() {
    this.batchTimer = setInterval(() => this.flush(), BATCH_INTERVAL)
  }

  stop() {
    this.flush()
    if (this.batchTimer) clearInterval(this.batchTimer)
    this.batchTimer = null
  }

  debug(message, context = {}) { this._log('debug', message, context) }
  info(message, context = {}) { this._log('info', message, context) }
  warn(message, context = {}) { this._log('warning', message, context) }
  error(message, context = {}) { this._log('error', message, context) }

  _log(level, message, context) {
    const levels = { debug: 0, info: 1, warning: 2, error: 3 }
    if ((levels[level] || 0) < (levels[this.minLevel] || 0)) return

    this.buffer.push({
      timestamp: Date.now(),
      level,
      message,
      context,
    })

    // Flush immediately on error
    if (level === 'error') {
      this.flush()
    }

    // Cap buffer size
    if (this.buffer.length > MAX_BATCH_SIZE) {
      this.flush()
    }
  }

  async flush() {
    if (this.buffer.length === 0) return

    const entries = [...this.buffer]
    this.buffer = []

    const labels = {
      service_name: SERVICE_NAME,
      level: 'info', // Loki requires a base label
    }
    if (this.userEmail) {
      labels.user_id = this.userEmail
    }

    // Format for Loki push API
    const streams = []

    // Group by level for better Loki querying
    const byLevel = {}
    for (const entry of entries) {
      if (!byLevel[entry.level]) byLevel[entry.level] = []
      byLevel[entry.level].push(entry)
    }

    for (const [level, levelEntries] of Object.entries(byLevel)) {
      const streamLabels = { ...labels, level }
      const values = levelEntries.map(e => {
        const ts = String(e.timestamp * 1000000) // nanoseconds
        const line = JSON.stringify({
          message: e.message,
          ...e.context,
          user_id: this.userEmail,
          timestamp: new Date(e.timestamp).toISOString(),
        })
        return [ts, line]
      })

      streams.push({ stream: streamLabels, values })
    }

    try {
      const body = { streams }
      // Route through the Electron main process when available - the Loki
      // endpoint doesn't send CORS headers, so a direct fetch from the
      // renderer gets blocked by the browser. The main process has no such
      // restriction.
      const api = typeof window !== 'undefined' ? window.electronAPI : null
      if (api && typeof api.remoteLogPush === 'function') {
        await api.remoteLogPush(LOKI_ENDPOINT, body)
      } else {
        await fetch(LOKI_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }
    } catch (err) {
      // Log locally if remote logging fails - don't recurse
      console.error('[RemoteLogger] Flush failed:', err.message)
    }
  }
}

export const remoteLogger = new RemoteLogger()
