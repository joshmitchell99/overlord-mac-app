import React, { useState, useEffect, useRef } from 'react'
import { X, CheckCircle, MessageSquare, Send, Shield, ShieldCheck, Ban, Clock, ChevronDown, AlertTriangle, Lock } from 'lucide-react'
import OverlordChatWidget from '../components/OverlordChatWidget'
import SharedScoreGraph from '../components/ScoreGraph'

const BLOCK_DURATIONS = ['1 min', '10 min', '1 hour', 'Rest of day', 'Weekdays', 'Always']
const SNOOZE_OPTIONS = [
  { label: '1 min', minutes: 1 }, { label: '2 min', minutes: 2 }, { label: '3 min', minutes: 3 },
  { label: '5 min', minutes: 5 }, { label: '10 min', minutes: 10 }, { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 }, { label: '45 min', minutes: 45 }, { label: '1 hr', minutes: 60 },
  { label: '2 hr', minutes: 120 },
]

const MAX_CHAT_EXCHANGES = 4

/**
 * Split a response into a main sentence + bullet suggestions.
 * The server sometimes returns bullets inline: "...text. • Option 1 • Option 2"
 * We want to render those as clickable reply chips instead of raw text.
 */
function parseBullets(text) {
  if (!text || typeof text !== 'string') return { main: text || '', bullets: [] }
  // Only split on actual bullet glyphs (• · ‣) OR a dash/asterisk at the start
  // of a line. Never split on dashes in running prose like "Come on - X is ..."
  const parts = text.split(/(?:^|\n)\s*[•·‣]\s+|(?:^|\n)\s*[-*]\s+|\s[•·‣]\s+/)
    .map(s => s.trim())
    .filter(Boolean)
  if (parts.length < 2) return { main: text, bullets: [] }
  const [main, ...bullets] = parts
  return { main: main.replace(/[:.,\s]+$/, '').trim(), bullets }
}

// Convert a server tool_action entry into a readable "what happened" label.
// edit_mac_list shape: { list_name, add: [{word, score, ...}], remove: [words] }
// grant_mac_unblock shape: { app, duration_minutes }
function describeToolAction(ta) {
  if (typeof ta === 'string') return ta
  const tool = ta?.tool || ta?.name || ''
  const input = ta?.input || {}

  if (tool === 'edit_mac_list') {
    const listName = input.list_name || input.list || ''
    const addEntries = Array.isArray(input.add) ? input.add : []
    const removeEntries = Array.isArray(input.remove) ? input.remove : []

    const parts = []
    if (addEntries.length > 0) {
      const words = addEntries.map(e => (typeof e === 'string' ? e : e.word)).filter(Boolean)
      if (words.length > 0) {
        parts.push(`Added ${words.join(', ')}${listName ? ` to ${listName}` : ''}`)
      }
    }
    if (removeEntries.length > 0) {
      const words = removeEntries.map(e => (typeof e === 'string' ? e : e.word)).filter(Boolean)
      if (words.length > 0) {
        parts.push(`Removed ${words.join(', ')}${listName ? ` from ${listName}` : ''}`)
      }
    }
    if (parts.length > 0) return parts.join(' · ')
    return `Updated ${listName || 'list'}`
  }

  if (tool === 'grant_mac_unblock') {
    const app = input.app || input.word || 'app'
    const mins = input.duration_minutes || input.minutes
    return `Unblocked ${app}${mins ? ` for ${mins}m` : ''}`
  }

  return tool || 'Action taken'
}

