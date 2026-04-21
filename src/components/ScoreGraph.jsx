/**
 * ScoreGraph - tiny SVG distraction-score line chart with threshold zone.
 *
 * Props:
 *   pollLog     - array of { timestamp, totalScore, reason?, delta?, app?, list?, cause? }
 *   threshold   - number (default 50) - horizontal dashed line + red zone above
 *   height      - px (default 60)
 *   showAxis    - bool (default true) - show "X min ago / now" labels under the graph
 *   theme       - 'dark' (default, overlay) or 'light' (blocking panel)
 *
 * Hover: each pollLog point has an invisible hover target. When hovered, a
 * floating tooltip shows what caused that score change (app + list for
 * activity entries, or a friendly label for reset/snooze/spike/decay).
 */

import React, { useRef, useState, useId } from 'react'

const THEMES = {
  dark: {
    bg: 'rgba(255,255,255,0.04)',
    emptyText: 'rgba(255,255,255,0.3)',
    axisText: 'rgba(255,255,255,0.3)',
    dotStroke: 'rgba(255,255,255,0.3)',
    tooltipBg: 'rgba(20,20,20,0.96)',
    tooltipBorder: 'rgba(255,255,255,0.12)',
    tooltipText: '#fff',
    tooltipMuted: 'rgba(255,255,255,0.55)',
  },
  light: {
    bg: 'var(--bg-tertiary, rgba(0,0,0,0.04))',
    emptyText: 'var(--text-tertiary, rgba(0,0,0,0.4))',
    axisText: 'var(--text-tertiary, rgba(0,0,0,0.4))',
    dotStroke: 'var(--border, rgba(0,0,0,0.12))',
    tooltipBg: 'rgba(255,255,255,0.98)',
    tooltipBorder: 'rgba(0,0,0,0.1)',
    tooltipText: '#1f2937',
    tooltipMuted: 'rgba(31,41,55,0.6)',
  },
}

const LIST_COLORS = {
  blocked: '#ef4444',
  distracting: '#f59e0b',
  productive: '#22c55e',
  unknown: '#6b7280',
}

const LIST_LABELS = {
  blocked: 'Blocked',
  distracting: 'Distracting',
  productive: 'Productive',
  unknown: 'Unknown',
}

/** Render a friendly description + accent color for a pollLog entry. */
function describeEntry(entry) {
  const reason = entry.reason || 'activity'
  const delta = entry.delta

  if (reason === 'activity') {
    const list = entry.list || 'unknown'
    return {
      title: entry.app || 'Unknown app',
      subtitle: LIST_LABELS[list] || list,
      accent: LIST_COLORS[list] || LIST_COLORS.unknown,
      delta,
    }
  }
  if (reason === 'passive_decay') {
    return {
      title: 'Idle decay',
      subtitle: 'Score ticks down when the app is idle',
      accent: '#22c55e',
      delta,
    }
  }
  if (reason === 'reset') {
    const cause = entry.cause || 'manual'
    const map = {
      checkin_triggered: { title: 'Check-in triggered', subtitle: 'Score reset after threshold was hit' },
      admin_manual: { title: 'Admin reset', subtitle: 'Score cleared from the admin panel' },
      manual: { title: 'Manual reset', subtitle: 'Score cleared' },
    }
    const d = map[cause] || map.manual
    return { ...d, accent: '#3b82f6', delta }
  }
  if (reason === 'snooze') {
    const cause = entry.cause || 'user'
    const mins = entry.minutes
    return {
      title: cause === 'user_snooze' ? 'Snoozed' : 'Snoozed',
      subtitle: mins ? `Check-ins paused for ${mins} min` : 'Check-ins paused',
      accent: '#8b5cf6',
      delta,
    }
  }
  if (reason === 'spike') {
    const cause = entry.cause || 'spike'
    const map = {
      nsfw: { title: 'NSFW detected', subtitle: 'Score spiked to force a check-in' },
      spike: { title: 'Score spike', subtitle: 'Score bumped manually' },
    }
    const d = map[cause] || map.spike
    return { ...d, accent: '#ef4444', delta }
  }
  return { title: reason, subtitle: '', accent: '#6b7280', delta }
}

function formatDelta(d) {
  if (typeof d !== 'number' || d === 0) return null
  const sign = d > 0 ? '+' : ''
  return `${sign}${d.toFixed(1)}`
}

