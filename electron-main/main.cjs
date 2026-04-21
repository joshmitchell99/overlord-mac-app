const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, globalShortcut, systemPreferences, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

// Auto-updater (only available in production builds)
let autoUpdater = null
if (!app.isPackaged) {
  // Dev mode - no auto-updater
} else {
  try {
    autoUpdater = require('electron-updater').autoUpdater
  } catch { /* electron-updater not available */ }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let mainWindow = null
let scoreBarWindow = null  // floating score pill near menubar
let tray = null
let overlayHost = null     // native Swift overlay process
let overlayReady = false   // true once overlay-host signals ready
let monitorInterval = null
let appHistory = []        // last N app records from native monitor
let isBlockingActive = false
// Which overlay panel is currently up - 'blocking' | 'countdown' | null.
// Tracked via shown/dismissed events from overlay-host so we can target
// operations at a specific phase (e.g. only dismiss-if-countdown).
let currentOverlayType = null
let extremeModeEnabled = false

// Today samples buffer: coalesced activity samples for the current local day.
// Reset at local midnight (lazy, on next sample after rollover).
let todayBuffer = []
let lastSample = null
let currentDayKey = null
const TODAY_BUFFER_LIMIT = 20000
const MAX_SAMPLE_GAP_SECONDS = 30
// Regex to strip leading browser indicators (speaker/record emoji) and "(N)" unread counts.
const WINDOW_TITLE_PREFIX_RE = /^(?:[\u{1F509}\u{1F508}\u{1F507}\u{1F50A}\u{1F534}\u{1F4F9}\u{1F3A5}\u{1F399}]|\([0-9]+\)|\s)+/u

const isDev = !app.isPackaged
const APP_HISTORY_LIMIT = 50
const MONITOR_INTERVAL_MS = 3000

// ---------------------------------------------------------------------------
// Local JSON file store (persists score, allowances, app history)
// ---------------------------------------------------------------------------

function getStorePath() {
  const appData = app.getPath('userData') // ~/Library/Application Support/overlord-mac-react/
  return path.join(appData, 'local-state.json')
}

function readStore() {
  try {
    const data = fs.readFileSync(getStorePath(), 'utf-8')
    return JSON.parse(data)
  } catch {
    return {}
  }
}

function writeStore(data) {
  try {
    const storePath = getStorePath()
    fs.mkdirSync(path.dirname(storePath), { recursive: true })
    fs.writeFileSync(storePath, JSON.stringify(data, null, 2))
  } catch (err) {
    console.error('[store] Write error:', err.message)
  }
}

ipcMain.handle('store-get', (_event, key) => {
  return readStore()[key]
})

ipcMain.handle('store-set', (_event, key, value) => {
  const s = readStore()
  s[key] = value
  writeStore(s)
})

ipcMain.handle('store-get-all', () => {
  return readStore()
})

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

function getBaseURL() {
  if (isDev) return 'http://localhost:5173'
  return `file://${path.join(__dirname, '..', 'dist', 'index.html')}`
}

function getOverlayURL(route, data) {
  const base = getBaseURL()
  const json = JSON.stringify(data || {})
  const encoded = encodeURIComponent(json)
  const url = `${base}#/${route}?data=${encoded}`
  // WKWebView truncates very long URLs silently. Log the size so we can spot
  // when a payload is getting dangerously close to the limit.
  const pollLen = Array.isArray(data?.pollLog) ? data.pollLog.length : 0
  console.log(`[getOverlayURL] route=${route} json=${json.length}B urlLen=${url.length}B pollLog=${pollLen}`)
  if (url.length > 64_000) {
    console.warn(`[getOverlayURL] URL length ${url.length}B may exceed WKWebView limit`)
  }
  return url
}

// ---------------------------------------------------------------------------
// Native monitor binary path
// ---------------------------------------------------------------------------

function getNativePath(name) {
  if (isDev) {
    return path.join(__dirname, '..', 'native', name)
  }
  return path.join(process.resourcesPath, 'native', name)
}

// ---------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  })

  mainWindow.loadURL(getBaseURL())

  // Show once ready to avoid white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    app.dock.show()
  })

  // Hide instead of close - the app lives in the tray
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
      // Hide dock icon when window is hidden (tray-only mode)
      if (app.dock) app.dock.hide()
    }
  })
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow()
  } else {
    mainWindow.show()
    mainWindow.focus()
  }
  if (app.dock) app.dock.show()
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------

