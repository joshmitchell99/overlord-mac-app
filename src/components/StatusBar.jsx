import React, { useState, useEffect, useRef } from 'react'
import { Play, Square, Timer, Monitor, Clock, Sunrise, Infinity as InfinityIcon, ShieldOff } from 'lucide-react'
import { pomodoro } from '../services'
import {
  stopUntil as ctrlStopUntil,
  stopBlockingUntil as ctrlStopBlockingUntil,
  startBlocking as ctrlStartBlocking,
  start as ctrlStart,
  onChange as ctrlOnChange,
  getState as ctrlGetState,
  hydrateFromStore as ctrlHydrate,
} from '../services/monitoringController'
import FocusSessionPanel from '../panels/FocusSessionPanel'

/**
 * Pause options mirroring the Swift PauseMonitoringPopover exactly.
 * calcResumeAt returns an epoch ms or null (indefinitely).
 */
const PAUSE_OPTIONS = [
  {
    id: '5min',
    label: 'for 5 mins',
    icon: Clock,
    calcResumeAt: () => Date.now() + 5 * 60 * 1000,
  },
  {
    id: '15min',
    label: 'for 15 mins',
    icon: Clock,
    calcResumeAt: () => Date.now() + 15 * 60 * 1000,
  },
  {
    id: '30min',
    label: 'for 30 mins',
    icon: Clock,
    calcResumeAt: () => Date.now() + 30 * 60 * 1000,
  },
  {
    id: '1hour',
    label: 'for 1 hour',
    icon: Clock,
    calcResumeAt: () => Date.now() + 60 * 60 * 1000,
  },
  {
    id: 'tomorrow',
    label: 'until tomorrow',
    icon: Sunrise,
    calcResumeAt: () => {
      // Start of next local day (midnight 00:00).
      const d = new Date()
      d.setDate(d.getDate() + 1)
      d.setHours(0, 0, 0, 0)
      return d.getTime()
    },
  },
  {
    id: 'indefinite',
    label: 'indefinitely',
    icon: InfinityIcon,
    calcResumeAt: () => null,
  },
]

/**
 * Read-only toggle switch visual. The parent row handles the click, so
 * this component just paints the state - no onChange needed.
 */
function ToggleSwitch({ checked }) {
  return (
    <div style={{
      width: 32, height: 18, borderRadius: 10,
      background: checked ? 'var(--success)' : 'var(--bg-tertiary)',
      border: checked ? 'none' : '1px solid var(--border)',
      position: 'relative',
      transition: 'background 0.15s',
      flexShrink: 0,
    }}>
      <div style={{
        width: 13, height: 13, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 2, left: checked ? 17 : 2,
        transition: 'left 0.15s',
        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
      }} />
    </div>
  )
}

/**
 * Format an epoch-ms to "11:51 am" style (Swift parity).
 * Uses toLocaleTimeString with hour12 formatting then lowercases AM/PM.
 */
function formatResumeTime(ms) {
  if (ms == null) return ''
  return new Date(ms)
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .toLowerCase()
}

