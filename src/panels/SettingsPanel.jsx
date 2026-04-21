import React, { useState, useEffect } from 'react'
import {
  Play,
  Monitor,
  Info,
  Link2,
  Bell,
  Video,
  Lock,
  CreditCard,
  Zap,
  Eye,
  ShieldAlert,
} from 'lucide-react'
import { screenCapture, nsfw, subscription } from '../services'

// ---------------------------------------------------------------------------
// PermissionRow - one row inside the Permissions card
// ---------------------------------------------------------------------------

function PermissionRow({ icon: Icon, color, title, description, onManage, isLast }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        borderBottom: isLast ? 'none' : '1px solid var(--border)',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={18} color="#fff" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)' }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>{description}</div>
      </div>
      <button
        onClick={onManage}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#3b82f6',
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
          padding: '4px 8px',
        }}
      >
        Manage
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ToggleSwitch - simple styled toggle button
// ---------------------------------------------------------------------------

function ToggleSwitch({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 42,
        height: 24,
        borderRadius: 12,
        border: 'none',
        background: checked ? '#22C55E' : 'var(--muted)',
        position: 'relative',
        cursor: 'pointer',
        padding: 0,
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 20 : 2,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }}
      />
    </button>
  )
}

export default function SettingsPanel() {
  // -- Permissions --
  const [permissions, setPermissions] = useState({
    accessibility: false,
    screenRecording: 'unknown',
    notifications: 'granted',
    sensitiveContent: false,
  })

  useEffect(() => {
    async function refresh() {
      if (window.electronAPI?.getPermissions) {
        try {
          const p = await window.electronAPI.getPermissions()
          let sensitiveContent = false
          if (window.electronAPI?.nsfwCheckPolicy) {
            try {
              const policy = await window.electronAPI.nsfwCheckPolicy()
              sensitiveContent = !!policy?.enabled
            } catch (err) {
              console.error('[SettingsPanel] nsfwCheckPolicy error:', err)
            }
          }
          setPermissions({ ...p, sensitiveContent })
        } catch (err) {
          console.error('[SettingsPanel] getPermissions error:', err)
        }
      }
    }
    refresh()
    const interval = setInterval(refresh, 5000)
    return () => clearInterval(interval)
  }, [])

  // -- Launch at Login --
  const [launchAtLogin, setLaunchAtLoginState] = useState(false)

  useEffect(() => {
    if (window.electronAPI?.getLaunchAtLogin) {
      window.electronAPI.getLaunchAtLogin().then((val) => setLaunchAtLoginState(!!val))
    }
  }, [])

  async function toggleLaunchAtLogin(next) {
    if (window.electronAPI?.setLaunchAtLogin) {
      await window.electronAPI.setLaunchAtLogin(next)
    }
    setLaunchAtLoginState(next)
  }

  // -- Monitor on Launch --
  const [monitorOnLaunch, setMonitorOnLaunch] = useState(true)

  useEffect(() => {
    if (window.electronAPI?.storeGet) {
      window.electronAPI.storeGet('monitorOnLaunch').then((val) => {
        // Default to true when unset
        setMonitorOnLaunch(val === undefined || val === null ? true : !!val)
      })
    }
  }, [])

  async function toggleMonitorOnLaunch(next) {
    if (window.electronAPI?.storeSet) {
      await window.electronAPI.storeSet('monitorOnLaunch', next)
    }
    setMonitorOnLaunch(next)
  }

  // -- NSFW Detection --
  const [nsfwEnabled, setNsfwEnabled] = useState(nsfw?.isEnabled ?? true)
  const toggleNsfw = (enabled) => {
    setNsfwEnabled(enabled)
    if (nsfw) nsfw.isEnabled = enabled
  }

  // -- Screen Recording --
  const [screenRecordingEnabled, setScreenRecordingEnabled] = useState(false)
  const [screenRecordingInterval, setScreenRecordingInterval] = useState(60)
  const [screenRecordingQuality, setScreenRecordingQuality] = useState('medium')

  useEffect(() => {
    if (!window.electronAPI?.storeGet) return
    Promise.all([
      window.electronAPI.storeGet('screenRecordingEnabled'),
      window.electronAPI.storeGet('screenRecordingInterval'),
      window.electronAPI.storeGet('screenRecordingQuality'),
    ]).then(([enabled, intervalVal, qualityVal]) => {
      setScreenRecordingEnabled(!!enabled)
      if (typeof intervalVal === 'number') setScreenRecordingInterval(intervalVal)
      if (typeof qualityVal === 'string') setScreenRecordingQuality(qualityVal)
    })
  }, [])

  function getQualityParams(name) {
    if (name === 'low') return { quality: 0.3, scale: 0.3 }
    if (name === 'high') return { quality: 0.8, scale: 0.75 }
    return { quality: 0.5, scale: 0.5 } // medium
  }

  async function toggleScreenRecording(next) {
    if (window.electronAPI?.storeSet) {
      await window.electronAPI.storeSet('screenRecordingEnabled', next)
    }
    setScreenRecordingEnabled(next)
    if (!screenCapture) return
    if (next) {
      const { quality, scale } = getQualityParams(screenRecordingQuality)
      screenCapture.startRecording({ interval: screenRecordingInterval, quality, scale })
    } else {
      screenCapture.stopRecording()
    }
  }

  async function updateScreenRecordingInterval(val) {
    const parsed = parseInt(val, 10)
    setScreenRecordingInterval(parsed)
    if (window.electronAPI?.storeSet) {
      await window.electronAPI.storeSet('screenRecordingInterval', parsed)
    }
    if (screenRecordingEnabled && screenCapture) {
      const { quality, scale } = getQualityParams(screenRecordingQuality)
      screenCapture.startRecording({ interval: parsed, quality, scale })
    }
  }

  async function updateScreenRecordingQuality(val) {
    setScreenRecordingQuality(val)
    if (window.electronAPI?.storeSet) {
      await window.electronAPI.storeSet('screenRecordingQuality', val)
    }
    if (screenRecordingEnabled && screenCapture) {
      const { quality, scale } = getQualityParams(val)
      screenCapture.startRecording({ interval: screenRecordingInterval, quality, scale })
    }
  }

  // -- Subscription --
  const [subState, setSubState] = useState(subscription.getState())

  useEffect(() => {
    const unsub = subscription.subscribe((s) => setSubState(s))
    return unsub
  }, [])

  // Derive display tier. If freeSubscription is on, show as "Pro" (matches
  // Swift's hasValidSubscription semantics).
  const rawTier = subState.subscriptionStatus || 'none'
  const displayTier = rawTier === 'none' && subState.freeSubscription ? 'pro' : rawTier
  const tierKey = (displayTier === 'none' ? 'free' : displayTier).toLowerCase()
  const tierLabelMap = {
    free: { label: 'Free', color: '#6b7280', description: 'Basic features' },
    premium: { label: 'Premium', color: '#3b82f6', description: 'Full access to core features' },
    pro: { label: 'Pro', color: '#8b5cf6', description: 'All features plus priority support' },
    overlord: { label: 'Overlord', color: '#ef4444', description: 'Maximum tier with all features' },
  }
  const tierInfo = tierLabelMap[tierKey] || tierLabelMap.free

  function handleManageSubscription() {
    subscription.openBillingPortal()
  }

  function handleUpgrade() {
    subscription.initiateStripeCheckout()
  }

  function handleRefreshSubscription() {
    subscription.checkStripeSubscription()
  }

  const subscriptionTier = tierKey
  const lastCheckLabel = subState.lastCheckTime
    ? subState.lastCheckTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null

  // -- App version + update --
  const [appVersion, setAppVersion] = useState('...')
  const [updateStatus, setUpdateStatus] = useState(null) // null | 'checking' | 'available' | 'downloaded'

  useEffect(() => {
    if (window.electronAPI?.getAppVersion) {
      window.electronAPI.getAppVersion().then((v) => setAppVersion(v))
    } else {
      setAppVersion('dev')
    }
    if (window.electronAPI?.onUpdateStatus) {
      const cleanup = window.electronAPI.onUpdateStatus((data) => {
        setUpdateStatus(data.status)
      })
      return cleanup
    }
  }, [])

  function checkForUpdates() {
    if (window.electronAPI?.checkForUpdates) {
      setUpdateStatus('checking')
      window.electronAPI.checkForUpdates().then((res) => {
        if (!res.checking) setUpdateStatus(null)
      })
      // Reset checking state after timeout if no response
      setTimeout(() => {
        setUpdateStatus((prev) => (prev === 'checking' ? null : prev))
      }, 15000)
    }
  }

  function installUpdate() {
    if (window.electronAPI?.installUpdate) {
      window.electronAPI.installUpdate()
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      {/* ===== PERMISSIONS ===== */}
      <div className="section">
        <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Lock size={16} /> Permissions
        </div>
        <div className="card" style={{ padding: 0 }}>
          <PermissionRow
            icon={Link2}
            color={permissions.accessibility ? '#22C55E' : '#EF4444'}
            title="URL Tracking"
            description={permissions.accessibility ? 'Enabled - seeing actual URLs' : 'Disabled - needs Accessibility permission'}
            onManage={() => window.electronAPI?.requestPermission('accessibility')}
          />
          <PermissionRow
            icon={Monitor}
            color={permissions.screenRecording === 'granted' ? '#22C55E' : '#EF4444'}
            title="Screen Recording"
            description={permissions.screenRecording === 'granted' ? 'Enabled - can capture screen' : 'Disabled - needs Screen Recording permission'}
            onManage={() => window.electronAPI?.requestPermission('screen-recording')}
          />
          <PermissionRow
            icon={Bell}
            color={'#22C55E'}
            title="Notifications"
            description="Enabled - will receive alerts"
            onManage={() => window.electronAPI?.requestPermission('notifications')}
          />
          <PermissionRow
            icon={ShieldAlert}
            color={permissions.sensitiveContent ? '#22C55E' : '#EF4444'}
            title="Sensitive Content Detection"
            description={permissions.sensitiveContent
              ? 'Enabled - scans captures for NSFW content'
              : 'Disabled - enable Sensitive Content Warning in Privacy & Security'}
            onManage={() => window.electronAPI?.requestPermission('sensitive-content')}
            isLast
          />
        </div>
      </div>

      <div className="divider" />

      {/* ===== LAUNCH AT LOGIN ===== */}
      <div className="section">
        <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Zap size={16} /> Launch at Login
        </div>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)' }}>Launch at Login</div>
              <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 2 }}>
                Start automatically when you log into your Mac
              </div>
            </div>
            <ToggleSwitch checked={launchAtLogin} onChange={toggleLaunchAtLogin} />
          </div>
        </div>
      </div>

      <div className="divider" />

      {/* ===== MONITOR ON LAUNCH ===== */}
      <div className="section">
        <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Play size={16} /> Monitor on Launch
        </div>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)' }}>Monitor on Launch</div>
              <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 2 }}>
                When Overlord is launched, it will start tracking immediately
              </div>
            </div>
            <ToggleSwitch checked={monitorOnLaunch} onChange={toggleMonitorOnLaunch} />
          </div>
        </div>
      </div>

      <div className="divider" />

      {/* ===== SCREEN RECORDING ===== */}
      {/* ===== NSFW DETECTION ===== */}
      <div className="section">
        <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Eye size={16} /> NSFW Detection
        </div>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)' }}>NSFW Detection</div>
              <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 2 }}>
                Scans your screen for sensitive content using on-device AI
              </div>
            </div>
            <ToggleSwitch checked={nsfwEnabled} onChange={toggleNsfw} />
          </div>
          {nsfwEnabled && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                display: 'inline-block', padding: '2px 8px', borderRadius: 99,
                fontSize: 10, fontWeight: 600, background: 'rgba(34,197,94,0.12)', color: 'var(--success)',
              }}>Active</span>
              <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                Scanning every 10s. If explicit content is detected, a check-in will trigger immediately.
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="divider" />

      <div className="section">
        <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Video size={16} /> Screen Recording
        </div>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)' }}>Screen Recording</div>
              <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 2 }}>
                Periodic screenshots for AI analysis
              </div>
            </div>
            <ToggleSwitch checked={screenRecordingEnabled} onChange={toggleScreenRecording} />
          </div>
          {screenRecordingEnabled && (
            <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 4 }}>
                  Interval
                </label>
                <select
                  value={screenRecordingInterval}
                  onChange={(e) => updateScreenRecordingInterval(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: 13,
                    background: 'var(--background)',
                    color: 'var(--foreground)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                  }}
                >
                  <option value={10}>10s</option>
                  <option value={30}>30s</option>
                  <option value={60}>60s</option>
                  <option value={300}>5m</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 4 }}>
                  Quality
                </label>
                <select
                  value={screenRecordingQuality}
                  onChange={(e) => updateScreenRecordingQuality(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: 13,
                    background: 'var(--background)',
                    color: 'var(--foreground)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                  }}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="divider" />

      {/* ===== SUBSCRIPTION ===== */}
      {/* Hidden when freeSubscription is enabled (matches Swift subscriptionStatusCard) */}
      {!subState.freeSubscription && (
        <>
          <div className="section">
            <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CreditCard size={16} /> Subscription
            </div>
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: 12,
                      background: tierInfo.color,
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {tierInfo.label}
                  </span>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                    {tierInfo.description}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {subState.hasValidSubscription ? (
                  <button
                    className="btn btn-ghost"
                    onClick={handleManageSubscription}
                    disabled={subState.isOpeningBillingPortal}
                  >
                    {subState.isOpeningBillingPortal ? 'Opening...' : 'Manage subscription'}
                  </button>
                ) : (
                  <button
                    className="btn btn-primary"
                    onClick={handleUpgrade}
                    disabled={subState.isCheckingOut}
                  >
                    {subState.isCheckingOut ? 'Starting checkout...' : 'Subscribe to Pro'}
                  </button>
                )}
                <button
                  className="btn btn-ghost"
                  onClick={handleRefreshSubscription}
                  disabled={subState.isRefreshing}
                >
                  {subState.isRefreshing ? 'Refreshing...' : 'Refresh'}
                </button>
                {subState.error && (
                  <div style={{ fontSize: 12, color: '#ef4444' }}>
                    {subState.error}
                  </div>
                )}
                {lastCheckLabel && !subState.error && (
                  <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                    Last checked {lastCheckLabel}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="divider" />
        </>
      )}

      {/* ===== APP INFO + UPDATE ===== */}
      <div className="section">
        <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Info size={16} /> App Info
        </div>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13 }}>Version: {appVersion}</span>
            <button className="btn btn-ghost" onClick={checkForUpdates}>
              {updateStatus === 'checking' ? 'Checking...' : 'Check for updates'}
            </button>
          </div>
          {updateStatus === 'available' && (
            <p style={{ fontSize: 12, color: 'var(--accent)', marginTop: 8 }}>
              Update available! Downloading...
            </p>
          )}
          {updateStatus === 'downloaded' && (
            <div style={{ marginTop: 8 }}>
              <p style={{ fontSize: 12, color: 'var(--success)', marginBottom: 8 }}>
                Update ready to install
              </p>
              <button className="btn btn-primary" onClick={installUpdate}>
                Restart and update
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