function createTray() {
  // Use a built-in macOS status icon as placeholder
  const icon = nativeImage.createFromNamedImage('NSStatusAvailable')
  tray = new Tray(icon)
  tray.setToolTip('Overlord')

  updateTrayMenu()

  // Click tray icon to toggle main window
  tray.on('click', () => {
    if (mainWindow && mainWindow.isVisible()) {
      mainWindow.hide()
      if (app.dock) app.dock.hide()
    } else {
      showMainWindow()
    }
  })
}

function updateTrayMenu() {
  const launchAtLogin = app.getLoginItemSettings().openAtLogin

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Overlord',
      click: () => showMainWindow(),
    },
    { type: 'separator' },
    {
      label: 'Launch at Login',
      type: 'checkbox',
      checked: launchAtLogin,
      click: (menuItem) => {
        app.setLoginItemSettings({ openAtLogin: menuItem.checked })
        updateTrayMenu()
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        if (isBlockingActive || extremeModeEnabled) {
          console.log('[main] Quit blocked - extreme mode or blocking active')
          return
        }
        app.isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)
}

// ---------------------------------------------------------------------------
// Native overlay host (Swift NSPanel + WKWebView at CGShieldingWindowLevel)
// ---------------------------------------------------------------------------

function startOverlayHost() {
  const binaryPath = getNativePath('overlay-host')
  const fs = require('fs')

  if (!fs.existsSync(binaryPath)) {
    console.warn(`[main] overlay-host binary not found at: ${binaryPath} - overlays disabled`)
    return
  }

  overlayHost = spawn(binaryPath, [], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  overlayHost.stdout.on('data', (chunk) => {
    const lines = chunk.toString().split('\n').filter(l => l.trim())
    for (const line of lines) {
      try {
        const msg = JSON.parse(line)
        console.log(`[overlay-host] ${JSON.stringify(msg)}`)

        if (msg.event === 'ready') {
          overlayReady = true
          console.log('[main] Overlay host ready')
        }
        if (msg.event === 'shown') {
          currentOverlayType = msg.type || null
        }
        if (msg.event === 'dismissed') {
          currentOverlayType = null
          // countdown is the tail of the blocking lifecycle - its dismissal
          // ends the overall block session.
          if (msg.type === 'blocking' || msg.type === 'countdown') {
            isBlockingActive = false
          }
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('overlay-dismissed', { type: msg.type })
          }
        }
        if (msg.event === 'overlay-action') {
          // Forward overlay actions (from WKWebView sendStatus) to the renderer
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('overlay-action', msg.data)
          }
        }
      } catch { /* ignore non-JSON output */ }
    }
  })

  overlayHost.stderr.on('data', (chunk) => {
    console.error(`[overlay-host stderr] ${chunk.toString()}`)
  })

  overlayHost.on('close', (code) => {
    console.log(`[main] overlay-host exited with code ${code}`)
    overlayHost = null
    overlayReady = false
  })

  overlayHost.on('error', (err) => {
    console.error(`[main] overlay-host spawn error: ${err.message}`)
  })
}

function sendToOverlayHost(command) {
  if (!overlayHost || !overlayReady) {
    console.warn('[main] overlay-host not ready, cannot send command')
    return false
  }
  try {
    overlayHost.stdin.write(JSON.stringify(command) + '\n')
    return true
  } catch (err) {
    console.error(`[main] Failed to send to overlay-host: ${err.message}`)
    return false
  }
}

function showBlockingOverlay(data) {
  const url = getOverlayURL('blocking', data)
  isBlockingActive = true
  sendToOverlayHost({ command: 'show', url, type: 'blocking', allScreens: true })
}

function showCheckinOverlay(data) {
  const url = getOverlayURL('checkin', data)
  sendToOverlayHost({ command: 'show', url, type: 'checkin', allScreens: false })
}

