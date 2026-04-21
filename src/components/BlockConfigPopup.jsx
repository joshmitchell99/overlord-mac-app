/**
 * BlockConfigPopup - reusable "Configure block" modal.
 *
 * Duration tab: logarithmic slider (1 min - 30 days) + quick-preset buttons.
 * Schedule tab: day picker + all-day toggle + time range.
 * Block list type gets a confirmation step mentioning Mac Instructions.
 *
 * Props:
 *   word             - the app/keyword being configured (shown in header)
 *   listType         - 'blocked' | 'productive' | 'distracting' (default 'blocked')
 *   initialMinutes   - default slider value in minutes (default 60 = 1 hour)
 *   skipConfirmation - bool, skip the "persuade Overlord" confirmation step
 *   onClose          - () => void
 *   onSave           - (config) => void. config is either:
 *                      { type: 'duration', minutes: N }
 *                      { type: 'schedule', days: [...], allDay, startTime, endTime }
 */

import React, { useState } from 'react'
import { Clock, Calendar } from 'lucide-react'

const LIST_COLORS = {
  blocked: { accent: '#EF4444', bg: 'rgba(239,68,68,0.08)' },
  distracting: { accent: '#F59E0B', bg: 'rgba(245,158,11,0.08)' },
  productive: { accent: '#22C55E', bg: 'rgba(34,197,94,0.08)' },
}

const DURATION_PRESETS = [
  { label: '1m', minutes: 1 },
  { label: '5m', minutes: 5 },
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '4h', minutes: 240 },
  { label: '8h', minutes: 480 },
  { label: '1 day', minutes: 1440 },
  { label: '1 week', minutes: 10080 },
  { label: '30 days', minutes: 43200 },
]