// Short duration formatter: 25s / 3m / 1h 20m / 2h
function fmtDuration(sec) {
  if (!sec || sec < 1) return ''
  if (sec < 60) return `${Math.round(sec)}s`
  const m = Math.round(sec / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const remM = m % 60
  return remM > 0 ? `${h}h ${remM}m` : `${h}h`
}

// Human-readable block duration (accepts minutes)
function fmtBlockMinutes(mins) {
  if (mins < 60) return `${mins} min`
  if (mins === 60) return '1 hour'
  if (mins < 1440) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${h}h ${m}m` : `${h} hours`
  }
  if (mins === 1440) return '1 day'
  if (mins === 10080) return '1 week'
  if (mins === 43200) return '1 month'
  return `${Math.round(mins / 1440)} days`
}

// Log-scale slider mapping: value 0-1 -> 1 min to 30 days
function blockSliderToMin(v) {
  const raw = Math.exp(v * Math.log(43200))
  if (raw < 60) return Math.max(1, Math.round(raw))
  if (raw < 1440) return Math.round(raw / 15) * 15
  return Math.round(raw / 1440) * 1440
}

function blockMinToSlider(mins) {
  return Math.log(Math.max(1, mins)) / Math.log(43200)
}

// Inline slider popover for the "Block" button - defaults to 1 hour, matches
// the logarithmic slider from the BlockingPanel schedule config.
function BlockDurationPicker({ onConfirm, onCancel, appName }) {
  const [minutes, setMinutes] = useState(60)
  const [sliderVal, setSliderVal] = useState(blockMinToSlider(60))

  const onSlide = (e) => {
    const v = parseFloat(e.target.value)
    setSliderVal(v)
    setMinutes(blockSliderToMin(v))
  }

  return (
    <div style={{
      padding: '12px 14px',
      background: 'rgba(239,68,68,0.08)',
      border: '1px solid rgba(239,68,68,0.25)',
      borderRadius: 10,
      margin: '4px 4px 2px',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)', fontFamily: 'Figtree, sans-serif' }}>
          Block {appName} for
        </span>
        <span style={{
          fontSize: 15, fontWeight: 700, color: '#ef4444',
          fontFamily: 'Figtree, sans-serif',
        }}>
          {fmtBlockMinutes(minutes)}
        </span>
      </div>

      <input
        type="range" min="0" max="1" step="0.001"
        value={sliderVal} onChange={onSlide}
        style={{
          width: '100%', height: 6, appearance: 'none', outline: 'none',
          borderRadius: 3, cursor: 'pointer',
          background: `linear-gradient(to right, #ef4444 ${sliderVal*100}%, rgba(255,255,255,0.08) ${sliderVal*100}%)`,
          color: '#ef4444',
        }}
      />

      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'Figtree, sans-serif',
      }}>
        <span>1 min</span>
        <span>30 days</span>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={onCancel} style={{
          flex: '0 0 auto', padding: '7px 14px', fontSize: 12, fontWeight: 600,
          border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
          background: 'transparent', color: 'rgba(255,255,255,0.7)',
          cursor: 'pointer', fontFamily: 'Figtree, sans-serif',
        }}>Cancel</button>
        <button onClick={() => onConfirm(minutes)} style={{
          flex: 1, padding: '7px 14px', fontSize: 12, fontWeight: 700,
          border: 'none', borderRadius: 8, background: '#ef4444', color: '#fff',
          cursor: 'pointer', fontFamily: 'Figtree, sans-serif',
        }}>Block for {fmtBlockMinutes(minutes)}</button>
      </div>
    </div>
  )
}