function dismissOverlay(type) {
  if (type === 'blocking') isBlockingActive = false
  sendToOverlayHost({ command: 'dismiss' })
}

// ---------------------------------------------------------------------------
// App monitoring loop
// ---------------------------------------------------------------------------

function startAppMonitoring() {
  const binaryPath = getNativePath('app-monitor')

  // Check if the binary exists before starting the loop
  const fs = require('fs')
  if (!fs.existsSync(binaryPath)) {
    console.warn(`[main] Native monitor binary not found at: ${binaryPath} - skipping monitoring`)
    return
  }

  console.log(`[main] Starting app monitoring with binary: ${binaryPath}`)

  monitorInterval = setInterval(() => {
    try {
      const child = spawn(binaryPath)
      let stdout = ''

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
      })

      child.stderr.on('data', (chunk) => {
        console.error(`[monitor stderr] ${chunk.toString()}`)
      })

      child.on('close', (code) => {
        if (code !== 0) {
          console.error(`[monitor] Process exited with code ${code}`)
          return
        }

        try {
          const appInfo = JSON.parse(stdout.trim())

          // Store in history ring buffer
          appHistory.push({
            ...appInfo,
            timestamp: Date.now(),
          })
          if (appHistory.length > APP_HISTORY_LIMIT) {
            appHistory = appHistory.slice(-APP_HISTORY_LIMIT)
          }

          // -----------------------------------------------------------------
          // Today samples buffer (coalesced by {appName, windowTitle})
          // -----------------------------------------------------------------
          try {
            const nowMs = Date.now()
            // Local 'YYYY-MM-DD' (en-CA locale yields ISO-style date in local tz).
            const todayKey = new Date().toLocaleDateString('en-CA')

            // Midnight rollover: reset the buffer when the day changes.
            if (currentDayKey !== todayKey) {
              todayBuffer = []
              lastSample = null
              currentDayKey = todayKey
            }

            // Normalize the incoming sample.
            const appName = (appInfo.app && String(appInfo.app).length > 0) ? String(appInfo.app) : ''
            const bundleId = appInfo.bundleId || null
            const rawTitle = appInfo.windowTitle == null ? '' : String(appInfo.windowTitle)
            const windowTitle = rawTitle.replace(WINDOW_TITLE_PREFIX_RE, '').trim()
            const url = appInfo.url || null

            // Skip entirely if no appName.
            if (appName.length > 0) {
              // Compute duration from previous sample, capping gaps (sleep/lock).
              let durationSeconds = 0
              if (lastSample !== null) {
                const gapMs = nowMs - lastSample.timestamp
                durationSeconds = Math.min(Math.floor(gapMs / 1000), MAX_SAMPLE_GAP_SECONDS)
                if (durationSeconds < 0) durationSeconds = 0
              }

              const lastEntry = todayBuffer.length > 0 ? todayBuffer[todayBuffer.length - 1] : null
              if (lastEntry && lastEntry.appName === appName && lastEntry.windowTitle === windowTitle) {
                // Coalesce into the existing entry.
                lastEntry.endTimestamp = nowMs
                lastEntry.durationSeconds += durationSeconds
                // Always overwrite URL with the latest (matches Swift behavior).
                lastEntry.url = url
              } else {
                todayBuffer.push({
                  timestamp: nowMs,
                  endTimestamp: nowMs,
                  durationSeconds: durationSeconds,
                  appName,
                  bundleId,
                  windowTitle,
                  url,
                })
                // Cap buffer size (drop oldest).
                if (todayBuffer.length > TODAY_BUFFER_LIMIT) {
                  todayBuffer = todayBuffer.slice(-TODAY_BUFFER_LIMIT)
                }
              }

              lastSample = { timestamp: nowMs, appName, windowTitle, url }
            }
          } catch (bufErr) {
            console.error(`[monitor] today-buffer error: ${bufErr.message}`)
          }

          // Send to renderer
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('app-status-update', appInfo)
          }
        } catch (parseErr) {
          console.error(`[monitor] Failed to parse output: ${parseErr.message}`)
        }
      })

      child.on('error', (err) => {
        console.error(`[monitor] Failed to spawn: ${err.message}`)
      })
    } catch (err) {
      console.error(`[monitor] Error in monitoring loop: ${err.message}`)
    }
  }, MONITOR_INTERVAL_MS)
}

