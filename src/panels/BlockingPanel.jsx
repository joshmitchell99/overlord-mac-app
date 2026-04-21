import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, X, XCircle, Clock, Calendar, ChevronDown, ChevronRight, Trash2, Search, Info, CalendarClock } from 'lucide-react'
import { wordList, score, engine, nsfw } from '../services'
import { saveWordList, saveMacInstructions, auth } from '../services/firebaseService'
import PermissionsBanner from '../components/PermissionsBanner'
import ScoreGraph from '../components/ScoreGraph'
import BlockConfigPopup from '../components/BlockConfigPopup'

// -- Helpers ------------------------------------------------------------------

function getScoreColor(current, threshold) {
  const pct = threshold > 0 ? (current / threshold) * 100 : 0
  if (pct < 30) return 'var(--success)'
  if (pct < 60) return 'var(--warning)'
  return 'var(--danger)'
}

function getScoreLabel(current, threshold) {
  const pct = threshold > 0 ? (current / threshold) * 100 : 0
  if (pct < 20) return { title: 'All clear', subtitle: 'Everything looks productive' }
  if (pct < 40) return { title: 'Monitoring', subtitle: 'Keeping an eye on things' }
  if (pct < 60) return { title: 'Paying attention', subtitle: 'Some distracting activity' }
  if (pct < 80) return { title: 'Watching closely', subtitle: 'Might need to check in soon' }
  return { title: 'Checking in', subtitle: 'Gathering information' }
}

/** Single-line legend row used in the score-info popover. */
function InfoRow({ color, label, text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0,
      }} />
      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
      <span style={{ color: 'var(--text-secondary)' }}>- {text}</span>
    </div>
  )
}

/** Color per list type */
const LIST_COLORS = {
  blocked: { accent: '#EF4444', bg: 'rgba(239,68,68,0.08)', chipBg: '#EF4444', chipText: '#fff' },
  distracting: { accent: '#F59E0B', bg: 'rgba(245,158,11,0.08)', chipBg: '#F59E0B', chipText: '#1a1a1a' },
  productive: { accent: '#22C55E', bg: 'rgba(34,197,94,0.08)', chipBg: '#22C55E', chipText: '#1a1a1a' },
}

/** Duration presets matching Swift's quick-select buttons */
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

/** Day abbreviations */
const DAYS = [
  { key: 'mon', label: 'M' },
  { key: 'tue', label: 'T' },
  { key: 'wed', label: 'W' },
  { key: 'thu', label: 'T' },
  { key: 'fri', label: 'F' },
  { key: 'sat', label: 'S' },
  { key: 'sun', label: 'S' },
]

/** Format minutes to readable duration (matching Swift) */
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

/** Logarithmic slider value to minutes (1 min - 30 days, matching Swift) */
function sliderToMinutes(value) {
  const minLog = Math.log(1)
  const maxLog = Math.log(43200)
  const raw = Math.exp(minLog + value * (maxLog - minLog))
  if (raw < 60) return Math.round(raw)
  if (raw < 1440) return Math.round(raw / 15) * 15
  return Math.round(raw / 1440) * 1440
}

function minutesToSlider(minutes) {
  const minLog = Math.log(1)
  const maxLog = Math.log(43200)
  return (Math.log(minutes) - minLog) / (maxLog - minLog)
}

// -- Robot Face SVG -----------------------------------------------------------

function RobotFace({ percentage, size = 48 }) {
  let mouthPath, eyeStyle = 'normal'
  if (percentage < 20) { mouthPath = 'M 14 30 Q 24 36 34 30' }
  else if (percentage < 40) { mouthPath = 'M 14 30 L 34 30' }
  else if (percentage < 60) { mouthPath = 'M 14 32 Q 24 28 34 32' }
  else if (percentage < 80) { mouthPath = 'M 14 34 Q 24 26 34 34'; eyeStyle = 'narrow' }
  else { mouthPath = 'M 14 35 Q 24 25 34 35'; eyeStyle = 'wide' }

  const eyeWidth = eyeStyle === 'wide' ? 6 : eyeStyle === 'narrow' ? 4 : 5
  const eyeHeight = eyeStyle === 'wide' ? 7 : eyeStyle === 'narrow' ? 3 : 5

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <rect x="4" y="4" width="40" height="40" rx="10" ry="10"
        stroke="var(--text-primary)" strokeWidth="2.5" fill="none" />
      <rect x={14 - eyeWidth / 2} y={18 - eyeHeight / 2} width={eyeWidth} height={eyeHeight} rx="1"
        fill="var(--text-primary)" />
      <rect x={34 - eyeWidth / 2} y={18 - eyeHeight / 2} width={eyeWidth} height={eyeHeight} rx="1"
        fill="var(--text-primary)" />
      <path d={mouthPath} stroke="var(--text-primary)" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  )
}

// -- Auto-grow textarea (expands up to ~10 lines, then user can drag to resize)

function AutoGrowTextarea({ value, onChange, onBlur, placeholder }) {
  const ref = useRef(null)
  const [userResized, setUserResized] = useState(false)

  // Resize to fit content, capped at ~10 lines (220px)
  const resize = () => {
    const el = ref.current
    if (!el || userResized) return
    el.style.height = 'auto'
    const next = Math.min(el.scrollHeight, 220)
    el.style.height = `${Math.max(72, next)}px`
  }

  useEffect(() => { resize() }, [value])
  useEffect(() => { resize() }, [])

  return (
    <textarea
      ref={ref}
      className="textarea"
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      placeholder={placeholder}
      onMouseDown={(e) => {
        // If user grabs the resize handle, stop auto-growing
        const el = e.currentTarget
        const rect = el.getBoundingClientRect()
        const nearCorner = e.clientX > rect.right - 16 && e.clientY > rect.bottom - 16
        if (nearCorner) setUserResized(true)
      }}
      style={{
        fontSize: 13,
        minHeight: 72,
        lineHeight: 1.5,
        resize: 'vertical',
        overflowY: 'auto',
      }}
    />
  )
}

// -- Toggle switch ------------------------------------------------------------

function ToggleSwitch({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 44, height: 24, borderRadius: 12, border: 'none',
        background: checked ? 'var(--success)' : 'var(--bg-tertiary)',
        position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
        flexShrink: 0,
        outline: checked ? 'none' : '1px solid var(--border)',
      }}
    >
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 3, left: checked ? 23 : 3,
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  )
}

// -- Chip (matches Swift: blue tinted for blocked/productive, orange for distracting)