export default function StatusBar() {
  const [currentApp, setCurrentApp] = useState(null)
  const [pomodoroState, setPomodoroState] = useState({ isActive: false, sessionType: 'none', remaining: 0 })
  // Display pill state - the in-app session timer concept, separate from
  // the global monitoring controller. Kept for backwards compatibility.
  const [isTracking, setIsTracking] = useState(false)
  const [sessionElapsed, setSessionElapsed] = useState(null)
  const [trackingStartTime, setTrackingStartTime] = useState(null)
  const [showFocusPicker, setShowFocusPicker] = useState(false)
  const [showStopPopover, setShowStopPopover] = useState(false)
  const [blockingOnlyMode, setBlockingOnlyMode] = useState(false)
  const [monitoringState, setMonitoringState] = useState(() => ctrlGetState())
  // Recompute resume-time labels every 30s so the popover's "11:51 am"
  // values stay accurate if it's left open across a minute boundary.
  const [, setTick] = useState(0)

  const popoverRef = useRef(null)
  const stopButtonRef = useRef(null)

  // Subscribe to the monitoring controller once and restore any persisted
  // pause state so a mid-pause app restart keeps the UI correct.
  useEffect(() => {
    ctrlHydrate()
    const unsub = ctrlOnChange((state) => setMonitoringState(state))
    return unsub
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setPomodoroState(pomodoro.getState())
      if (trackingStartTime) {
        setSessionElapsed(Math.floor((Date.now() - trackingStartTime) / 1000))
      }
      setTick((t) => t + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [trackingStartTime])

  useEffect(() => {
    if (!window.electronAPI?.onAppStatusUpdate) return
    const cleanup = window.electronAPI.onAppStatusUpdate((update) => {
      if (update && update.app) {
        setCurrentApp(update)
        if (!isTracking) {
          setIsTracking(true)
          setTrackingStartTime(Date.now())
        }
      }
    })
    return cleanup
  }, [isTracking])

  // Close the stop popover on outside click.
  useEffect(() => {
    if (!showStopPopover) return
    function onDocClick(e) {
      if (popoverRef.current?.contains(e.target)) return
      if (stopButtonRef.current?.contains(e.target)) return
      setShowStopPopover(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [showStopPopover])

  function handleStopButtonClick() {
    // When already stopped (either mode), clicking resumes immediately.
    if (monitoringState.isStopped) {
      ctrlStart()
      setIsTracking(true)
      setTrackingStartTime(Date.now())
      return
    }
    if (monitoringState.isBlockingStopped) {
      ctrlStartBlocking()
      return
    }
    // Otherwise toggle the popover.
    setShowStopPopover((v) => !v)
  }

  async function handlePauseOptionClick(opt) {
    const resumeAt = opt.calcResumeAt()
    setShowStopPopover(false)
    if (blockingOnlyMode) {
      await ctrlStopBlockingUntil(resumeAt)
      return
    }
    await ctrlStopUntil(resumeAt)
    // Also tear down the local "Active" session display when fully stopping.
    setIsTracking(false)
    setTrackingStartTime(null)
    setSessionElapsed(null)
    pomodoro.stopSession()
  }

  function startFocus(minutes) {
    setShowFocusPicker(false)
    setIsTracking(true)
    setTrackingStartTime(Date.now())
    pomodoro.startFocusSession(minutes)
  }

  function formatElapsed(s) {
    if (s == null) return null
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  const appName = currentApp?.app || null
  const isFocus = pomodoroState.sessionType === 'focus'
  const isPaused = monitoringState.isStopped
  const isBlockingPaused = monitoringState.isBlockingStopped
  const pausedLabel = isPaused
    ? (monitoringState.resumeAt
        ? `Paused until ${formatResumeTime(monitoringState.resumeAt)}`
        : 'Paused')
    : (isBlockingPaused
        ? (monitoringState.blockingResumeAt
            ? `Blocking off until ${formatResumeTime(monitoringState.blockingResumeAt)}`
            : 'Blocking off')
        : null)

  return (
    <div style={styles.bar}>
      {/* Left group: play/stop + focus button */}
      <div style={styles.leftGroup}>
        {/* Play/Stop */}
        <div style={{ position: 'relative' }}>
          <button
            ref={stopButtonRef}
            style={styles.circleBtn}
            onClick={handleStopButtonClick}
            title={isPaused ? 'Resume monitoring' : (isTracking ? 'Stop monitoring' : 'Start tracking')}
          >
            {isPaused || isBlockingPaused || !isTracking
              ? <Play size={10} fill="currentColor" style={{ marginLeft: 1 }} />
              : <Square size={10} fill="currentColor" />
            }
          </button>

          {/* Stop monitoring popover */}
          {showStopPopover && (
            <div ref={popoverRef} style={styles.stopPopover}>
              <div style={styles.stopPopoverHeader}>
                {blockingOnlyMode ? 'Stop blocking' : 'Stop monitoring'}
              </div>

              {/* Mode toggle row */}
              <button
                type="button"
                style={styles.stopOptionRow}
                onClick={() => setBlockingOnlyMode(v => !v)}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-primary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <div style={styles.stopOptionIconCircle}>
                  <ShieldOff size={14} style={{ color: 'var(--text-secondary)' }} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={styles.stopOptionLabel}>Stop blocking only</span>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    Score + check-ins keep running
                  </span>
                </div>
                <ToggleSwitch checked={blockingOnlyMode} />
              </button>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

              {PAUSE_OPTIONS.map((opt) => {
                const Icon = opt.icon
                const resumeAtMs = opt.calcResumeAt()
                let rightLabel = ''
                if (opt.id === 'tomorrow') {
                  rightLabel = 'tomorrow'
                } else if (opt.id === 'indefinite') {
                  rightLabel = ''
                } else {
                  rightLabel = formatResumeTime(resumeAtMs)
                }
                return (
                  <button
                    key={opt.id}
                    style={styles.stopOptionRow}
                    onClick={() => handlePauseOptionClick(opt)}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-primary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={styles.stopOptionIconCircle}>
                      <Icon size={14} style={{ color: 'var(--text-secondary)' }} />
                    </div>
                    <span style={styles.stopOptionLabel}>{opt.label}</span>
                    <span style={styles.stopOptionRight}>{rightLabel}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Focus pill */}
        <div style={{ position: 'relative' }}>
          <button
            style={{
              ...styles.focusPill,
              background: isFocus ? 'var(--text-primary)' : 'var(--bg-secondary)',
              color: isFocus ? 'var(--bg-primary)' : 'var(--text-secondary)',
              borderColor: isFocus ? 'var(--text-primary)' : 'var(--border)',
            }}
            onClick={() => {
              if (isFocus) {
                pomodoro.stopSession()
              } else {
                setShowFocusPicker(!showFocusPicker)
              }
            }}
          >
            <Clock size={11} />
            <span>{isFocus ? pomodoro.formatTime(pomodoroState.remaining) : 'Focus'}</span>
          </button>

          {/* Focus session panel */}
          {showFocusPicker && (
            <FocusSessionPanel
              onClose={() => setShowFocusPicker(false)}
              onStart={(minutes) => startFocus(minutes)}
            />
          )}
        </div>
      </div>

      {/* Center: glass pill with status widgets */}
      <div style={styles.glassPill}>
        {/* Session timer */}
        {sessionElapsed != null && !isPaused && (
          <div style={styles.widgetGroup}>
            <Timer size={12} style={{ color: 'var(--text-tertiary)' }} />
            <span style={styles.monoText}>{formatElapsed(sessionElapsed)}</span>
          </div>
        )}

        {/* Active / paused status dot */}
        <div style={styles.widgetGroup}>
          <div style={{
            width: 6, height: 6, borderRadius: 3,
            background: isPaused ? 'var(--text-tertiary)' : (isTracking ? '#22c55e' : 'var(--text-tertiary)'),
          }} />
          <span style={styles.secondaryText}>
            {isPaused ? pausedLabel : (isTracking ? 'Active' : 'Inactive')}
          </span>
        </div>

        {/* Current app (hidden while paused) */}
        {appName && !isPaused && (
          <div style={styles.widgetGroup}>
            <Monitor size={11} style={{ color: 'var(--text-tertiary)' }} />
            <span style={styles.appText}>{appName}</span>
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  bar: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    padding: '6px 32px',
    minHeight: 40,
    WebkitAppRegion: 'drag',
    userSelect: 'none',
  },
  leftGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    WebkitAppRegion: 'no-drag',
    flexShrink: 0,
  },
  circleBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.15s',
    flexShrink: 0,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  focusPill: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '4px 12px',
    borderRadius: 14,
    border: '1px solid',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    fontFamily: "'Figtree', sans-serif",
  },
  glassPill: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '5px 14px',
    borderRadius: 20,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    WebkitAppRegion: 'no-drag',
  },
  widgetGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  monoText: {
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "'SF Mono', 'Menlo', monospace",
    color: 'var(--text-primary)',
  },
  secondaryText: {
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--text-secondary)',
    fontFamily: "'Figtree', sans-serif",
  },
  appText: {
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--text-primary)',
    maxWidth: 150,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: "'Figtree', sans-serif",
  },
  // ---------------------------------------------------------------------
  // Stop-monitoring popover (Swift PauseMonitoringPopover parity)
  // ---------------------------------------------------------------------
  stopPopover: {
    position: 'absolute',
    top: 36,
    left: 0,
    width: 280,
    maxWidth: 340,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    boxShadow: '0 8px 30px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
    padding: '8px 0',
    zIndex: 1000,
    WebkitAppRegion: 'no-drag',
  },
  stopPopoverHeader: {
    padding: '6px 14px 10px 14px',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
    fontFamily: "'Figtree', sans-serif",
    borderBottom: '1px solid var(--border)',
    marginBottom: 4,
  },
  stopOptionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    padding: '8px 14px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 0.1s',
    fontFamily: "'Figtree', sans-serif",
  },
  stopOptionIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    background: 'rgba(128,128,128,0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stopOptionLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-primary)',
  },
  stopOptionRight: {
    fontSize: 12,
    fontWeight: 400,
    color: 'var(--text-tertiary)',
    fontVariantNumeric: 'tabular-nums',
  },
}