function stopAppMonitoring() {
  if (monitorInterval) {
    clearInterval(monitorInterval)
    monitorInterval = null
  }
}

// ---------------------------------------------------------------------------
// Extreme Mode - LaunchAgent management
// ---------------------------------------------------------------------------

const os = require('os')

function getLaunchAgentPath() {
  return path.join(os.homedir(), 'Library', 'LaunchAgents', 'app.forfeit.overlord-react.plist')
}

function getAppPath() {
  if (isDev) {
    // In dev, point to the electron binary + project dir
    return process.execPath
  }
  // In production, point to the .app bundle
  return app.getPath('exe')
}

function installLaunchAgent() {
  const plistPath = getLaunchAgentPath()
  const appPath = getAppPath()

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>app.forfeit.overlord-react</string>
  <key>ProgramArguments</key>
  <array>
    <string>${appPath}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>5</integer>
</dict>
</plist>`

  try {
    fs.mkdirSync(path.dirname(plistPath), { recursive: true })
    fs.writeFileSync(plistPath, plist)
    // Load the agent
    const { execSync } = require('child_process')
    execSync(`launchctl load -w "${plistPath}"`, { timeout: 5000 })
    extremeModeEnabled = true
    console.log('[main] Extreme mode enabled - LaunchAgent installed')
    return { success: true }
  } catch (err) {
    console.error('[main] Failed to install LaunchAgent:', err.message)
    return { success: false, error: err.message }
  }
}

function removeLaunchAgent() {
  const plistPath = getLaunchAgentPath()

  try {
    const { execSync } = require('child_process')
    execSync(`launchctl unload -w "${plistPath}"`, { timeout: 5000 })
  } catch { /* ignore if not loaded */ }

  try {
    fs.unlinkSync(plistPath)
  } catch { /* ignore if doesn't exist */ }

  extremeModeEnabled = false
  console.log('[main] Extreme mode disabled - LaunchAgent removed')
  return { success: true }
}

function checkLaunchAgentStatus() {
  const plistPath = getLaunchAgentPath()
  const enabled = fs.existsSync(plistPath)
  extremeModeEnabled = enabled
  return { enabled }
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

ipcMain.handle('set-extreme-mode', (_event, enabled) => {
  if (enabled) return installLaunchAgent()
  return removeLaunchAgent()
})

ipcMain.handle('get-extreme-mode-status', () => {
  return checkLaunchAgentStatus()
})

ipcMain.handle('show-blocking-overlay', (_event, data) => {
  console.log(`[main] show-blocking-overlay received. overlayReady=${overlayReady} isBlockingActive=${isBlockingActive} currentType=${currentOverlayType} app=${data?.appName}`)
  // Mutual exclusion: don't show a block over a checkin.
  if (currentOverlayType === 'checkin') {
    console.log('[main] show-blocking-overlay SKIPPED - checkin is up')
    return false
  }
  showBlockingOverlay(data)
  return true
})

ipcMain.handle('show-checkin-overlay', (_event, data) => {
  // Mutual exclusion: don't show a checkin over a block or countdown.
  if (currentOverlayType === 'blocking' || currentOverlayType === 'countdown') {
    console.log(`[main] show-checkin-overlay SKIPPED - ${currentOverlayType} is up`)
    return false
  }
  showCheckinOverlay(data)
  return true
})

ipcMain.handle('dismiss-overlay', (_event, type) => {
  dismissOverlay(type)
  return true
})

// Sync-ish query for the renderer to inspect overlay state before triggering
// expensive work (e.g. avoid doing a checkin server call when a block is up).
ipcMain.handle('get-current-overlay-type', () => currentOverlayType)

// Early-dismiss the countdown panel (e.g. user switched away from the blocked
// app during grace). No-op if the current overlay is the block panel - we
// don't want to kill a full block just because a stray focus change fired.
ipcMain.handle('dismiss-countdown-if-active', () => {
  if (currentOverlayType === 'countdown') {
    console.log('[main] Early countdown dismiss (compliance detected)')
    dismissOverlay('countdown')
    return true
  }
  return false
})

ipcMain.handle('get-app-history', () => {
  return appHistory
})

// Today samples buffer (coalesced activity for the current local day).
ipcMain.handle('activity:get-today-buffer', () => {
  return todayBuffer.slice()
})

ipcMain.handle('activity:get-today-key', () => {
  return currentDayKey
})

ipcMain.handle('set-launch-at-login', (_event, enabled) => {
  app.setLoginItemSettings({ openAtLogin: enabled })
  updateTrayMenu()
  return true
})

ipcMain.handle('get-launch-at-login', () => app.getLoginItemSettings().openAtLogin)

ipcMain.handle('get-permissions', () => {
  // In dev mode (unsigned Electron binary), skip these native checks entirely
  // because they can SIGTRAP in macOS 14+ Chromium. Return optimistic defaults.
  if (isDev) {
    return {
      screenRecording: 'granted',
      accessibility: true,
      notifications: 'granted',
    }
  }
  let screenRecording = 'unknown'
  let accessibility = true
  try {
    screenRecording = systemPreferences.getMediaAccessStatus('screen')
  } catch (err) {
    console.error('[permissions] getMediaAccessStatus failed:', err.message)
  }
  try {
    accessibility = systemPreferences.isTrustedAccessibilityClient(false)
  } catch (err) {
    console.error('[permissions] isTrustedAccessibilityClient failed:', err.message)
  }
  return {
    screenRecording,
    accessibility,
    notifications: 'granted',
  }
})

ipcMain.handle('request-permission', async (_event, type) => {
  console.log(`[permission] request-permission: ${type}`)
  try {
    if (type === 'screen-recording') {
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
    } else if (type === 'accessibility') {
      // Just open System Settings - don't call isTrustedAccessibilityClient(true)
      // which crashes in unsigned dev builds
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
    } else if (type === 'notifications') {
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.notifications')
    } else if (type === 'sensitive-content') {
      // The exact anchor for Sensitive Content Warning has changed across
      // macOS versions and is not reliably documented. Try the known anchor
      // names first, then fall back to opening System Settings at the root
      // so the user can at least navigate there themselves.
      const { exec } = require('child_process')
      const candidates = [
        'x-apple.systempreferences:com.apple.preference.security?Privacy_SensitiveContentWarning',
        'x-apple.systempreferences:com.apple.preference.security?Privacy_SensitiveContent',
        'x-apple.systempreferences:com.apple.settings.PrivacySecurity',
        'x-apple.systempreferences:com.apple.preference.security',
      ]
      let opened = false
      for (const url of candidates) {
        try {
          await shell.openExternal(url)
          console.log(`[permission] sensitive-content opened via ${url}`)
          opened = true
          break
        } catch (e) {
          console.warn(`[permission] sensitive-content URL failed (${url}): ${e.message}`)
        }
      }
      if (!opened) {
        exec('open -b com.apple.systempreferences', (err) => {
          if (err) console.error('[permission] fallback exec failed:', err.message)
        })
      }
    }
  } catch (err) {
    console.error('[permission] openExternal failed:', err.message)
  }
  return true
})

ipcMain.handle('open-external', async (_event, url) => {
  try {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) {
      await shell.openExternal(url)
      return true
    }
    return false
  } catch (err) {
    console.error('[open-external] failed:', err.message)
    return false
  }
})

// ---------------------------------------------------------------------------
// Remote log push proxy - the renderer can't POST to Loki directly because
// the logging server doesn't send CORS headers. We forward the request from
// the main process (no CORS restrictions) and return success/error.
// ---------------------------------------------------------------------------
ipcMain.handle('remote-log-push', async (_event, endpoint, payload) => {
  try {
    if (typeof endpoint !== 'string' || !/^https?:\/\//.test(endpoint)) {
      return { ok: false, error: 'invalid endpoint' }
    }
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof payload === 'string' ? payload : JSON.stringify(payload),
    })
    return { ok: res.ok, status: res.status }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

ipcMain.handle('send-notification', (_event, title, body) => {
  const { Notification } = require('electron')
  if (Notification.isSupported()) {
    new Notification({ title, body }).show()
  }
  return true
})

ipcMain.handle('capture-screen', async (_event, quality, scale) => {
  const binaryPath = getNativePath('screen-capture')
  const os = require('os')

  if (!fs.existsSync(binaryPath)) {
    return { success: false, error: 'screen-capture binary not found' }
  }

  const outputPath = path.join(os.tmpdir(), `overlord-capture-${Date.now()}.jpg`)

  return new Promise((resolve) => {
    const child = spawn(binaryPath, [outputPath, '--quality', String(quality || 0.5), '--scale', String(scale || 0.5)])
    let stdout = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.on('close', (code) => {
      try {
        resolve(JSON.parse(stdout.trim()))
      } catch {
        resolve({ success: false, error: `Exit code ${code}` })
      }
    })
    child.on('error', (err) => resolve({ success: false, error: err.message }))
  })
})

ipcMain.handle('check-for-updates', () => {
  if (autoUpdater) {
    autoUpdater.checkForUpdatesAndNotify()
    return { checking: true }
  }
  return { checking: false, reason: 'Dev mode' }
})

ipcMain.handle('install-update', () => {
  if (autoUpdater) {
    autoUpdater.quitAndInstall()
    return true
  }
  return false
})

ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

// Report whether Apple's SensitiveContentAnalysis is enabled in System
// Settings. The binary exits immediately in --check-policy mode without
// needing an image, so it's cheap to call on every Settings mount.
ipcMain.handle('nsfw-check-policy', async () => {
  const binaryPath = getNativePath('nsfw-scan')
  if (!fs.existsSync(binaryPath)) return { enabled: false, reason: 'binary missing' }
  return new Promise((resolve) => {
    const child = spawn(binaryPath, ['--check-policy'])
    let stdout = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.on('close', () => {
      try { resolve(JSON.parse(stdout.trim())) }
      catch { resolve({ enabled: false, reason: 'parse error' }) }
    })
    child.on('error', (err) => resolve({ enabled: false, reason: err.message }))
  })
})

ipcMain.handle('nsfw-scan', async (_event, imagePath) => {
  const binaryPath = getNativePath('nsfw-scan')
  if (!fs.existsSync(binaryPath)) {
    return { result: 'error', error: 'nsfw-scan binary not found' }
  }
  return new Promise((resolve) => {
    const child = spawn(binaryPath, [imagePath])
    let stdout = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.on('close', () => {
      try { resolve(JSON.parse(stdout.trim())) }
      catch { resolve({ result: 'error', error: 'Failed to parse nsfw-scan output' }) }
    })
    child.on('error', (err) => resolve({ result: 'error', error: err.message }))
  })
})

ipcMain.handle('get-native-status', () => {
  return {
    monitorRunning: monitorInterval !== null,
    overlayActive: isBlockingActive,
    overlayHostReady: overlayReady,
  }
})

// ---------------------------------------------------------------------------
// Monitoring control (stop/start from renderer)
// ---------------------------------------------------------------------------

ipcMain.handle('monitoring:stop', () => {
  stopAppMonitoring()
  console.log('[main] Monitoring stopped via IPC')
  return { stopped: true, at: Date.now() }
})

ipcMain.handle('monitoring:start', () => {
  // Guard against double-start (idempotent)
  if (monitorInterval !== null) {
    return { started: true, at: Date.now(), alreadyRunning: true }
  }
  startAppMonitoring()
  console.log('[main] Monitoring started via IPC')
  return { started: true, at: Date.now() }
})

ipcMain.handle('monitoring:status', () => {
  return { running: monitorInterval !== null }
})

// ---------------------------------------------------------------------------
// Native app icons - resolves bundleId to .app path, fetches icon as data URL
// ---------------------------------------------------------------------------

const appIconCache = new Map() // bundleId -> dataURL

// Resolve a bundleId to a .app path using NSWorkspace (via osascript).
// This matches how the Swift Mac app does it and works without Spotlight indexing.
function resolveAppPath(bundleId) {
  const { execSync } = require('child_process')
  // Sanitize - only allow reverse-domain chars to prevent shell injection
  if (!/^[a-zA-Z0-9.\-_]+$/.test(bundleId)) return null

  // Primary: osascript wrapping NSWorkspace
  try {
    const out = execSync(
      `osascript -e 'POSIX path of (path to application id "${bundleId}")'`,
      { timeout: 2000, encoding: 'utf-8' }
    ).trim()
    if (out) return out.replace(/\/$/, '')
  } catch { /* try fallback */ }

  // Fallback: mdfind (Spotlight)
  try {
    const out = execSync(
      `mdfind "kMDItemCFBundleIdentifier == '${bundleId}'" | head -1`,
      { timeout: 2000, encoding: 'utf-8' }
    ).trim()
    if (out) return out
  } catch { /* give up */ }

  return null
}

ipcMain.handle('get-app-icon', async (_event, bundleId) => {
  if (!bundleId) return null
  if (appIconCache.has(bundleId)) return appIconCache.get(bundleId)

  // Skip in dev - app.getFileIcon can SIGTRAP in unsigned Electron builds
  if (isDev) {
    appIconCache.set(bundleId, null)
    return null
  }

  try {
    const appPath = resolveAppPath(bundleId)
    if (!appPath) {
      appIconCache.set(bundleId, null)
      return null
    }

    const icon = await app.getFileIcon(appPath, { size: 'large' })
    if (icon.isEmpty()) {
      appIconCache.set(bundleId, null)
      return null
    }
    const dataURL = icon.toDataURL()
    appIconCache.set(bundleId, dataURL)
    return dataURL
  } catch (err) {
    console.log(`[get-app-icon] Error for bundleId=${bundleId}:`, err.message)
    appIconCache.set(bundleId, null)
    return null
  }
})

// ---------------------------------------------------------------------------
// Floating score bar window (menubar-adjacent pill + popover)
// ---------------------------------------------------------------------------

const SCORE_BAR_PILL_WIDTH = 130
const SCORE_BAR_PILL_HEIGHT = 22
const SCORE_BAR_EXPANDED_WIDTH = 380
const SCORE_BAR_EXPANDED_HEIGHT = 450

function getScoreBarURL() {
  const base = getBaseURL()
  return `${base}#/scorebar`
}

