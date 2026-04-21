import React, { useState, useEffect, useCallback, useRef } from 'react'
import { X, Play, ChevronUp, ChevronDown, Clock, Coffee } from 'lucide-react'
import { pomodoro } from '../services/pomodoroService'

// Swift Mac app duration scheme: 1-10 minutes, then increments of 5 up to the cap.
// Matches the minute wheel users see on the native app.
const MIN_DURATION = 1
const MAX_DURATION = 180

function nextDurationUp(current) {
  if (current < 10) return Math.min(MAX_DURATION, current + 1)
  // round up to the next multiple of 5
  const rounded = Math.floor(current / 5) * 5
  return Math.min(MAX_DURATION, rounded + 5)
}

function nextDurationDown(current) {
  if (current <= 10) return Math.max(MIN_DURATION, current - 1)
  // round down to the previous multiple of 5
  const rounded = Math.ceil(current / 5) * 5
  return Math.max(MIN_DURATION, rounded - 5)
}

const DURATION_PRESETS = (() => {
  const presets = []
  for (let m = 1; m <= 10; m++) presets.push({ label: `${m}m`, minutes: m })
  for (let m = 15; m <= 60; m += 5) presets.push({ label: `${m}m`, minutes: m })
  return presets
})()

const BREAK_PRESETS = [
  { label: '1 min', minutes: 1 },
  { label: '5 min', minutes: 5 },
  { label: '10 min', minutes: 10 },
  { label: '15 min', minutes: 15 },
  { label: '20 min', minutes: 20 },
]

const MODE_OPTIONS = ['Pomodoro', 'Screen Recording']