function WordChip({ word, listType, hasSchedule, bundleId, unblockUntil, onClick }) {
  const isDistracting = listType === 'distracting'
  const accent = isDistracting ? '#F59E0B' : '#3B82F6'

  // Active temporary unblock: show a green "unblocked Xm" pill so the chip
  // visibly reflects that this blocked entry is currently permitted.
  const unblockMs = unblockUntil && unblockUntil > Date.now() ? unblockUntil - Date.now() : 0
  const unblockMinsLeft = unblockMs > 0 ? Math.max(1, Math.round(unblockMs / 60000)) : 0

  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 10px 4px 4px', borderRadius: 6, fontSize: 12, fontWeight: 500,
        background: `${accent}14`,
        border: `1.5px solid ${accent}`,
        color: accent,
        cursor: 'pointer', transition: 'all 0.15s', userSelect: 'none', lineHeight: 1.3,
      }}
    >
      {bundleId && <AppIcon name={word} bundleId={bundleId} size={18} />}
      <span style={{ paddingLeft: bundleId ? 0 : 6 }}>{word}</span>
      {unblockMinsLeft > 0 && (
        <span style={{
          fontSize: 9, fontWeight: 600, color: '#16a34a',
          padding: '2px 5px', borderRadius: 99, background: 'rgba(34,197,94,0.15)',
        }}>unblocked {unblockMinsLeft}m</span>
      )}
      {hasSchedule && unblockMinsLeft === 0 && (
        <span style={{
          fontSize: 9, fontWeight: 500, color: `${accent}99`,
          padding: '2px 5px', borderRadius: 99, background: `${accent}18`,
        }}>scheduled</span>
      )}
      <XCircle size={12} style={{ opacity: 0.7, flexShrink: 0 }} />
    </button>
  )
}

// -- Color helpers for lists & scores (matches Swift AdminView) ----------------

function listColor(list) {
  if (list === 'blocked') return '#EF4444'
  if (list === 'distracting') return '#F59E0B'
  if (list === 'productive') return '#22C55E'
  return 'var(--text-secondary)'
}

function wordScoreColor(s) {
  if (s <= 2) return '#22C55E'
  if (s <= 4) return '#EAB308'
  if (s <= 6) return '#F59E0B'
  return '#EF4444'
}

// -- Chip Detail Popover (matches Swift chipDetailPopover) ---------------------

function isDomainLike(word) {
  if (!word) return false
  const w = word.trim().toLowerCase()
  if (w.includes(' ')) return false
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(w)
}