function getMenuBarPillY() {
  // macOS menubar is 24px on non-notch, 37px on notch Macs.
  // The pill should be vertically centered inside it.
  const display = screen.getPrimaryDisplay()
  const menuBarHeight = display.workArea.y || 24
  return Math.round((menuBarHeight - SCORE_BAR_PILL_HEIGHT) / 2)
}

function createScoreBarWindow() {
  scoreBarWindow = new BrowserWindow({
    width: SCORE_BAR_PILL_WIDTH,
    height: SCORE_BAR_PILL_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Use 'screen-saver' level - this is the highest level and ensures
  // the window renders ON TOP of the menubar, matching the Swift app's
  // CGWindowLevelForKey(.statusWindow) behavior.
  scoreBarWindow.setAlwaysOnTop(true, 'screen-saver')

  // Keep it on all spaces / desktops
  scoreBarWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false })

  scoreBarWindow.loadURL(getScoreBarURL())

  scoreBarWindow.once('ready-to-show', () => {
    // Position AFTER show so Electron doesn't clamp to workArea.
    // Use setBounds with screen coordinates - y=0 is top of screen at this level.
    const y = getMenuBarPillY()
    scoreBarWindow.setBounds({ x: 250, y, width: SCORE_BAR_PILL_WIDTH, height: SCORE_BAR_PILL_HEIGHT })
    scoreBarWindow.show()
  })

  scoreBarWindow.on('closed', () => {
    scoreBarWindow = null
  })
}