// Reusable list of apps to classify (shared between "since last check-in" and "earlier today")
function AppClassifySection({
  title, hint, apps, categorized, blockPickerApp, setBlockPickerApp,
  categorizeApp, uncategorizeApp, collapsible = false,
}) {
  const [expanded, setExpanded] = useState(!collapsible)
  const rowStyle = (cat, scoreVal) => {
    const color = cat ? categoryColor(cat) : scoreColor(scoreVal)
    return { dotColor: color, rowBg: cat ? `${color}11` : `${color}08` }
  }
  const pill = { border: 'none', borderRadius: 99, padding: '3px 10px', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'Figtree, sans-serif' }

  // Max time across this section - used to scale bar widths proportionally
  const maxTime = Math.max(1, ...apps.map(a => a.timeSpentSec || 0))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        onClick={() => collapsible && setExpanded(!expanded)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0 2px', cursor: collapsible ? 'pointer' : 'default',
          userSelect: 'none',
        }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: 'rgba(255,255,255,0.5)', fontFamily: 'Figtree, sans-serif' }}>
          {title}
        </span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'Figtree, sans-serif' }}>
          {collapsible ? `${hint} ${expanded ? '▾' : '▸'}` : hint}
        </span>
      </div>
      {expanded && apps.map((app) => {
        const cat = categorized[app.name]
        const { dotColor, rowBg } = rowStyle(cat, app.score)
        const barPct = ((app.timeSpentSec || 0) / maxTime) * 100
        return (
          <div key={app.name}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', borderRadius: 8,
              background: rowBg, transition: 'background 0.2s',
            }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: dotColor, flexShrink: 0 }} />

              {/* Name + time + bar graph stacked vertically */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{
                    fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.9)',
                    fontFamily: 'Figtree, sans-serif',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {app.name}
                  </span>
                  {app.timeSpentSec > 0 && (
                    <span style={{
                      fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.4)',
                      fontFamily: "'SF Mono','Menlo',monospace",
                    }}>
                      {fmtDuration(app.timeSpentSec)}
                    </span>
                  )}
                </div>

                {/* Time-spent bar */}
                {app.timeSpentSec > 0 && (
                  <div style={{
                    height: 4, borderRadius: 2,
                    background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${barPct}%`, height: '100%',
                      background: dotColor, opacity: 0.8,
                      borderRadius: 2, transition: 'width 0.3s ease',
                    }} />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {cat ? (
                  <button style={{ ...pill, color: categoryColor(cat), background: `${categoryColor(cat)}33` }}
                    onClick={() => uncategorizeApp(app.name)}>{cat}</button>
                ) : (
                  <>
                    <button style={{ ...pill, color: '#22c55e', background: 'rgba(34,197,94,0.15)' }}
                      onClick={() => categorizeApp(app.name, 'productive')}>Productive</button>
                    <button style={{ ...pill, color: '#f59e0b', background: 'rgba(245,158,11,0.15)' }}
                      onClick={() => categorizeApp(app.name, 'distracting')}>Distracting</button>
                    <button style={{ ...pill, color: '#ef4444', background: 'rgba(239,68,68,0.15)' }}
                      onClick={() => setBlockPickerApp(blockPickerApp === app.name ? null : app.name)}>Block</button>
                  </>
                )}
              </div>
            </div>
            {blockPickerApp === app.name && (
              <BlockDurationPicker
                appName={app.name}
                onCancel={() => setBlockPickerApp(null)}
                onConfirm={(mins) => categorizeApp(app.name, 'blocked', mins)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// Reusable bullet chip row - each bullet becomes a clickable chip that sends
// that text back as the user's reply.
function BulletChips({ bullets, onPick, disabled }) {
  if (!bullets || bullets.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 34, marginTop: 6 }}>
      {bullets.map((b, i) => (
        <button key={i}
          onClick={() => !disabled && onPick(b)}
          disabled={disabled}
          style={{
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: 99,
            padding: '5px 11px', fontSize: 11, fontWeight: 500,
            color: 'rgba(255,255,255,0.9)', background: 'rgba(255,255,255,0.06)',
            cursor: disabled ? 'default' : 'pointer', fontFamily: 'Figtree, sans-serif',
            textAlign: 'left', lineHeight: 1.3,
            opacity: disabled ? 0.5 : 1,
          }}>
          {b}
        </button>
      ))}
    </div>
  )
}

function parseData() {
  try {
    const hash = window.location.hash || ''
    const qIndex = hash.indexOf('?')
    if (qIndex >= 0) {
      const params = new URLSearchParams(hash.slice(qIndex + 1))
      const raw = params.get('data')
      if (raw) return JSON.parse(decodeURIComponent(raw))
    }
  } catch { /* ignore */ }
  return null
}

function parseAppLine(line) {
  let clean = line.trim()
  if (clean.startsWith('- ')) clean = clean.slice(2)
  const scoreMatch = clean.match(/^(.+?)\s*\(score:\s*(\d+)\/10\)/)
  if (scoreMatch) return { name: scoreMatch[1].trim(), score: parseInt(scoreMatch[2]) }
  const parenMatch = clean.match(/^(.+?)\s*\(/)
  if (parenMatch) return { name: parenMatch[1].trim(), score: 5 }
  return { name: clean, score: 5 }
}

function scoreColor(score) {
  if (score <= 2) return '#22c55e'
  if (score <= 4) return '#eab308'
  if (score <= 6) return '#f59e0b'
  return '#ef4444'
}

function categoryColor(cat) {
  if (cat === 'productive') return '#22c55e'
  if (cat === 'distracting') return '#f59e0b'
  if (cat === 'blocked') return '#ef4444'
  return '#666'
}

function actionChipStyle(action) {
  if (action.type === 'block') return { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' }
  if (action.type === 'snooze') return { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' }
  if (action.type === 'mark_productive') return { bg: 'rgba(34,197,94,0.15)', color: '#22c55e', border: 'rgba(34,197,94,0.3)' }
  return { bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', border: 'rgba(255,255,255,0.12)' }
}

// --- Score Graph SVG ---

function ScoreGraph({ pollLog, threshold }) {
  if (!pollLog || pollLog.length < 2) {
    return (
      <div style={{
        height: 60, borderRadius: 10,
        background: 'rgba(255,255,255,0.04)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'Figtree, sans-serif',
      }}>
        Not enough data for graph
      </div>
    )
  }

  const W = 500
  const H = 60
  const PAD_X = 10
  const PAD_Y = 6

  const maxScore = Math.max(100, ...pollLog.map(p => p.totalScore))
  const minTs = pollLog[0].timestamp
  const maxTs = pollLog[pollLog.length - 1].timestamp
  const tsRange = maxTs - minTs || 1

  const toX = (ts) => PAD_X + ((ts - minTs) / tsRange) * (W - PAD_X * 2)
  const toY = (s) => PAD_Y + (1 - s / maxScore) * (H - PAD_Y * 2)

  const threshY = toY(threshold)

  // Build the score polyline
  const points = pollLog.map(p => `${toX(p.timestamp)},${toY(p.totalScore)}`)
  const polyline = points.join(' ')

  // Build the filled area under the line
  const firstX = toX(pollLog[0].timestamp)
  const lastX = toX(pollLog[pollLog.length - 1].timestamp)
  const areaPoints = `${firstX},${H - PAD_Y} ${polyline} ${lastX},${H - PAD_Y}`

  // Red zone above threshold (shaded)
  const redZone = `M${PAD_X},${PAD_Y} L${W - PAD_X},${PAD_Y} L${W - PAD_X},${threshY} L${PAD_X},${threshY} Z`

  // Find crossing points
  const crossings = []
  for (let i = 1; i < pollLog.length; i++) {
    const prev = pollLog[i - 1]
    const curr = pollLog[i]
    if ((prev.totalScore < threshold && curr.totalScore >= threshold) ||
        (prev.totalScore >= threshold && curr.totalScore < threshold)) {
      crossings.push({ x: toX(curr.timestamp), y: toY(curr.totalScore) })
    }
  }

  // Current score dot
  const last = pollLog[pollLog.length - 1]
  const currentDot = { x: toX(last.timestamp), y: toY(last.totalScore) }

  // Time labels
  const nowTs = maxTs
  const elapsed = (nowTs - minTs) / 1000 / 60 // minutes

  return (
    <div style={{ borderRadius: 10, background: 'rgba(255,255,255,0.04)', overflow: 'hidden', position: 'relative' }}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <defs>
          <linearGradient id="scoreLineGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
          <linearGradient id="scoreFillGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="rgba(34,197,94,0.08)" />
            <stop offset="100%" stopColor="rgba(239,68,68,0.08)" />
          </linearGradient>
        </defs>

        {/* Red zone above threshold */}
        <path d={redZone} fill="rgba(239,68,68,0.06)" />

        {/* Threshold dashed line */}
        <line x1={PAD_X} y1={threshY} x2={W - PAD_X} y2={threshY}
          stroke="rgba(239,68,68,0.4)" strokeWidth="1" strokeDasharray="4,3" />

        {/* Threshold label */}
        <text x={W - PAD_X - 2} y={threshY - 4} textAnchor="end"
          fill="rgba(239,68,68,0.5)" fontSize="7" fontFamily="Figtree, sans-serif" fontWeight="600">
          THRESHOLD
        </text>

        {/* Filled area under score line */}
        <polygon points={areaPoints} fill="url(#scoreFillGrad)" />

        {/* Score line */}
        <polyline points={polyline} fill="none" stroke="url(#scoreLineGrad)" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" />

        {/* Crossing dots (red) */}
        {crossings.map((c, i) => (
          <circle key={`cross-${i}`} cx={c.x} cy={c.y} r="3" fill="#ef4444" />
        ))}

        {/* Current score dot */}
        <circle cx={currentDot.x} cy={currentDot.y} r="4" fill="white" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
      </svg>

      {/* X-axis time labels */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '2px 12px 4px',
        fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'Figtree, sans-serif',
      }}>
        <span>{elapsed >= 3 ? `${Math.round(elapsed)} min ago` : elapsed >= 1 ? `${Math.round(elapsed)} min ago` : '< 1 min ago'}</span>
        <span>{elapsed >= 2 ? `${Math.round(elapsed / 2)} min ago` : ''}</span>
        <span>now</span>
      </div>
    </div>
  )
}

// --- Main Component ---

export default function CheckinOverlay({ data: propData, onDismiss: propDismiss }) {
  const [data] = useState(() => propData || parseData() || {})
  const [categorized, setCategorized] = useState({})
  const [blockPickerApp, setBlockPickerApp] = useState(null)
  const [expandedAction, setExpandedAction] = useState(null)
  const [actionConfirmation, setActionConfirmation] = useState('')
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef(null)

  // Force body/html transparent + dark mode variables for chat components
  useEffect(() => {
    const prev = {
      body: document.body.style.background,
      html: document.documentElement.style.background,
    }
    document.body.style.background = 'transparent'
    document.documentElement.style.background = 'transparent'

    const style = document.createElement('style')
    style.id = 'overlay-dark-vars'
    style.textContent = `
      :root {
        --background: transparent;
        --foreground: #ffffff;
        --muted: rgba(255,255,255,0.08);
        --muted-foreground: rgba(255,255,255,0.6);
        --border: rgba(255,255,255,0.12);
        --input-background: rgba(255,255,255,0.08);
        --user-message-bg: rgba(59,130,246,0.3);
        --user-message-border: rgba(59,130,246,0.4);
        --user-message-text: #ffffff;
        --bg-primary: transparent;
        --bg-secondary: rgba(255,255,255,0.05);
        --bg-tertiary: rgba(255,255,255,0.06);
        --text-primary: #ffffff;
        --text-secondary: rgba(255,255,255,0.7);
        --text-tertiary: rgba(255,255,255,0.4);
      }
    `
    document.head.appendChild(style)

    return () => {
      document.body.style.background = prev.body
      document.documentElement.style.background = prev.html
      const el = document.getElementById('overlay-dark-vars')
      if (el) el.remove()
    }
  }, [])

  // Prefer structured arrays (with time-spent data) when available,
  // fall back to parsing the summary strings for backwards compat.
  const rawApps = Array.isArray(data.appsSince) && data.appsSince.length > 0
    ? data.appsSince.map(e => ({ name: e.word, score: e.score, timeSpentSec: e.timeSpentSec || 0 }))
    : (data.appSummary || '').split('\n').filter(l => l.trim()).map(parseAppLine)
  const rawTodayApps = Array.isArray(data.appsToday) && data.appsToday.length > 0
    ? data.appsToday.map(e => ({ name: e.word, score: e.score, timeSpentSec: e.timeSpentSec || 0 }))
    : (data.todaySummary || '').split('\n').filter(l => l.trim()).map(parseAppLine)

  // Drop apps that are already classified (productive/distracting/blocked in the user's word list) -
  // the "CLASSIFY THESE APPS" list is meant for *un*classified things only.
  const existingClassifications = data.existingClassifications || {}
  const isClassified = (name) => !!existingClassifications[name?.toLowerCase()]
  let apps = rawApps.filter(a => !isClassified(a.name))
  const todayAppsFiltered = rawTodayApps.filter(a => !isClassified(a.name))

  // If there's nothing since the last check-in (e.g. right after a reset or
  // triggered via debug shortcut), fall back to showing today's apps in the
  // main section so the user always has something to classify.
  let sinceLabel = 'SINCE LAST CHECK-IN'
  if (apps.length === 0 && todayAppsFiltered.length > 0) {
    apps = todayAppsFiltered
    sinceLabel = 'TODAY'
  }

  // "Earlier today" = apps seen today but NOT in the main list (avoid duplicates)
  const sinceNames = new Set(apps.map(a => a.name.toLowerCase()))
  const earlierApps = todayAppsFiltered.filter(a => !sinceNames.has(a.name.toLowerCase()))
  const pollLog = data.pollLog || []
  const threshold = data.threshold || 50
  const nsfwStatus = data.nsfwStatus || 'clean'
  const actions = data.actions || []
  const authToken = data.authToken || null

  // [diagnostic] one-shot log: shows what the overlay received for the widget.
  useEffect(() => {
    console.log('[CheckinOverlay] data.overlordResponse:', JSON.stringify(data.overlordResponse), 'actions:', (data.actions || []).length)
  }, [])

  // Count chat exchanges (user messages)
  const userMessageCount = chatMessages.filter(m => m.role === 'user').length

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  function sendStatus(payload) {
    if (window.nativeOverlay?.sendStatus) {
      window.nativeOverlay.sendStatus(payload)
    }
  }

  function dismiss() {
    sendStatus({ action: 'dismissed' })
    if (window.nativeOverlay?.dismiss) {
      window.nativeOverlay.dismiss()
    } else if (window.electronAPI?.dismissOverlay) {
      window.electronAPI.dismissOverlay('checkin')
    }
    if (propDismiss) propDismiss()
  }

  function categorizeApp(name, category, durationMinutes) {
    setCategorized(prev => ({ ...prev, [name]: category }))
    setBlockPickerApp(null)
    if (category === 'blocked') {
      sendStatus({
        action: 'add-word',
        word: name,
        list: 'blocked',
        score: 10,
        durationMinutes: durationMinutes || null,
      })
    } else if (category === 'productive') {
      sendStatus({ action: 'add-word', word: name, list: 'productive', score: 0 })
    } else if (category === 'distracting') {
      sendStatus({ action: 'add-word', word: name, list: 'distracting', score: 7 })
    }
  }

  function uncategorizeApp(name) {
    setCategorized(prev => {
      const next = { ...prev }
      delete next[name]
      return next
    })
  }

  function markAllProductive() {
    const updates = {}
    apps.forEach(app => {
      if (!categorized[app.name]) {
        updates[app.name] = 'productive'
        sendStatus({ action: 'add-word', word: app.name, list: 'productive', score: 0 })
      }
    })
    setCategorized(prev => ({ ...prev, ...updates }))
    setActionConfirmation('All apps marked as productive')
    setTimeout(dismiss, 1500)
  }

  function executeAction(action, extra) {
    if (action.type === 'dismiss') { dismiss(); return }
    if (action.type === 'block' && !extra) {
      setExpandedAction(expandedAction === action.label ? null : action.label)
      return
    }
    if (action.type === 'snooze' && !extra) {
      setExpandedAction(expandedAction === action.label ? null : action.label)
      return
    }
    setExpandedAction(null)

    if (action.type === 'block' && action.app) {
      setActionConfirmation(`${action.app} blocked (${extra || 'always'})`)
      categorizeApp(action.app, 'blocked')
    } else if (action.type === 'mark_productive' && action.app) {
      setActionConfirmation(`${action.app} marked as productive`)
      categorizeApp(action.app, 'productive')
    } else if (action.type === 'mark_distracting' && action.app) {
      setActionConfirmation(`${action.app} marked as distracting`)
      categorizeApp(action.app, 'distracting')
    } else if (action.type === 'snooze') {
      let minutes = action.minutes || 10
      if (extra) {
        const parsed = parseInt(extra)
        if (!isNaN(parsed)) minutes = parsed
        if (extra.includes('hr')) minutes = parsed * 60
      }
      sendStatus({ action: 'snooze', minutes })
      setActionConfirmation(`Snoozed for ${extra || action.minutes + ' min'}`)
      setTimeout(dismiss, 1000)
    }
  }

  async function sendChat(overrideText) {
    const raw = typeof overrideText === 'string' ? overrideText : chatInput
    if (!raw.trim() || chatLoading) return
    const userMsg = raw.trim()
    if (typeof overrideText !== 'string') setChatInput('')
    const newMessages = [...chatMessages, { role: 'user', content: userMsg }]
    setChatMessages(newMessages)
    setChatLoading(true)

    try {
      const recentApps = apps.map(a => a.name).join(', ')
      const currentTime = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      const macInstructions = window.__overlordPersonality?.macInstructions || ''

      // Build message history for context
      const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }))

      const headers = { 'Content-Type': 'application/json' }
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`

      const serverBase = data.serverBase || 'https://overlordserver.up.railway.app'
      const resp = await fetch(`${serverBase}/reassessment-chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: apiMessages,
          usage: data.appSummary || '',
          today_usage: data.todaySummary || '',
          mac_instructions: macInstructions,
          current_app: recentApps,
          current_time: currentTime,
          session_id: data.sessionId || '',
        }),
      })

      if (!resp.ok) throw new Error(`Server ${resp.status}`)
      const result = await resp.json()

      const assistantMsg = {
        role: 'assistant',
        content: result.response || 'I understand.',
        actions: result.actions || [],
        tool_actions: result.tool_actions || [],
      }
      setChatMessages(prev => [...prev, assistantMsg])
    } catch (err) {
      console.error('[CheckinOverlay] Chat error:', err)
      const reason = !authToken
        ? "I'm not logged in right now - please reopen the app to re-auth."
        : `Connection failed: ${err.message}. Try again in a moment.`
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: reason,
        actions: [],
        tool_actions: [],
      }])
    } finally {
      setChatLoading(false)
    }
  }

  // --- Render ---

  return (
    <div style={styles.backdrop} onClick={(e) => { if (e.target === e.currentTarget) dismiss() }}>
      <div style={styles.card}>

        {/* 1. Header */}
        <div style={styles.headerRow}>
          <div style={styles.badge}>
            <AlertTriangle size={13} />
            <span>CHECK-IN</span>
          </div>
          <button style={{ ...styles.closeBtn, position: 'absolute', right: 0 }} onClick={dismiss}>
            <X size={20} />
          </button>
        </div>

        <div style={{ fontSize: 24, fontWeight: 700, color: 'white', fontFamily: 'Figtree, sans-serif', textAlign: 'center' }}>
          Help me learn what's productive for you
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, fontFamily: 'Figtree, sans-serif', textAlign: 'center', maxWidth: 500 }}>
          This isn't a block - just a quick check-in. Classify the apps below so I can get smarter. The more you teach me, the fewer check-ins you'll see.
        </div>

        {/* Confirmation banner */}
        {actionConfirmation && (
          <div style={styles.confirmBanner}>
            <CheckCircle size={14} />
            <span>{actionConfirmation}</span>
          </div>
        )}

        {/* 2. NSFW Status Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 99,
          background: 'rgba(255,255,255,0.08)',
          alignSelf: 'center',
          width: 'fit-content',
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: 3,
            background: nsfwStatus === 'clean' ? '#22c55e' : '#ef4444',
          }} />
          <span style={{
            fontSize: 11, fontWeight: 500, fontFamily: 'Figtree, sans-serif',
            color: nsfwStatus === 'clean' ? '#22c55e' : '#ef4444',
          }}>
            NSFW: {nsfwStatus === 'clean' ? 'Clean' : 'Flagged'}
          </span>
        </div>

        {/* 3. Score Graph */}
        <SharedScoreGraph pollLog={pollLog} threshold={threshold} theme="dark" />

        {/* 4. CLASSIFY THESE APPS - since last check-in (or today if empty) */}
        {apps.length > 0 && (
          <AppClassifySection
            title={sinceLabel}
            hint="Tap to teach me"
            apps={apps}
            categorized={categorized}
            blockPickerApp={blockPickerApp}
            setBlockPickerApp={setBlockPickerApp}
            categorizeApp={categorizeApp}
            uncategorizeApp={uncategorizeApp}
          />
        )}

        {/* 5. EARLIER TODAY (expandable) */}
        {earlierApps.length > 0 && (
          <AppClassifySection
            title="EARLIER TODAY"
            hint={`${earlierApps.length} more`}
            apps={earlierApps}
            categorized={categorized}
            blockPickerApp={blockPickerApp}
            setBlockPickerApp={setBlockPickerApp}
            categorizeApp={categorizeApp}
            uncategorizeApp={uncategorizeApp}
            collapsible
          />
        )}


        {/* 6. Quick Chat - reusable widget */}
        <OverlordChatWidget
          initialMessage={data.overlordResponse}
          initialActions={actions}
          serverBase={data.serverBase || 'https://overlordserver.up.railway.app'}
          authToken={authToken}
          context={{
            usage: data.appSummary || '',
            today_usage: data.todaySummary || '',
            mac_instructions: window.__overlordPersonality?.macInstructions || '',
            current_app: apps.map(a => a.name).join(', '),
            current_time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
          }}
          onSnooze={(mins) => {
            sendStatus({ action: 'snooze', minutes: mins })
            setActionConfirmation(`Snoozed for ${mins} min`)
            setTimeout(dismiss, 1000)
          }}
          onDismiss={dismiss}
          onContinueFull={dismiss}
        />
      </div>
    </div>
  )
}

const styles = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'transparent',
    fontFamily: 'Figtree, sans-serif',
    overflowY: 'auto',
  },
  card: {
    maxWidth: 550, width: '100%',
    margin: '0 auto',
    padding: '40px 24px',
    display: 'flex', flexDirection: 'column', gap: 16,
    alignItems: 'stretch',
  },
  headerRow: {
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    width: '100%', position: 'relative',
  },
  badge: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '5px 12px', borderRadius: 99,
    background: '#f59e0b', color: 'white',
    fontSize: 11, fontWeight: 700, letterSpacing: 1.2,
    fontFamily: 'Figtree, sans-serif',
  },
  closeBtn: {
    background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
    padding: 4, borderRadius: 6,
  },
  confirmBanner: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 14px', borderRadius: 8,
    background: 'rgba(34,197,94,0.15)', color: '#22c55e',
    fontSize: 12, fontWeight: 500, fontFamily: 'Figtree, sans-serif',
  },
  pill: {
    border: 'none', borderRadius: 99, padding: '4px 9px',
    fontSize: 10, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'Figtree, sans-serif',
  },
  markAllBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '10px 20px', width: '100%',
    border: '1px solid rgba(34,197,94,0.25)', borderRadius: 10,
    background: 'rgba(34,197,94,0.1)', color: '#22c55e',
    fontSize: 12, fontWeight: 500, cursor: 'pointer',
    fontFamily: 'Figtree, sans-serif',
  },
}