export default function FocusSessionPanel({ onClose, onStart }) {
  const [selectedMinutes, setSelectedMinutes] = useState(30)
  const [mode, setMode] = useState('Pomodoro')
  const [showModeDropdown, setShowModeDropdown] = useState(false)
  const [breakEnabled, setBreakEnabled] = useState(false)
  const [breakMinutes, setBreakMinutes] = useState(5)
  const panelRef = useRef(null)
  const modeRef = useRef(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  // Close mode dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (modeRef.current && !modeRef.current.contains(e.target)) {
        setShowModeDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const increment = useCallback(() => {
    setSelectedMinutes(prev => nextDurationUp(prev))
  }, [])

  const decrement = useCallback(() => {
    setSelectedMinutes(prev => nextDurationDown(prev))
  }, [])

  const handleStart = useCallback(() => {
    onStart(selectedMinutes)
  }, [selectedMinutes, onStart])

  // SVG circle parameters
  const circleSize = 140
  const circleCenter = circleSize / 2
  const circleRadius = 56
  const circumference = 2 * Math.PI * circleRadius

  return (
    <div ref={panelRef} style={styles.panel}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerTitle}>Focus Session</span>
        <button style={styles.closeBtn} onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div style={styles.body}>
        {/* Left - circular timer */}
        <div style={styles.leftSide}>
          <div style={styles.circleContainer}>
            {/* Up chevron */}
            <button style={styles.chevronBtn} onClick={increment}>
              <ChevronUp size={20} />
            </button>

            {/* Circle */}
            <div style={{ position: 'relative', width: circleSize, height: circleSize }}>
              <svg width={circleSize} height={circleSize} viewBox={`0 0 ${circleSize} ${circleSize}`}>
                {/* Background ring */}
                <circle
                  cx={circleCenter}
                  cy={circleCenter}
                  r={circleRadius}
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth="5"
                />
                {/* Colored ring */}
                <circle
                  cx={circleCenter}
                  cy={circleCenter}
                  r={circleRadius}
                  fill="none"
                  stroke="#3B82F6"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={0}
                  transform={`rotate(-90 ${circleCenter} ${circleCenter})`}
                  style={{ opacity: 0.3 }}
                />
              </svg>
              {/* Duration text centered */}
              <div style={styles.circleText}>
                <span style={styles.circleNumber}>{selectedMinutes}</span>
                <span style={styles.circleUnit}>min</span>
              </div>
            </div>

            {/* Down chevron */}
            <button style={styles.chevronBtn} onClick={decrement}>
              <ChevronDown size={20} />
            </button>
          </div>
        </div>

        {/* Right side content */}
        <div style={styles.rightSide}>
          {/* Title row with mode selector */}
          <div style={styles.titleRow}>
            <div>
              <div style={styles.sectionTitle}>Focus Session</div>
            </div>
            {/* Mode selector */}
            <div ref={modeRef} style={{ position: 'relative' }}>
              <button
                style={styles.modeSelector}
                onClick={() => setShowModeDropdown(!showModeDropdown)}
              >
                <span>{mode}</span>
                <ChevronDown size={12} />
              </button>
              {showModeDropdown && (
                <div style={styles.modeDropdown}>
                  {MODE_OPTIONS.map(opt => (
                    <button
                      key={opt}
                      style={{
                        ...styles.modeOption,
                        fontWeight: mode === opt ? 600 : 400,
                        background: mode === opt ? 'var(--muted)' : 'transparent',
                      }}
                      onClick={() => { setMode(opt); setShowModeDropdown(false) }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <p style={styles.subtitle}>
            Record focus sessions and send them directly to Overlord for analysis.
          </p>

          <div style={styles.divider} />

          {/* Quick Presets */}
          <div style={styles.presetSection}>
            <span style={styles.presetLabel}>Quick Presets</span>
            <div style={styles.presetRow}>
              {DURATION_PRESETS.map(p => (
                <button
                  key={p.minutes}
                  style={{
                    ...styles.presetPill,
                    background: selectedMinutes === p.minutes ? 'var(--text-primary)' : 'var(--muted)',
                    color: selectedMinutes === p.minutes ? 'var(--bg-primary)' : 'var(--text-secondary)',
                    borderColor: selectedMinutes === p.minutes ? 'var(--text-primary)' : 'var(--border)',
                  }}
                  onClick={() => setSelectedMinutes(p.minutes)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Break toggle */}
          <div style={styles.breakSection}>
            <div style={styles.breakToggleRow}>
              <div>
                <span style={styles.breakTitle}>Enable Break Time</span>
                <p style={styles.breakDesc}>Automatically schedule a break after each session</p>
              </div>
              <button
                style={{
                  ...styles.toggle,
                  background: breakEnabled ? '#3B82F6' : 'var(--muted)',
                }}
                onClick={() => setBreakEnabled(!breakEnabled)}
              >
                <div
                  style={{
                    ...styles.toggleKnob,
                    transform: breakEnabled ? 'translateX(16px)' : 'translateX(1px)',
                  }}
                />
              </button>
            </div>

            {/* Break presets - shown when enabled */}
            {breakEnabled && (
              <div style={styles.breakPresetsSection}>
                <span style={styles.presetLabel}>Break Duration</span>
                <div style={styles.presetRow}>
                  {BREAK_PRESETS.map(p => (
                    <button
                      key={p.minutes}
                      style={{
                        ...styles.presetPill,
                        background: breakMinutes === p.minutes ? 'var(--text-primary)' : 'var(--muted)',
                        color: breakMinutes === p.minutes ? 'var(--bg-primary)' : 'var(--text-secondary)',
                        borderColor: breakMinutes === p.minutes ? 'var(--text-primary)' : 'var(--border)',
                      }}
                      onClick={() => setBreakMinutes(p.minutes)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom - start button */}
      <button style={styles.startBtn} onClick={handleStart}>
        <Play size={16} fill="white" />
        <span>Start Focus Session</span>
      </button>
    </div>
  )
}

const styles = {
  panel: {
    position: 'absolute',
    top: 38,
    left: 0,
    width: 520,
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    boxShadow: '0 8px 30px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08)',
    zIndex: 200,
    fontFamily: "'Figtree', sans-serif",
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
    fontFamily: "'Figtree', sans-serif",
  },
  closeBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    border: 'none',
    background: 'var(--muted)',
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  body: {
    display: 'flex',
    padding: '16px',
    gap: 20,
  },
  leftSide: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  circleContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  chevronBtn: {
    width: 32,
    height: 28,
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--muted)',
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  circleText: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleNumber: {
    fontSize: 32,
    fontWeight: 700,
    color: 'var(--text-primary)',
    fontFamily: "'Figtree', sans-serif",
    lineHeight: 1,
  },
  circleUnit: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-secondary)',
    fontFamily: "'Figtree', sans-serif",
    marginTop: 2,
  },
  rightSide: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--text-primary)',
    fontFamily: "'Figtree', sans-serif",
  },
  modeSelector: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--muted)',
    color: 'var(--text-secondary)',
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: "'Figtree', sans-serif",
  },
  modeDropdown: {
    position: 'absolute',
    top: 30,
    right: 0,
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 4,
    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
    zIndex: 300,
    minWidth: 140,
  },
  modeOption: {
    display: 'block',
    width: '100%',
    padding: '6px 10px',
    border: 'none',
    background: 'none',
    color: 'var(--text-primary)',
    fontSize: 12,
    cursor: 'pointer',
    borderRadius: 4,
    textAlign: 'left',
    fontFamily: "'Figtree', sans-serif",
  },
  subtitle: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    fontFamily: "'Figtree', sans-serif",
    margin: 0,
    lineHeight: 1.4,
  },
  divider: {
    height: 1,
    background: 'var(--border)',
    margin: '12px 0',
  },
  presetSection: {
    marginBottom: 12,
  },
  presetLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    fontFamily: "'Figtree', sans-serif",
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    display: 'block',
    marginBottom: 8,
  },
  presetRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  presetPill: {
    padding: '4px 12px',
    borderRadius: 99,
    border: '1px solid',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
    fontFamily: "'Figtree', sans-serif",
  },
  breakSection: {
    marginTop: 4,
  },
  breakToggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  breakTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
    fontFamily: "'Figtree', sans-serif",
  },
  breakDesc: {
    fontSize: 11,
    color: 'var(--text-tertiary)',
    fontFamily: "'Figtree', sans-serif",
    margin: '2px 0 0',
    lineHeight: 1.3,
  },
  toggle: {
    width: 38,
    height: 22,
    borderRadius: 11,
    border: 'none',
    cursor: 'pointer',
    position: 'relative',
    flexShrink: 0,
    transition: 'background 0.2s',
  },
  toggleKnob: {
    width: 18,
    height: 18,
    borderRadius: 9,
    background: 'white',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
    position: 'absolute',
    top: 2,
    transition: 'transform 0.2s',
  },
  breakPresetsSection: {
    marginTop: 10,
  },
  startBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: 'calc(100% - 32px)',
    margin: '0 16px 16px',
    padding: '10px 0',
    borderRadius: 10,
    border: 'none',
    background: '#3B82F6',
    color: 'white',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'Figtree', sans-serif",
    transition: 'opacity 0.15s',
  },
}