function WordLeadingIcon({ wordEntry, size = 32 }) {
  const word = wordEntry.word || ''
  const bundleId = wordEntry.bundle_id || wordEntry.bundleId
  const [faviconFailed, setFaviconFailed] = useState(false)

  if (bundleId) {
    return <AppIcon name={word} bundleId={bundleId} size={size} />
  }

  if (isDomainLike(word) && !faviconFailed) {
    return (
      <img
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(word)}&sz=64`}
        alt={word}
        onError={() => setFaviconFailed(true)}
        style={{
          width: size, height: size, borderRadius: 8, flexShrink: 0, objectFit: 'cover',
          background: 'var(--surface-secondary, rgba(127,127,127,0.08))',
          boxShadow: 'inset 0 0 0 1px var(--border)',
        }}
      />
    )
  }

  const letter = (word || '?')[0].toUpperCase()
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6']
  const idx = word ? word.charCodeAt(0) % colors.length : 0
  return (
    <div style={{
      width: size, height: size, borderRadius: 8,
      background: colors[idx], display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: size * 0.44, fontWeight: 700, flexShrink: 0,
      letterSpacing: 0.2,
    }}>
      {letter}
    </div>
  )
}

function ChipDetailPopover({ wordEntry, onClose, onRemove, onConfigureSchedule, onRevokeUnblock }) {
  const [hoverSchedule, setHoverSchedule] = useState(false)
  const [hoverRemove, setHoverRemove] = useState(false)
  const [hoverClose, setHoverClose] = useState(false)

  if (!wordEntry) return null
  const lc = listColor(wordEntry.list)
  const scoreColor = wordScoreColor(wordEntry.score ?? 0)

  const hasActiveUnblock = wordEntry.unblock_until && wordEntry.unblock_until > Date.now()
  const unblockMinsLeft = hasActiveUnblock
    ? Math.max(1, Math.round((wordEntry.unblock_until - Date.now()) / 60000))
    : 0

  const rows = []
  rows.push({ label: 'Added by', value: wordEntry.added_by || wordEntry.addedBy || 'unknown' })
  if (wordEntry.reason) rows.push({ label: 'Reason', value: wordEntry.reason, multiline: true })
  if (wordEntry.schedule) {
    if (wordEntry.schedule.end_date) rows.push({ label: 'Expires', value: wordEntry.schedule.end_date })
    if (wordEntry.schedule.days?.length) rows.push({ label: 'Days', value: wordEntry.schedule.days.join(', ') })
    if (wordEntry.schedule.start_time && wordEntry.schedule.end_time)
      rows.push({ label: 'Time', value: `${wordEntry.schedule.start_time} - ${wordEntry.schedule.end_time}` })
  }
  if (wordEntry.associated_words?.length)
    rows.push({ label: 'Also matches', value: `${wordEntry.associated_words.length} related words` })

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(10,10,15,0.28)',
        backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
      }}
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 320, background: 'var(--background)', borderRadius: 16,
        boxShadow: '0 24px 60px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.08), 0 0 0 1px var(--border)',
        padding: 18, overflow: 'hidden',
      }}>
        {/* Close button */}
        <button
          onClick={onClose}
          onMouseEnter={() => setHoverClose(true)}
          onMouseLeave={() => setHoverClose(false)}
          style={{
            position: 'absolute', top: 10, right: 10, width: 24, height: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', borderRadius: 999, cursor: 'pointer',
            background: hoverClose ? 'var(--surface-secondary, rgba(127,127,127,0.12))' : 'transparent',
            color: 'var(--text-secondary)', transition: 'background 120ms ease',
          }}
          aria-label="Close"
        >
          <X size={14} />
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, paddingRight: 28 }}>
          <WordLeadingIcon wordEntry={wordEntry} size={36} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: 16, fontWeight: 700, color: 'var(--text-primary)',
              letterSpacing: -0.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{wordEntry.word}</div>
            <div style={{ display: 'flex', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 10, fontWeight: 600, color: lc, letterSpacing: 0.2,
                padding: '2px 8px', borderRadius: 99, background: `${lc}18`,
                textTransform: 'uppercase',
              }}>{wordEntry.list}</span>
              <span style={{
                fontSize: 10, fontWeight: 600, color: scoreColor, letterSpacing: 0.2,
                padding: '2px 8px', borderRadius: 99, background: `${scoreColor}18`,
              }}>{wordEntry.score}/10</span>
              {hasActiveUnblock && (
                <span style={{
                  fontSize: 10, fontWeight: 600, color: '#16a34a', letterSpacing: 0.2,
                  padding: '2px 8px', borderRadius: 99, background: 'rgba(34,197,94,0.15)',
                }}>unblocked {unblockMinsLeft}m</span>
              )}
            </div>
          </div>
        </div>

        {hasActiveUnblock && (
          <div style={{
            marginBottom: 12, padding: '10px 12px', borderRadius: 10,
            background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          }}>
            <div style={{ fontSize: 11.5, color: '#16a34a', fontWeight: 600 }}>
              Temporarily allowed - {unblockMinsLeft} min left
            </div>
            {onRevokeUnblock && (
              <button
                onClick={() => { onRevokeUnblock(); onClose() }}
                style={{
                  fontSize: 11, fontWeight: 600, color: '#16a34a',
                  padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                  background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
                }}
              >
                Re-block now
              </button>
            )}
          </div>
        )}

        {/* Info rows */}
        {rows.length > 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column',
            padding: '10px 12px', borderRadius: 10,
            background: 'var(--surface-secondary, rgba(127,127,127,0.06))',
            marginBottom: 12,
          }}>
            {rows.map((row, i) => (
              <div key={row.label} style={{
                display: 'flex',
                flexDirection: row.multiline ? 'column' : 'row',
                alignItems: row.multiline ? 'flex-start' : 'flex-start',
                gap: row.multiline ? 2 : 10,
                padding: '6px 0',
                borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <span style={{
                  fontSize: 10.5, fontWeight: 600,
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase', letterSpacing: 0.6,
                  width: row.multiline ? 'auto' : 78, flexShrink: 0,
                  paddingTop: row.multiline ? 0 : 1,
                }}>{row.label}</span>
                <span style={{
                  fontSize: 12.5, color: 'var(--text-primary)',
                  lineHeight: 1.4, flex: 1, wordBreak: 'break-word',
                }}>{row.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {onConfigureSchedule && (
            <button
              onClick={onConfigureSchedule}
              onMouseEnter={() => setHoverSchedule(true)}
              onMouseLeave={() => setHoverSchedule(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '10px 12px', border: 'none', borderRadius: 10,
                background: hoverSchedule ? 'var(--surface-secondary, rgba(127,127,127,0.1))' : 'transparent',
                color: 'var(--text-primary)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                textAlign: 'left', transition: 'background 120ms ease',
              }}
            >
              <CalendarClock size={15} style={{ opacity: 0.85 }} />
              <span style={{ flex: 1 }}>Configure schedule</span>
              <ChevronRight size={14} style={{ opacity: 0.5 }} />
            </button>
          )}
          {onRemove && (
            <button
              onClick={() => { onRemove(); onClose() }}
              onMouseEnter={() => setHoverRemove(true)}
              onMouseLeave={() => setHoverRemove(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '10px 12px', border: 'none', borderRadius: 10,
                background: hoverRemove ? 'rgba(239,68,68,0.10)' : 'transparent',
                color: '#EF4444', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                textAlign: 'left', transition: 'background 120ms ease',
              }}
            >
              <Trash2 size={14} />
              <span>Remove from list</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// -- Recent Apps Table (matches Swift AdminView recentAppsSection) -------------

function RecentAppsTable({ apps }) {
  if (!apps || apps.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: 12, textAlign: 'center' }}>
        No apps tracked yet. Activity will appear here as apps are detected.
      </div>
    )
  }

  // Aggregate by app name, keep highest score
  const agg = {}
  for (const e of apps) {
    const k = (e.app || '').toLowerCase()
    if (!k) continue
    if (!agg[k] || (e.score || 0) > (agg[k].score || 0)) agg[k] = { ...e }
  }
  const sorted = Object.values(agg).sort((a, b) => (b.score || 0) - (a.score || 0))

  return (
    <div>
      <div style={{
        display: 'flex', padding: '4px 8px', fontSize: 10, fontWeight: 600,
        color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>
        <span style={{ flex: 1 }}>App</span>
        <span style={{ width: 80, textAlign: 'center' }}>List</span>
        <span style={{ width: 50, textAlign: 'right' }}>Score</span>
      </div>
      {sorted.slice(0, 30).map((entry, idx) => {
        const lc = listColor(entry.classification)
        return (
          <div key={`${entry.app}-${idx}`} style={{
            display: 'flex', alignItems: 'center', padding: '4px 8px', borderRadius: 4,
            background: idx % 2 === 0 ? 'var(--bg-tertiary)' : 'transparent',
          }}>
            <span style={{ flex: 1, fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {entry.app}
            </span>
            <span style={{ width: 80, textAlign: 'center' }}>
              <span style={{
                display: 'inline-block', fontSize: 10, fontWeight: 500, color: lc,
                padding: '2px 6px', borderRadius: 99, background: `${lc}18`,
              }}>{entry.classification || 'unknown'}</span>
            </span>
            <span style={{
              width: 50, textAlign: 'right', fontSize: 12,
              fontFamily: "'SF Mono', 'Menlo', monospace", color: wordScoreColor(entry.score || 0),
            }}>{entry.score || 0}</span>
          </div>
        )
      })}
    </div>
  )
}

// -- Configuration Popup (matches Swift's BlockingConfigurationWidget) ---------

function ConfigPopup({ word, listType, onClose, onSave }) {
  const [mode, setMode] = useState('duration') // 'duration' | 'schedule'
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [sliderValue, setSliderValue] = useState(minutesToSlider(60))

  // Schedule state
  const [selectedDays, setSelectedDays] = useState(['mon', 'tue', 'wed', 'thu', 'fri'])
  const [allDay, setAllDay] = useState(false)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')

  // Pending save (for the block confirmation step)
  const [pendingSave, setPendingSave] = useState(null)

  const colors = LIST_COLORS[listType] || LIST_COLORS.blocked
  const actionLabel = listType === 'blocked' ? 'Block' : listType === 'productive' ? 'Allow' : 'Mark distracting'

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
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
  }

  const handleSchedulePreset = (preset) => {
    if (preset === 'always') {
      setSelectedDays(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
      setAllDay(true)
    } else if (preset === 'weekdays') {
      setSelectedDays(['mon', 'tue', 'wed', 'thu', 'fri'])
      setAllDay(false)
      setStartTime('09:00')
      setEndTime('17:00')
    } else if (preset === 'weekends') {
      setSelectedDays(['sat', 'sun'])
      setAllDay(true)
    }
  }

  const getScheduleSummary = () => {
    const dayNames = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }
    const allWeekdays = ['mon', 'tue', 'wed', 'thu', 'fri'].every(d => selectedDays.includes(d)) &&
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
          type: 'schedule',
          days: selectedDays,
          allDay,
          startTime: allDay ? null : startTime,
          endTime: allDay ? null : endTime,
        }

    // For blocked items, show a confirmation step before saving
    if (listType === 'blocked') {
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
      {/* Backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }} />

      {/* Popup card */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative', width: 340, background: 'var(--background)',
          borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.25), 0 0 0 1px var(--border)',
          overflow: 'hidden',
        }}
      >
        {pendingSave ? (
          // Block confirmation screen
          (() => {
            const macInstructions = (window.__overlordPersonality?.macInstructions || '').trim()
            return (
              <div style={{ padding: '20px 22px 18px' }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
                  Block {word}?
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 14 }}>
                  Once blocked, you can't just delete this from the list - you'll have to <strong style={{ color: 'var(--text-primary)' }}>persuade Overlord</strong> to remove it. Overlord decides based on your <strong style={{ color: 'var(--text-primary)' }}>Mac instructions</strong> below.
                </div>

                {/* Mac instructions preview */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{
                    fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)',
                    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
                  }}>
                    Your Mac instructions
                  </div>
                  <div style={{
                    padding: '10px 12px', borderRadius: 8,
                    background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                    fontSize: 12, lineHeight: 1.5, color: 'var(--text-primary)',
                    maxHeight: 140, overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {macInstructions || (
                      <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                        No Mac instructions set yet. Overlord won't have context to decide when to unblock - consider setting these first in the Mac Instructions card above.
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setPendingSave(null)}
                    style={{
                      flex: 1, padding: '10px 0', border: '1px solid var(--border)',
                      borderRadius: 10, background: 'transparent', color: 'var(--text-primary)',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const saved = pendingSave
                      setPendingSave(null)
                      onSave(saved)
                    }}
                    style={{
                      flex: 1, padding: '10px 0', border: 'none',
                      borderRadius: 10, background: '#EF4444', color: '#fff',
                      fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    Block {word}
                  </button>
                </div>
              </div>
            )
          })()
        ) : (
          <ConfigPopupContent
            word={word}
            listType={listType}
            mode={mode}
            setMode={setMode}
            sliderValue={sliderValue}
            durationMinutes={durationMinutes}
            handleSliderChange={handleSliderChange}
            handlePreset={handlePreset}
            selectedDays={selectedDays}
            toggleDay={toggleDay}
            allDay={allDay}
            setAllDay={setAllDay}
            startTime={startTime}
            setStartTime={setStartTime}
            endTime={endTime}
            setEndTime={setEndTime}
            handleSchedulePreset={handleSchedulePreset}
            getScheduleSummary={getScheduleSummary}
            handleSave={handleSave}
            colors={colors}
            actionLabel={actionLabel}
          />
        )}
      </div>
    </div>
  )
}

// -- ConfigPopup content (extracted so we can conditionally render confirm view) -----

function ConfigPopupContent({
  word, listType, mode, setMode, sliderValue, durationMinutes,
  handleSliderChange, handlePreset, selectedDays, toggleDay,
  allDay, setAllDay, startTime, setStartTime, endTime, setEndTime,
  handleSchedulePreset, getScheduleSummary, handleSave, colors, actionLabel,
}) {
  return (
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
          <div style={{
            display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 8, padding: 3,
          }}>
            {[
              { key: 'duration', label: 'For a duration', icon: Clock },
              { key: 'schedule', label: 'On a schedule', icon: Calendar },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setMode(tab.key)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  padding: '7px 0', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500,
                  cursor: 'pointer', transition: 'all 0.15s',
                  background: mode === tab.key ? 'var(--background)' : 'transparent',
                  color: mode === tab.key ? 'var(--text-primary)' : 'var(--text-secondary)',
                  boxShadow: mode === tab.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
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
              {/* Duration label + value */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{actionLabel} for</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: colors.accent }}>{formatDuration(durationMinutes)}</span>
              </div>

              {/* Slider */}
              <div style={{ position: 'relative', marginBottom: 4 }}>
                <input
                  type="range" min="0" max="1" step="0.001"
                  value={sliderValue}
                  onChange={handleSliderChange}
                  style={{
                    width: '100%', height: 6, borderRadius: 3,
                    appearance: 'none', outline: 'none',
                    background: `linear-gradient(to right, ${colors.accent} ${sliderValue * 100}%, var(--bg-tertiary) ${sliderValue * 100}%)`,
                    cursor: 'pointer',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 14 }}>
                <span>1 min</span>
                <span>30 days</span>
              </div>

              {/* Quick presets */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {DURATION_PRESETS.map(p => (
                  <button
                    key={p.minutes}
                    onClick={() => handlePreset(p.minutes)}
                    style={{
                      padding: '5px 10px', border: 'none', borderRadius: 6,
                      fontSize: 11, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
                      background: durationMinutes === p.minutes ? colors.accent : 'var(--bg-tertiary)',
                      color: durationMinutes === p.minutes ? '#fff' : 'var(--text-primary)',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* Schedule presets */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                {[
                  { key: 'always', label: 'Always' },
                  { key: 'weekdays', label: 'Weekdays 9-5' },
                  { key: 'weekends', label: 'Weekends' },
                ].map(p => (
                  <button
                    key={p.key}
                    onClick={() => handleSchedulePreset(p.key)}
                    style={{
                      padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 99,
                      fontSize: 11, fontWeight: 500, cursor: 'pointer',
                      background: 'transparent', color: 'var(--text-primary)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Day picker */}
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>Active days</div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
                {DAYS.map((day, i) => (
                  <button
                    key={`${day.key}-${i}`}
                    onClick={() => toggleDay(day.key)}
                    style={{
                      flex: 1, height: 32, border: 'none', borderRadius: 7,
                      fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                      background: selectedDays.includes(day.key) ? colors.accent : 'var(--bg-tertiary)',
                      color: selectedDays.includes(day.key) ? '#fff' : 'var(--text-secondary)',
                    }}
                  >
                    {day.label}
                  </button>
                ))}
              </div>

              {/* All day toggle */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 8, marginBottom: 12,
              }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>All day</span>
                <ToggleSwitch checked={allDay} onChange={setAllDay} />
              </div>

              {/* Time pickers (when not all day) */}
              {!allDay && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>Active hours</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="time" value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      style={{
                        flex: 1, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)',
                        background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 13,
                      }}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>to</span>
                    <input
                      type="time" value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      style={{
                        flex: 1, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)',
                        background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 13,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Schedule summary */}
              <div style={{
                padding: '8px 10px', borderRadius: 8,
                background: colors.bg, fontSize: 12, color: 'var(--text-secondary)',
              }}>
                {getScheduleSummary()}
              </div>
            </>
          )}
        </div>

        {/* Action button */}
        <div style={{ padding: '0 20px 20px' }}>
          <button
            onClick={handleSave}
            style={{
              width: '100%', padding: '10px 0', border: 'none', borderRadius: 10,
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              background: colors.accent, color: '#fff',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
          >
            {actionLabel} {word}
          </button>
        </div>
      </>
  )
}

// -- Add input ----------------------------------------------------------------

function AddInput({ placeholder, onAdd }) {
  const [value, setValue] = useState('')

  const handleAdd = () => {
    const trimmed = value.trim()
    if (trimmed) { onAdd(trimmed); setValue('') }
  }

  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
      <input
        className="input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        placeholder={placeholder}
        style={{ flex: 1, fontSize: 13, borderRadius: 10, padding: '8px 14px' }}
      />
      <button
        onClick={handleAdd}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 34, height: 34, borderRadius: '50%',
          border: '1px solid var(--border)', background: 'var(--bg-tertiary)',
          color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0,
        }}
      >
        <Plus size={15} />
      </button>
    </div>
  )
}

// -- App Picker Dialog (pick an app from recent activity or type custom) ------

function AppPickerDialog({ listType, recentApps, wordsByList, onClose, onPick }) {
  const [query, setQuery] = useState('')

  // Dedupe recent apps by name, exclude anything already in the target list
  const alreadyInTargetList = new Set(
    (wordsByList[listType] || []).map(w => w.word.toLowerCase())
  )

  // Build list of unique apps (most recent first)
  const seenNames = new Set()
  const pickableApps = []
  for (const entry of recentApps) {
    const name = entry.app
    if (!name) continue
    const key = name.toLowerCase()
    if (seenNames.has(key)) continue
    seenNames.add(key)
    // Which list is it already in (if any)?
    let existingList = null
    for (const k of ['blocked', 'distracting', 'productive']) {
      if ((wordsByList[k] || []).some(w => w.word.toLowerCase() === key)) {
        existingList = k; break
      }
    }
    pickableApps.push({
      name,
      bundleId: entry.bundleId,
      lastSeenTs: entry.timestamp,
      existingList,
      isInTarget: alreadyInTargetList.has(key),
    })
  }

  const filtered = pickableApps.filter(a =>
    !query || a.name.toLowerCase().includes(query.toLowerCase())
  )

  const queryMatchesExisting = pickableApps.some(
    a => a.name.toLowerCase() === query.toLowerCase().trim()
  )

  const formatAgo = (ts) => {
    if (!ts) return ''
    // app-monitor outputs seconds since epoch, others use ms.
    // If ts < 1e12 it's in seconds - convert to ms.
    const tsMs = ts < 1e12 ? ts * 1000 : ts
    const diff = Date.now() - tsMs
    if (diff < 0) return 'just now'
    const s = Math.round(diff / 1000)
    if (s < 10) return 'just now'
    if (s < 60) return `${s}s ago`
    const m = Math.round(s / 60)
    if (m < 60) return `${m}m ago`
    const h = Math.round(m / 60)
    if (h < 24) return `${h}h ago`
    const d = Math.round(h / 24)
    if (d < 7) return `${d}d ago`
    const w = Math.round(d / 7)
    if (w < 5) return `${w}w ago`
    return `${Math.round(d / 30)}mo ago`
  }

  const actionLabel = listType === 'blocked' ? 'Add to blocked'
    : listType === 'productive' ? 'Add to productive' : 'Add to distracting'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }} />
      <div onClick={(e) => e.stopPropagation()} style={{
        position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)',
        width: 460, maxHeight: '75vh',
        background: 'var(--background)', borderRadius: 14,
        boxShadow: '0 24px 60px rgba(0,0,0,0.3), 0 0 0 1px var(--border)',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{actionLabel}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {listType === 'blocked'
              ? 'Pick an app, then configure how to block it'
              : 'Pick a recently active app or type a custom keyword'}
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '6px 10px', background: 'var(--bg-tertiary)', borderRadius: 8,
          }}>
            <Search size={14} color="var(--text-tertiary)" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or type custom keyword..."
              style={{
                flex: 1, border: 'none', outline: 'none', background: 'transparent',
                fontSize: 13, color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>

        {/* App list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
          {filtered.length === 0 && !query && (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>
              No recent apps detected yet.
            </div>
          )}
          {filtered.map((app) => (
            <button
              key={app.name}
              onClick={() => !app.isInTarget && onPick(app.name)}
              disabled={app.isInTarget}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 8, border: 'none',
                background: 'transparent', cursor: app.isInTarget ? 'default' : 'pointer',
                textAlign: 'left', opacity: app.isInTarget ? 0.5 : 1,
              }}
              onMouseEnter={(e) => { if (!app.isInTarget) e.currentTarget.style.background = 'var(--bg-tertiary)' }}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <AppIcon name={app.name} bundleId={app.bundleId} size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{app.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                  {app.lastSeenTs && `Seen ${formatAgo(app.lastSeenTs)}`}
                  {app.existingList && ` · currently in ${app.existingList}`}
                </div>
              </div>
              {app.isInTarget ? (
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 99,
                  background: `${listColor(listType)}18`, color: listColor(listType),
                }}>Added</span>
              ) : (
                <Plus size={14} color="var(--text-tertiary)" />
              )}
            </button>
          ))}

          {/* Custom keyword row */}
          {query.trim() && !queryMatchesExisting && (
            <button
              onClick={() => onPick(query.trim())}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 10px', borderRadius: 8, border: '1px dashed #3B82F660',
                background: '#3B82F608', cursor: 'pointer', marginTop: 6, textAlign: 'left',
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 6, background: '#3B82F618',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Plus size={14} color="#3B82F6" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Add "{query.trim()}"</div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Custom keyword</div>
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// -- Word list section --------------------------------------------------------

function WordListSection({ title, subtitle, fullWords, category, onChipClick, onAddClick, bundleIdByWord }) {
  const [showAll, setShowAll] = useState(false)
  const maxVisible = 12
  const visible = (!showAll && fullWords.length > maxVisible) ? fullWords.slice(0, maxVisible) : fullWords
  const hiddenCount = fullWords.length - maxVisible

  const isDistracting = category === 'distracting'
  const accent = isDistracting ? '#F59E0B' : '#3B82F6'

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>{subtitle}</div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {visible.map((w) => (
          <WordChip
            key={w.word}
            word={w.word}
            listType={category}
            hasSchedule={!!w.schedule}
            bundleId={bundleIdByWord?.[w.word.toLowerCase()]}
            unblockUntil={w.unblock_until}
            onClick={() => onChipClick(w, category)}
          />
        ))}
        {!showAll && hiddenCount > 0 && (
          <button
            onClick={() => setShowAll(true)}
            style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
              background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
              cursor: 'pointer', border: '1px solid var(--border)',
            }}
          >
            +{hiddenCount} more
          </button>
        )}

        {/* "+ Add" chip - matches word chip style but dashed */}
        <button
          onClick={() => onAddClick(category)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
            background: 'transparent', border: `1.5px dashed ${accent}80`,
            color: `${accent}CC`, cursor: 'pointer', lineHeight: 1.3,
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = `${accent}08`}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <Plus size={13} /> Add
        </button>
      </div>
    </div>
  )
}

// -- Status badge for AI decisions --------------------------------------------

function StatusBadge({ classification }) {
  const config = {
    blocked: { bg: 'rgba(239,68,68,0.12)', color: 'var(--danger)', label: 'Blocked' },
    distracting: { bg: 'rgba(245,158,11,0.12)', color: 'var(--warning)', label: 'Distracting' },
    productive: { bg: 'rgba(34,197,94,0.12)', color: 'var(--success)', label: 'Allowed' },
    allowed: { bg: 'rgba(34,197,94,0.12)', color: 'var(--success)', label: 'Allowed' },
    unknown: { bg: 'var(--bg-tertiary)', color: 'var(--text-secondary)', label: 'Unknown' },
  }
  const c = config[classification] || config.unknown
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 99,
      fontSize: 10, fontWeight: 600, background: c.bg, color: c.color, whiteSpace: 'nowrap',
    }}>
      {c.label}
    </span>
  )
}

function formatTime(ts) {
  const d = new Date(ts)
  const h = d.getHours(), m = d.getMinutes().toString().padStart(2, '0')
  const s = d.getSeconds().toString().padStart(2, '0')
  return `${h % 12 || 12}:${m}:${s} ${h >= 12 ? 'pm' : 'am'}`
}

// Cache native app icons across renders keyed by bundleId
const _iconCache = new Map()

function AppIcon({ name, bundleId, size = 28 }) {
  const [iconUrl, setIconUrl] = useState(() => (bundleId ? _iconCache.get(bundleId) : null) || null)

  useEffect(() => {
    if (!bundleId || iconUrl) return
    if (_iconCache.has(bundleId)) {
      setIconUrl(_iconCache.get(bundleId))
      return
    }
    if (window.electronAPI?.getAppIcon) {
      window.electronAPI.getAppIcon(bundleId).then((url) => {
        _iconCache.set(bundleId, url)
        if (url) setIconUrl(url)
      }).catch(() => {})
    }
  }, [bundleId, iconUrl])

  if (iconUrl) {
    return (
      <img src={iconUrl} alt={name} style={{
        width: size, height: size, borderRadius: 6,
        flexShrink: 0, objectFit: 'cover',
      }} />
    )
  }

  // Fallback: colored letter tile
  const letter = (name || '?')[0].toUpperCase()
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6']
  const idx = name ? name.charCodeAt(0) % colors.length : 0
  return (
    <div style={{
      width: size, height: size, borderRadius: 6,
      background: colors[idx], display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: size * 0.4, fontWeight: 600, flexShrink: 0,
    }}>
      {letter}
    </div>
  )
}

// ============================================================================
// Main Panel
// ============================================================================

export default function BlockingPanel() {
  const [scoreState, setScoreState] = useState({ currentScore: 0, threshold: 50 })
  const [words, setWords] = useState({ blocked: [], distracting: [], productive: [] })
  const [nsfwEnabled, setNsfwEnabled] = useState(true)
  const [macInstructions, setMacInstructions] = useState('')
  const [instructionsDirty, setInstructionsDirty] = useState(false)
  const [recentApps, setRecentApps] = useState([])
  const [feedFilter, setFeedFilter] = useState('all')

  // Popover state: detail popover for chip info, schedule popover for configure,
  // picker popover for the "+ Add" app selector.
  const [detailPopover, setDetailPopover] = useState(null) // wordEntry
  const [schedulePopover, setSchedulePopover] = useState(null) // { word, listType, isNew }
  const [pickerListType, setPickerListType] = useState(null) // 'blocked' | 'distracting' | 'productive' | null
  const [scoreInfoOpen, setScoreInfoOpen] = useState(false)

  // Sync data every 1.5s
  useEffect(() => {
    const sync = () => {
      if (score) {
        const s = score.getState()
        setScoreState({
          currentScore: Math.round(s.currentScore),
          threshold: s.threshold,
          pollLog: s.pollLog || [],
        })
      }
      if (wordList) {
        setWords({
          blocked: wordList.getWordsByList('blocked'),
          distracting: wordList.getWordsByList('distracting'),
          productive: wordList.getWordsByList('productive'),
        })
      }
      if (nsfw) setNsfwEnabled(nsfw.isEnabled)
      if (engine) setRecentApps(engine.getRecentApps())
    }
    sync()
    const interval = setInterval(sync, 1500)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const personality = window.__overlordPersonality
    if (personality?.macInstructions) setMacInstructions(personality.macInstructions)
  }, [])

  const handleNsfwToggle = useCallback((enabled) => {
    setNsfwEnabled(enabled)
    if (nsfw) nsfw.isEnabled = enabled
  }, [])

  const handleSaveInstructions = useCallback(async () => {
    const user = auth.currentUser
    if (user?.email) {
      try {
        await saveMacInstructions(user.email, macInstructions)
        setInstructionsDirty(false)
      } catch (err) { console.error('Failed to save mac instructions:', err) }
    }
  }, [macInstructions])

  // Chip click opens the detail popover (matching Swift behavior)
  const handleChipClick = useCallback((wordEntry) => {
    setDetailPopover(wordEntry)
  }, [])

  const handleRemoveWord = useCallback((word) => {
    if (wordList) {
      wordList.removeWord(word)
      const user = auth.currentUser
      if (user?.email) saveWordList(user.email, wordList.getWords())
    }
  }, [])

  const handleRevokeUnblock = useCallback((word) => {
    if (!wordList) return
    wordList.clearUnblockUntil(word)
    const user = auth.currentUser
    if (user?.email) saveWordList(user.email, wordList.getWords())
  }, [])

  const handleScheduleSave = useCallback((config) => {
    if (!wordList || !schedulePopover) return
    const user = auth.currentUser
    const existing = wordList.getWords().find(w => w.word.toLowerCase() === schedulePopover.word.toLowerCase())

    // Base entry: existing word with its current fields, or a new entry if
    // this is a freshly-picked app from the + Add flow
    const baseEntry = existing || {
      word: schedulePopover.word,
      score: schedulePopover.listType === 'blocked' ? 9
        : schedulePopover.listType === 'distracting' ? 6 : 0,
      list: schedulePopover.listType,
      addedBy: 'user',
      reason: 'Added from blocking panel',
    }

    let schedule = null
    if (config.type === 'duration') {
      const end = new Date(Date.now() + config.minutes * 60000)
      schedule = { end_date: end.toISOString().split('T')[0] }
    } else {
      schedule = { days: config.days, start_time: config.startTime, end_time: config.endTime }
    }

    wordList.addWord({ ...baseEntry, schedule })
    if (user?.email) saveWordList(user.email, wordList.getWords())
    setSchedulePopover(null)
  }, [schedulePopover])

  // "+ Add" chip click: open the app picker for this list
  const handleAddClick = useCallback((listType) => {
    setPickerListType(listType)
  }, [])

  // User picked an app (or typed a custom keyword) from the picker
  const handlePickerPick = useCallback((appName) => {
    const listType = pickerListType
    setPickerListType(null)
    if (!listType || !wordList) return

    // For blocked: go straight into the schedule config dialog
    if (listType === 'blocked') {
      setSchedulePopover({ word: appName, listType, isNew: true })
      return
    }

    // For distracting/productive: just add directly with no schedule
    const scoreMap = { distracting: 6, productive: 0 }
    wordList.addWord({
      word: appName,
      score: scoreMap[listType] || 5,
      list: listType,
      addedBy: 'user',
      reason: 'Added from blocking panel',
    })
    const user = auth.currentUser
    if (user?.email) saveWordList(user.email, wordList.getWords())
  }, [pickerListType])

  // Build a word -> bundleId map from recent apps so chips can show real icons
  const bundleIdByWord = {}
  for (const entry of recentApps) {
    if (entry.app && entry.bundleId && !bundleIdByWord[entry.app.toLowerCase()]) {
      bundleIdByWord[entry.app.toLowerCase()] = entry.bundleId
    }
  }

  const { currentScore, threshold } = scoreState
  const pct = threshold > 0 ? (currentScore / threshold) * 100 : 0
  const scoreColor = getScoreColor(currentScore, threshold)
  const { title: attentionTitle, subtitle: attentionSubtitle } = getScoreLabel(currentScore, threshold)

  return (
    <div style={{ maxWidth: 600, paddingBottom: 40 }}>

      <PermissionsBanner />

      {/* Score card */}
      <div className="card" style={{ marginBottom: 16, padding: 14, position: 'relative' }}>
        <button
          type="button"
          aria-label="How does the distraction score work?"
          onClick={() => setScoreInfoOpen(v => !v)}
          style={{
            position: 'absolute', top: 10, right: 10,
            width: 22, height: 22, padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 11,
            background: scoreInfoOpen ? 'var(--bg-tertiary)' : 'transparent',
            border: '1px solid var(--border, rgba(0,0,0,0.08))',
            color: 'var(--text-tertiary, rgba(0,0,0,0.5))',
            cursor: 'pointer',
            zIndex: 2,
          }}
        >
          <Info size={12} strokeWidth={2} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingRight: 28 }}>
          <RobotFace percentage={pct} size={48} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{attentionTitle}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>{attentionSubtitle}</div>
          </div>
          <div style={{
            fontFamily: "'SF Mono', 'Menlo', monospace", fontSize: 16, fontWeight: 700,
            color: scoreColor, whiteSpace: 'nowrap',
          }}>
            {currentScore} / {threshold}
          </div>
        </div>

        {/* Segmented score bar - filled dots like Mac app */}
        <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
          {Array.from({ length: 20 }, (_, i) => {
            const segPct = ((i + 1) / 20) * 100
            const filled = pct >= segPct
            // Color shifts from green -> yellow -> orange -> red across segments
            const segColor = segPct <= 25 ? '#22c55e'
              : segPct <= 50 ? '#84cc16'
              : segPct <= 75 ? '#f59e0b'
              : '#ef4444'
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 6,
                  borderRadius: 3,
                  background: filled ? segColor : 'var(--bg-tertiary)',
                  transition: 'background 0.3s',
                }}
              />
            )
          })}
        </div>

        {/* Score history graph */}
        <div style={{ marginTop: 12 }}>
          <ScoreGraph pollLog={scoreState.pollLog || []} threshold={threshold} theme="light" height={70} />
        </div>

        {scoreInfoOpen && (
          <div style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 10,
            background: 'var(--bg-tertiary, rgba(0,0,0,0.03))',
            border: '1px solid var(--border, rgba(0,0,0,0.08))',
            fontSize: 12,
            lineHeight: 1.5,
            color: 'var(--text-secondary)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
              How your distraction score works
            </div>
            <div style={{ marginBottom: 8 }}>
              The score ticks up when you're on distracting or unknown apps, and ticks down when you're on productive ones or idle. When it hits the <strong>threshold ({threshold})</strong>, Overlord triggers a check-in.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
              <InfoRow color="#ef4444" label="Distracting apps" text="Score climbs quickly" />
              <InfoRow color="#6b7280" label="Unknown apps" text="Score climbs based on how distracting the app usually is" />
              <InfoRow color="#22c55e" label="Productive apps / idle" text="Score decays toward 0" />
              <InfoRow color="#3b82f6" label="Check-in triggered" text="Score resets to 0 after you respond" />
              <InfoRow color="#8b5cf6" label="Snooze" text="Score resets and check-ins pause for a bit" />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary, rgba(0,0,0,0.5))' }}>
              Hover any point on the graph to see exactly what caused that change.
            </div>
          </div>
        )}
      </div>

      {/* Mac Instructions */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>Mac Instructions</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
          Tell Overlord about your work so it can make smarter decisions
        </div>
        <AutoGrowTextarea
          value={macInstructions}
          onChange={(e) => { setMacInstructions(e.target.value); setInstructionsDirty(true) }}
          onBlur={() => { if (instructionsDirty) handleSaveInstructions() }}
          placeholder="e.g., I'm a software engineer working on a React project. VS Code, Terminal, and GitHub are productive for me."
        />
        {instructionsDirty && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn btn-primary" onClick={handleSaveInstructions} style={{ fontSize: 12, padding: '5px 14px' }}>
              Save
            </button>
          </div>
        )}
      </div>

      {/* Blocked */}
      <WordListSection
        title="Blocked"
        subtitle="Apps, sites and categories that will be blocked"
        fullWords={words.blocked}
        category="blocked"
        onChipClick={handleChipClick}
        onAddClick={handleAddClick}
        bundleIdByWord={bundleIdByWord}
      />

      {/* Distracting */}
      <WordListSection
        title="Distracting"
        subtitle="Apps that trigger check-ins but aren't blocked"
        fullWords={words.distracting}
        category="distracting"
        onChipClick={handleChipClick}
        onAddClick={handleAddClick}
        bundleIdByWord={bundleIdByWord}
      />

      {/* Productive */}
      <WordListSection
        title="Productive"
        subtitle="Apps, sites and categories you're allowed to use"
        fullWords={words.productive}
        category="productive"
        onChipClick={handleChipClick}
        onAddClick={handleAddClick}
        bundleIdByWord={bundleIdByWord}
      />

      {/* Live Feed */}
      {(() => {
        const filterMap = {
          all: () => true,
          blocked: (a) => a.classification === 'blocked',
          distracting: (a) => a.classification === 'distracting',
          allowed: (a) => a.classification === 'productive' || a.classification === 'allowed',
        }
        const filteredFeed = recentApps.filter(filterMap[feedFilter] || filterMap.all)
        const filterTabs = [
          { key: 'all', label: 'All', count: recentApps.length },
          { key: 'blocked', label: 'Blocked', count: recentApps.filter(filterMap.blocked).length },
          { key: 'distracting', label: 'Distracting', count: recentApps.filter(filterMap.distracting).length },
          { key: 'allowed', label: 'Allowed', count: recentApps.filter(filterMap.allowed).length },
        ]

        return (
          <div className="card" style={{ marginBottom: 28 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>Live Feed</div>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {filteredFeed.length} of {recentApps.length}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-tertiary)' }}>
                <span style={{
                  width: 6, height: 6, borderRadius: 3, background: '#22c55e',
                  animation: 'pulse 2s infinite',
                }} />
                LIVE
              </div>
            </div>

            {/* Filter chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {filterTabs.map((tab) => {
                const active = feedFilter === tab.key
                return (
                  <button
                    key={tab.key}
                    onClick={() => setFeedFilter(tab.key)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '4px 11px', borderRadius: 99,
                      border: active ? 'none' : '1px solid var(--border)',
                      background: active ? 'var(--text-primary)' : 'transparent',
                      color: active ? 'var(--background)' : 'var(--text-secondary)',
                      fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {tab.label}
                    <span style={{
                      fontSize: 10, fontWeight: 600,
                      padding: '1px 6px', borderRadius: 99,
                      background: active ? 'rgba(255,255,255,0.2)' : 'var(--bg-tertiary)',
                      color: active ? 'var(--background)' : 'var(--text-tertiary)',
                      minWidth: 16, textAlign: 'center',
                    }}>
                      {tab.count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Column header */}
            {filteredFeed.length > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '4px 8px 8px',
                fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)',
                textTransform: 'uppercase', letterSpacing: '0.05em',
                borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ minWidth: 72 }}>Time</span>
                <span style={{ width: 28 }} />
                <span style={{ flex: 1 }}>App</span>
                <span style={{ width: 68, textAlign: 'center' }}>Status</span>
                <span style={{ width: 48, textAlign: 'right' }}>Delta</span>
                <span style={{ width: 36, textAlign: 'right' }}>Score</span>
              </div>
            )}

            {/* Rows */}
            <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 520, overflowY: 'auto' }}>
              {filteredFeed.length === 0 && (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
                  No activity{feedFilter !== 'all' ? ` in "${feedFilter}"` : ''} yet
                </div>
              )}
              {filteredFeed.map((entry, idx) => {
                const delta = entry.scoreDelta ?? 0
                const total = entry.totalScore ?? 0
                const deltaColor = delta > 0.05 ? '#ef4444' : delta < -0.05 ? '#22c55e' : 'var(--text-tertiary)'
                return (
                  <div
                    key={`${entry.app}-${entry.timestamp}-${idx}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px',
                      background: idx % 2 === 0 ? 'transparent' : 'var(--bg-tertiary)',
                      borderRadius: 6,
                      transition: 'background 0.15s',
                    }}
                  >
                    <div style={{
                      fontFamily: "'SF Mono', 'Menlo', monospace", fontSize: 10,
                      color: 'var(--text-tertiary)', whiteSpace: 'nowrap', minWidth: 72,
                    }}>
                      {formatTime(entry.timestamp)}
                    </div>
                    <AppIcon name={entry.app} bundleId={entry.bundleId} size={28} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {entry.windowTitle || entry.app}
                      </div>
                      <div style={{
                        fontSize: 11, color: 'var(--text-secondary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {entry.app}
                        {entry.matchedWord && ` - "${entry.matchedWord}"`}
                      </div>
                    </div>
                    <div style={{ width: 68, display: 'flex', justifyContent: 'center' }}>
                      <StatusBadge classification={entry.classification} />
                    </div>
                    <div style={{
                      fontFamily: "'SF Mono', 'Menlo', monospace", fontSize: 11, fontWeight: 700,
                      color: deltaColor, width: 48, textAlign: 'right',
                    }}>
                      {delta >= 0 ? '+' : ''}{delta.toFixed(1)}
                    </div>
                    <div style={{
                      fontFamily: "'SF Mono', 'Menlo', monospace", fontSize: 11, fontWeight: 500,
                      color: 'var(--text-secondary)', width: 36, textAlign: 'right',
                    }}>
                      {total.toFixed(1)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Detail popover - shown on chip click */}
      {detailPopover && (
        <ChipDetailPopover
          wordEntry={detailPopover}
          onClose={() => setDetailPopover(null)}
          onRemove={() => handleRemoveWord(detailPopover.word)}
          onRevokeUnblock={() => handleRevokeUnblock(detailPopover.word)}
          onConfigureSchedule={() => {
            setSchedulePopover({ word: detailPopover.word, listType: detailPopover.list })
            setDetailPopover(null)
          }}
        />
      )}

      {/* Schedule config popover */}
      {schedulePopover && (
        <BlockConfigPopup
          word={schedulePopover.word}
          listType={schedulePopover.listType}
          onClose={() => setSchedulePopover(null)}
          onSave={handleScheduleSave}
        />
      )}

      {/* App picker dialog - shown when user clicks "+ Add" on a section */}
      {pickerListType && (
        <AppPickerDialog
          listType={pickerListType}
          recentApps={recentApps}
          wordsByList={words}
          onClose={() => setPickerListType(null)}
          onPick={handlePickerPick}
        />
      )}
    </div>
  )
}