const DAYS = [
  { key: 'mon', label: 'M' }, { key: 'tue', label: 'T' }, { key: 'wed', label: 'W' },
  { key: 'thu', label: 'T' }, { key: 'fri', label: 'F' }, { key: 'sat', label: 'S' },
  { key: 'sun', label: 'S' },
]

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} min`
  if (minutes === 60) return '1 hour'
  if (minutes < 1440) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m > 0 ? `${h}h ${m}m` : `${h} hours`
  }
  if (minutes === 1440) return '1 day'
  if (minutes === 10080) return '1 week'
  if (minutes === 20160) return '2 weeks'
  if (minutes === 43200) return '1 month'
  return `${Math.round(minutes / 1440)} days`
}

function sliderToMinutes(value) {
  const raw = Math.exp(value * Math.log(43200))
  if (raw < 60) return Math.max(1, Math.round(raw))
  if (raw < 1440) return Math.round(raw / 15) * 15
  return Math.round(raw / 1440) * 1440
}

function minutesToSlider(minutes) {
  return Math.log(Math.max(1, minutes)) / Math.log(43200)
}

function ToggleSwitch({ checked, onChange }) {
  return (
    <button onClick={() => onChange(!checked)} style={{
      width: 44, height: 24, borderRadius: 12, border: 'none',
      background: checked ? 'var(--success)' : 'var(--bg-tertiary)',
      position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
      outline: checked ? 'none' : '1px solid var(--border)',
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 3, left: checked ? 23 : 3,
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  )
}

export default function BlockConfigPopup({
  word,
  listType = 'blocked',
  initialMinutes = 60,
  skipConfirmation = false,
  onClose,
  onSave,
}) {
  const [mode, setMode] = useState('duration')
  const [durationMinutes, setDurationMinutes] = useState(initialMinutes)
  const [sliderValue, setSliderValue] = useState(minutesToSlider(initialMinutes))

  const [selectedDays, setSelectedDays] = useState(['mon','tue','wed','thu','fri'])
  const [allDay, setAllDay] = useState(false)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')

  const [pendingSave, setPendingSave] = useState(null)

  const colors = LIST_COLORS[listType] || LIST_COLORS.blocked
  const actionLabel = listType === 'blocked' ? 'Block'
    : listType === 'productive' ? 'Allow' : 'Mark distracting'

  const handleSliderChange = (e) => {
    const val = parseFloat(e.target.value)
    setSliderValue(val)
    setDurationMinutes(sliderToMinutes(val))
  }

  const handlePreset = (minutes) => {
    setDurationMinutes(minutes)
    setSliderValue(minutesToSlider(minutes))
  }

  const toggleDay = (day) => {
    setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])
  }

  const handleSchedulePreset = (preset) => {
    if (preset === 'always') {
      setSelectedDays(['mon','tue','wed','thu','fri','sat','sun']); setAllDay(true)
    } else if (preset === 'weekdays') {
      setSelectedDays(['mon','tue','wed','thu','fri']); setAllDay(false)
      setStartTime('09:00'); setEndTime('17:00')
    } else if (preset === 'weekends') {
      setSelectedDays(['sat','sun']); setAllDay(true)
    }
  }

  const getScheduleSummary = () => {
    const dayNames = { mon:'Mon',tue:'Tue',wed:'Wed',thu:'Thu',fri:'Fri',sat:'Sat',sun:'Sun' }
    const allWeekdays = ['mon','tue','wed','thu','fri'].every(d => selectedDays.includes(d)) &&
      !selectedDays.includes('sat') && !selectedDays.includes('sun')
    const allWeekend = selectedDays.includes('sat') && selectedDays.includes('sun') && selectedDays.length === 2
    const everyday = selectedDays.length === 7
    let dayStr = 'No days selected'
    if (everyday) dayStr = 'Every day'
    else if (allWeekdays) dayStr = 'Weekdays'
    else if (allWeekend) dayStr = 'Weekends'
    else dayStr = selectedDays.map(d => dayNames[d]).join(', ')
    if (allDay) return `${dayStr}, all day`
    return `${dayStr}, ${startTime} - ${endTime}`
  }

  const handleSave = () => {
    const config = mode === 'duration'
      ? { type: 'duration', minutes: durationMinutes }
      : {
          type: 'schedule', days: selectedDays, allDay,
          startTime: allDay ? null : startTime,
          endTime: allDay ? null : endTime,
        }
    if (listType === 'blocked' && !skipConfirmation) {
      setPendingSave(config)
      return
    }
    onSave(config)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }} />

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative', width: 340, background: 'var(--background)',
          borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.25), 0 0 0 1px var(--border)',
          overflow: 'hidden',
        }}
      >
        {pendingSave ? (
          (() => {
            const macInstructions = (window.__overlordPersonality?.macInstructions || '').trim()
            return (
              <div style={{ padding: '20px 22px 18px' }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Block {word}?</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 14 }}>
                  Once blocked, you can't just delete this from the list - you'll have to <strong style={{ color: 'var(--text-primary)' }}>persuade Overlord</strong> to remove it. Overlord decides based on your <strong style={{ color: 'var(--text-primary)' }}>Mac instructions</strong> below.
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={{
                    fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)',
                    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
                  }}>Your Mac instructions</div>
                  <div style={{
                    padding: '10px 12px', borderRadius: 8,
                    background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                    fontSize: 12, lineHeight: 1.5, color: 'var(--text-primary)',
                    maxHeight: 140, overflowY: 'auto', whiteSpace: 'pre-wrap',
                  }}>
                    {macInstructions || (
                      <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                        No Mac instructions set yet. Overlord won't have context to decide when to unblock.
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setPendingSave(null)} style={{
                    flex: 1, padding: '10px 0', border: '1px solid var(--border)',
                    borderRadius: 10, background: 'transparent', color: 'var(--text-primary)',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}>Cancel</button>
                  <button onClick={() => {
                    const saved = pendingSave; setPendingSave(null); onSave(saved)
                  }} style={{
                    flex: 1, padding: '10px 0', border: 'none',
                    borderRadius: 10, background: '#EF4444', color: '#fff',
                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}>Block {word}</button>
                </div>
              </div>
            )
          })()
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: '18px 20px 14px' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{word}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                Configure {listType} schedule
              </div>
            </div>
            <div style={{ height: 1, background: 'var(--border)' }} />

            {/* Tab switcher */}
            <div style={{ padding: '12px 20px 0' }}>
              <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 8, padding: 3 }}>
                {[{ key: 'duration', label: 'For a duration', icon: Clock },
                  { key: 'schedule', label: 'On a schedule', icon: Calendar }].map(tab => (
                  <button key={tab.key} onClick={() => setMode(tab.key)} style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    padding: '7px 0', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500,
                    cursor: 'pointer', transition: 'all 0.15s',
                    background: mode === tab.key ? 'var(--background)' : 'transparent',
                    color: mode === tab.key ? 'var(--text-primary)' : 'var(--text-secondary)',
                    boxShadow: mode === tab.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}>
                    <tab.icon size={13} />
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div style={{ padding: '16px 20px 20px' }}>
              {mode === 'duration' ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{actionLabel} for</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: colors.accent }}>{formatDuration(durationMinutes)}</span>
                  </div>
                  <div style={{ position: 'relative', marginBottom: 4 }}>
                    <input
                      type="range" min="0" max="1" step="0.001"
                      value={sliderValue} onChange={handleSliderChange}
                      style={{
                        width: '100%', height: 6, borderRadius: 3,
                        appearance: 'none', outline: 'none', cursor: 'pointer',
                        background: `linear-gradient(to right, ${colors.accent} ${sliderValue * 100}%, var(--bg-tertiary) ${sliderValue * 100}%)`,
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 14 }}>
                    <span>1 min</span><span>30 days</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {DURATION_PRESETS.map(p => (
                      <button key={p.minutes} onClick={() => handlePreset(p.minutes)} style={{
                        padding: '5px 10px', border: 'none', borderRadius: 6,
                        fontSize: 11, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
                        background: durationMinutes === p.minutes ? colors.accent : 'var(--bg-tertiary)',
                        color: durationMinutes === p.minutes ? '#fff' : 'var(--text-primary)',
                      }}>{p.label}</button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                    {[{ key: 'always', label: 'Always' },
                      { key: 'weekdays', label: 'Weekdays 9-5' },
                      { key: 'weekends', label: 'Weekends' }].map(p => (
                      <button key={p.key} onClick={() => handleSchedulePreset(p.key)} style={{
                        padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 99,
                        fontSize: 11, fontWeight: 500, cursor: 'pointer',
                        background: 'transparent', color: 'var(--text-primary)',
                      }}>{p.label}</button>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>Active days</div>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
                    {DAYS.map((day, i) => (
                      <button key={`${day.key}-${i}`} onClick={() => toggleDay(day.key)} style={{
                        flex: 1, height: 32, border: 'none', borderRadius: 7,
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        background: selectedDays.includes(day.key) ? colors.accent : 'var(--bg-tertiary)',
                        color: selectedDays.includes(day.key) ? '#fff' : 'var(--text-secondary)',
                      }}>{day.label}</button>
                    ))}
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 8, marginBottom: 12,
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>All day</span>
                    <ToggleSwitch checked={allDay} onChange={setAllDay} />
                  </div>
                  {!allDay && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>Active hours</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                          style={{ flex: 1, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)',
                                   background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 13 }} />
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>to</span>
                        <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                          style={{ flex: 1, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)',
                                   background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 13 }} />
                      </div>
                    </div>
                  )}
                  <div style={{
                    padding: '8px 10px', borderRadius: 8,
                    background: colors.bg, fontSize: 12, color: 'var(--text-secondary)',
                  }}>{getScheduleSummary()}</div>
                </>
              )}
            </div>

            {/* Action button */}
            <div style={{ padding: '0 20px 20px' }}>
              <button onClick={handleSave} style={{
                width: '100%', padding: '10px 0', border: 'none', borderRadius: 10,
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
                background: colors.accent, color: '#fff', transition: 'opacity 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >{actionLabel} {word}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