// IPC: renderer sends score updates -> forwarded to score bar window
ipcMain.on('score-bar-update', (_event, data) => {
  if (scoreBarWindow && !scoreBarWindow.isDestroyed()) {
    scoreBarWindow.webContents.send('score-bar-update', data)
  }
})

// IPC: score bar requests resize when popover expands/collapses
ipcMain.handle('resize-score-bar', (_event, expanded) => {
  if (!scoreBarWindow || scoreBarWindow.isDestroyed()) return

  if (expanded) {
    scoreBarWindow.setBounds({
      x: 250,
      y: 0,
      width: SCORE_BAR_EXPANDED_WIDTH,
      height: SCORE_BAR_EXPANDED_HEIGHT,
    })
    scoreBarWindow.setFocusable(true)
    scoreBarWindow.focus()
  } else {
    const y = getMenuBarPillY()
    scoreBarWindow.setBounds({
      x: 250,
      y,
      width: SCORE_BAR_PILL_WIDTH,
      height: SCORE_BAR_PILL_HEIGHT,
    })
    scoreBarWindow.setFocusable(false)
  }
})

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

// Don't quit when all windows are closed - the app lives in the tray
app.on('window-all-closed', () => {
  // Do nothing - keep running in tray
})

// Block Cmd+Q while blocking overlay or extreme mode is active
app.on('before-quit', (e) => {
  if (isBlockingActive || extremeModeEnabled) {
    e.preventDefault()
    console.log('[main] Quit prevented - extreme mode or blocking overlay is active')
    return
  }
  app.isQuitting = true
})