function formatRelativeTime(tsNow, ts) {
  const secs = Math.round((tsNow - ts) / 1000)
  if (secs < 5) return 'just now'
  if (secs < 60) return `${secs}s ago`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  return `${hrs}h ago`
}

export default function ScoreGraph({
  pollLog,
  threshold = 50,
  height = 60,
  showAxis = true,
  theme = 'dark',
}) {
  const t = THEMES[theme] || THEMES.dark
  const containerRef = useRef(null)
  const [hovered, setHovered] = useState(null) // { entry, x, y } in container-local px
  // Must be called unconditionally on every render (React hooks rule), so it
  // has to live above the early-return for the "not enough data" state.
  const gid = useId()

  if (!pollLog || pollLog.length < 2) {
    return (
      <div style={{
        height, borderRadius: 10,
        background: t.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, color: t.emptyText, fontFamily: 'Figtree, sans-serif',
      }}>
        Not enough data for graph
      </div>
    )
  }

  const W = 500
  const H = height
  const PAD_X = 10
  const PAD_Y = 6

  const maxScore = Math.max(100, ...pollLog.map(p => p.totalScore))
  const minTs = pollLog[0].timestamp
  const maxTs = pollLog[pollLog.length - 1].timestamp
  const tsRange = maxTs - minTs || 1

  const toX = (ts) => PAD_X + ((ts - minTs) / tsRange) * (W - PAD_X * 2)
  const toY = (s) => PAD_Y + (1 - s / maxScore) * (H - PAD_Y * 2)

  const threshY = toY(threshold)

  const points = pollLog.map(p => `${toX(p.timestamp)},${toY(p.totalScore)}`)
  const polyline = points.join(' ')

  const firstX = toX(pollLog[0].timestamp)
  const lastX = toX(pollLog[pollLog.length - 1].timestamp)
  const areaPoints = `${firstX},${H - PAD_Y} ${polyline} ${lastX},${H - PAD_Y}`

  const redZone = `M${PAD_X},${PAD_Y} L${W - PAD_X},${PAD_Y} L${W - PAD_X},${threshY} L${PAD_X},${threshY} Z`

  // Threshold crossings
  const crossings = []
  for (let i = 1; i < pollLog.length; i++) {
    const prev = pollLog[i - 1]
    const curr = pollLog[i]
    if ((prev.totalScore < threshold && curr.totalScore >= threshold) ||
        (prev.totalScore >= threshold && curr.totalScore < threshold)) {
      crossings.push({ x: toX(curr.timestamp), y: toY(curr.totalScore) })
    }
  }

  const last = pollLog[pollLog.length - 1]
  const currentDot = { x: toX(last.timestamp), y: toY(last.totalScore) }

  const elapsed = (maxTs - minTs) / 1000 / 60 // minutes

  // Unique ids per instance so multiple graphs on a page don't collide.
  // `gid` is produced by useId() above.
  const lineGradId = `scoreLineGrad-${gid}`
  const fillGradId = `scoreFillGrad-${gid}`

  // Mouse tracking: find the nearest pollLog point by x-coordinate in the
  // container's local pixel space, then map back to SVG coordinates to
  // position the tooltip.
  const handleMouseMove = (e) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const localX = e.clientX - rect.left // 0..rect.width
    // Convert localX to SVG x coord: SVG is stretched to container width.
    const svgX = (localX / rect.width) * W
    // Find nearest pollLog entry by x.
    let nearest = null
    let bestDist = Infinity
    for (let i = 0; i < pollLog.length; i++) {
      const px = toX(pollLog[i].timestamp)
      const dist = Math.abs(px - svgX)
      if (dist < bestDist) {
        bestDist = dist
        nearest = { entry: pollLog[i], svgX: px, svgY: toY(pollLog[i].totalScore), index: i }
      }
    }
    if (!nearest) return
    // Convert SVG x/y back to container-local px for the tooltip
    const scaleX = rect.width / W
    const scaleY = rect.height / H
    setHovered({
      entry: nearest.entry,
      x: nearest.svgX * scaleX,
      y: nearest.svgY * scaleY,
    })
  }

  const handleMouseLeave = () => setHovered(null)

  const nowTs = Date.now()
  const tooltipInfo = hovered ? describeEntry(hovered.entry) : null

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ borderRadius: 10, background: t.bg, overflow: 'visible', position: 'relative' }}
    >
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <defs>
          <linearGradient id={lineGradId} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
          <linearGradient id={fillGradId} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="rgba(34,197,94,0.08)" />
            <stop offset="100%" stopColor="rgba(239,68,68,0.08)" />
          </linearGradient>
        </defs>

        <path d={redZone} fill="rgba(239,68,68,0.06)" />

        <line x1={PAD_X} y1={threshY} x2={W - PAD_X} y2={threshY}
          stroke="rgba(239,68,68,0.4)" strokeWidth="1" strokeDasharray="4,3" />

        <text x={W - PAD_X - 2} y={threshY - 4} textAnchor="end"
          fill="rgba(239,68,68,0.5)" fontSize="7" fontFamily="Figtree, sans-serif" fontWeight="600">
          THRESHOLD
        </text>

        <polygon points={areaPoints} fill={`url(#${fillGradId})`} />

        <polyline points={polyline} fill="none" stroke={`url(#${lineGradId})`} strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" />

        {crossings.map((c, i) => (
          <circle key={`cross-${i}`} cx={c.x} cy={c.y} r="3" fill="#ef4444" />
        ))}

        <circle cx={currentDot.x} cy={currentDot.y} r="4" fill="white" stroke={t.dotStroke} strokeWidth="1.5" />

        {/* Hover highlight - vertical line + accent dot on the nearest point */}
        {hovered && (
          <>
            <line
              x1={(hovered.x / (containerRef.current?.getBoundingClientRect().width || W)) * W}
              y1={PAD_Y}
              x2={(hovered.x / (containerRef.current?.getBoundingClientRect().width || W)) * W}
              y2={H - PAD_Y}
              stroke={tooltipInfo?.accent || '#6b7280'}
              strokeWidth="0.8"
              strokeDasharray="2,2"
              opacity="0.5"
            />
            <circle
              cx={(hovered.x / (containerRef.current?.getBoundingClientRect().width || W)) * W}
              cy={(hovered.y / (containerRef.current?.getBoundingClientRect().height || H)) * H}
              r="3.5"
              fill={tooltipInfo?.accent || '#6b7280'}
              stroke="white"
              strokeWidth="1"
            />
          </>
        )}
      </svg>

      {/* Tooltip - positioned above the hovered point. */}
      {hovered && tooltipInfo && (() => {
        const rect = containerRef.current?.getBoundingClientRect()
        const w = rect?.width || 500
        // Clamp so the tooltip stays inside the container horizontally.
        const TT_W = 180
        const leftRaw = hovered.x - TT_W / 2
        const left = Math.max(4, Math.min(w - TT_W - 4, leftRaw))
        const top = Math.max(4, hovered.y - 10) // position above the point
        return (
          <div style={{
            position: 'absolute',
            left, top,
            transform: 'translateY(-100%)',
            width: TT_W,
            padding: '8px 10px',
            background: t.tooltipBg,
            border: `1px solid ${t.tooltipBorder}`,
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            pointerEvents: 'none',
            fontFamily: 'Figtree, sans-serif',
            zIndex: 100,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2,
            }}>
              <span style={{
                display: 'inline-block', width: 8, height: 8, borderRadius: 4,
                background: tooltipInfo.accent, flexShrink: 0,
              }} />
              <span style={{
                fontSize: 12, fontWeight: 600, color: t.tooltipText,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
              }}>
                {tooltipInfo.title}
              </span>
              {formatDelta(tooltipInfo.delta) && (
                <span style={{
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                  color: tooltipInfo.delta > 0 ? '#ef4444' : '#22c55e',
                }}>
                  {formatDelta(tooltipInfo.delta)}
                </span>
              )}
            </div>
            {tooltipInfo.subtitle && (
              <div style={{ fontSize: 10, color: t.tooltipMuted, lineHeight: 1.35, marginBottom: 2 }}>
                {tooltipInfo.subtitle}
              </div>
            )}
            <div style={{
              fontSize: 9, color: t.tooltipMuted, display: 'flex', justifyContent: 'space-between',
            }}>
              <span>Score: {hovered.entry.totalScore.toFixed(1)}</span>
              <span>{formatRelativeTime(nowTs, hovered.entry.timestamp)}</span>
            </div>
          </div>
        )
      })()}

      {showAxis && (
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '2px 12px 4px',
          fontSize: 9, color: t.axisText, fontFamily: 'Figtree, sans-serif',
        }}>
          <span>{elapsed >= 1 ? `${Math.round(elapsed)} min ago` : '< 1 min ago'}</span>
          <span>{elapsed >= 2 ? `${Math.round(elapsed / 2)} min ago` : ''}</span>
          <span>now</span>
        </div>
      )}
    </div>
  )
}
