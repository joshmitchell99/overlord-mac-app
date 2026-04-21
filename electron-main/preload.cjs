const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Overlay controls
  showBlockingOverlay: (data) => ipcRenderer.invoke('show-blocking-overlay', data),
  showCheckinOverlay: (data) => ipcRenderer.invoke('show-checkin-overlay', data),
  dismissOverlay: (type) => ipcRenderer.invoke('dismiss-overlay', type),
  dismissCountdownIfActive: () => ipcRenderer.invoke('dismiss-countdown-if-active'),
  getCurrentOverlayType: () => ipcRenderer.invoke('get-current-overlay-type'),

  // App monitoring
  getAppHistory: () => ipcRenderer.invoke('get-app-history'),
  getTodayBuffer: () => ipcRenderer.invoke('activity:get-today-buffer'),
  getTodayKey: () => ipcRenderer.invoke('activity:get-today-key'),
  onAppStatusUpdate: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('app-status-update', handler)
    // Return cleanup function
    return () => ipcRenderer.removeListener('app-status-update', handler)
  },

  // System settings
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke('set-launch-at-login', enabled),
  getLaunchAtLogin: () => ipcRenderer.invoke('get-launch-at-login'),
  getNativeStatus: () => ipcRenderer.invoke('get-native-status'),

  // Monitoring control
  stopMonitoring: () => ipcRenderer.invoke('monitoring:stop'),
  startMonitoring: () => ipcRenderer.invoke('monitoring:start'),
  getMonitoringStatus: () => ipcRenderer.invoke('monitoring:status'),

  // Permissions
  getPermissions: () => ipcRenderer.invoke('get-permissions'),
  requestPermission: (type) => ipcRenderer.invoke('request-permission', type),

  // Local persistence store
  storeGet: (key) => ipcRenderer.invoke('store-get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store-set', key, value),
  storeGetAll: () => ipcRenderer.invoke('store-get-all'),

  // Overlay action listener (forwarded from native overlay host)
  onOverlayAction: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('overlay-action', handler)
    return () => ipcRenderer.removeListener('overlay-action', handler)
  },

  // Fires when the native overlay panel actually closes, for any reason
  // (user dismiss, grant, external kill, etc). Authoritative "overlay is gone" signal.
  onOverlayDismissed: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('overlay-dismissed', handler)
    return () => ipcRenderer.removeListener('overlay-dismissed', handler)
  },

  // Screen capture
  captureScreen: (quality, scale) => ipcRenderer.invoke('capture-screen', quality, scale),

  // NSFW content scanning
  nsfwScan: (imagePath) => ipcRenderer.invoke('nsfw-scan', imagePath),
  nsfwCheckPolicy: () => ipcRenderer.invoke('nsfw-check-policy'),

  // Notifications
  sendNotification: (title, body) => ipcRenderer.invoke('send-notification', title, body),

  // Extreme mode
  setExtremeMode: (enabled) => ipcRenderer.invoke('set-extreme-mode', enabled),
  getExtremeModeStatus: () => ipcRenderer.invoke('get-extreme-mode-status'),

  // Auto-update
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onUpdateStatus: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('update-status', handler)
    return () => ipcRenderer.removeListener('update-status', handler)
  },

  // Floating score bar
  sendScoreBarUpdate: (data) => ipcRenderer.send('score-bar-update', data),
  onScoreBarUpdate: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('score-bar-update', handler)
    return () => ipcRenderer.removeListener('score-bar-update', handler)
  },
  resizeScoreBar: (expanded) => ipcRenderer.invoke('resize-score-bar', expanded),

  // Native app icon (macOS .app icons by bundle ID)
  getAppIcon: (bundleId) => ipcRenderer.invoke('get-app-icon', bundleId),

  // Debug: trigger a real check-in from the renderer
  onTriggerCheckin: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('trigger-checkin', handler)
    return () => ipcRenderer.removeListener('trigger-checkin', handler)
  },

  // Debug: trigger blocking overlay from the renderer (uses real auth)
  onTriggerBlocking: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('trigger-blocking', handler)
    return () => ipcRenderer.removeListener('trigger-blocking', handler)
  },

  // Open an external URL in the default browser
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Remote log push proxy (avoids CORS from the renderer)
  remoteLogPush: (endpoint, payload) => ipcRenderer.invoke('remote-log-push', endpoint, payload),

  // Environment flag
  isElectron: true,
})