app.on('activate', () => {
  showMainWindow()
})

app.whenReady().then(() => {
  // Sync extreme mode state from LaunchAgent on disk
  checkLaunchAgentStatus()

  createTray()
  createMainWindow()
  createScoreBarWindow()
  startOverlayHost()
  startAppMonitoring()

  // Debug shortcuts for testing overlays
  const blockRegistered = globalShortcut.register('CommandOrControl+Shift+B', () => {
    console.log('[shortcut] Triggering blocking overlay (via renderer for auth)')
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('trigger-blocking')
    }
  })
  globalShortcut.register('CommandOrControl+Shift+C', () => {
    console.log('[shortcut] Triggering real check-in')
    // Ask renderer to trigger a real check-in with real pollLog data
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('trigger-checkin')
    }
  })
  globalShortcut.register('CommandOrControl+Shift+D', () => {
    console.log('[shortcut] Dismissing overlays')
    dismissOverlay('blocking')
    dismissOverlay('checkin')
  })

  // Secret emergency bypass: Cmd+Shift+Option+Escape
  // Force-dismiss all overlays, disable extreme mode, and quit the app
  globalShortcut.register('CommandOrControl+Shift+Alt+Escape', () => {
    console.log('[shortcut] EMERGENCY BYPASS - force quitting')
    try {
      dismissOverlay('blocking')
      dismissOverlay('checkin')
    } catch {}
    extremeModeEnabled = false
    isBlockingActive = false
    // Also unload the LaunchAgent if extreme mode was enabled
    try {
      const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', 'app.forfeit.overlord-react.plist')
      if (fs.existsSync(plistPath)) {
        const { execSync } = require('child_process')
        execSync(`launchctl unload -w "${plistPath}"`, { timeout: 3000 })
        fs.unlinkSync(plistPath)
        console.log('[shortcut] LaunchAgent removed')
      }
    } catch (err) {
      console.error('[shortcut] LaunchAgent cleanup failed:', err.message)
    }
    // Kill the overlay host process
    if (overlayHost) {
      try { overlayHost.kill('SIGKILL') } catch {}
      overlayHost = null
    }
    app.isQuitting = true
    app.exit(0)
  })

  // Auto-update: check on launch and every 4 hours
  if (autoUpdater) {
    autoUpdater.checkForUpdatesAndNotify()

    setInterval(() => {
      autoUpdater.checkForUpdatesAndNotify()
    }, 4 * 60 * 60 * 1000)

    autoUpdater.on('update-available', (info) => {
      console.log('[updater] Update available:', info.version)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-status', { status: 'available', version: info.version })
      }
    })

    autoUpdater.on('update-downloaded', (info) => {
      console.log('[updater] Update downloaded:', info.version)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-status', { status: 'downloaded', version: info.version })
      }
    })

    autoUpdater.on('error', (err) => {
      console.error('[updater] Error:', err.message)
    })
  }
})

app.on('will-quit', () => {
  stopAppMonitoring()
  // Clean up overlay host
  if (overlayHost) {
    sendToOverlayHost({ command: 'quit' })
    overlayHost = null
  }
})
