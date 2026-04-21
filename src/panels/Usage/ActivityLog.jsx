import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { ArrowUp, ArrowDown } from 'lucide-react'
import {
  getTodaySamples,
  formatDuration,
} from '../../services/usageDataService'

const POLL_INTERVAL_MS = 5000

// Sort keys map to sample fields.
const SORT_KEYS = {
  timestamp: 'timestamp',
  duration: 'durationSeconds',
  app: 'appName',
  title: 'windowTitle',
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000

function formatSampleTime(ts) {
  if (!ts && ts !== 0) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const now = Date.now()
  const short = d.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
  if (now - ts > ONE_DAY_MS) {
    // Safe fallback for anything older than 24h.
    return `${d.toLocaleDateString()} ${short}`
  }
  return short
}

function formatCount(n) {
  try {
    return n.toLocaleString()
  } catch {
    return String(n)
  }
}

export default function ActivityLog() {
  const [samples, setSamples] = useState([])
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('timestamp')
  const [sortDir, setSortDir] = useState('desc') // 'asc' | 'desc'

  useEffect(() => {
    let cancelled = false

    const tick = async () => {
      try {
        const next = await getTodaySamples()
        if (cancelled) return
        setSamples(Array.isArray(next) ? next : [])
      } catch (err) {
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.error('[ActivityLog] poll failed:', err)
        }
      }
    }

    tick()
    const id = setInterval(tick, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const filteredSorted = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? samples.filter((s) => {
          const app = (s?.appName || '').toLowerCase()
          const title = (s?.windowTitle || '').toLowerCase()
          return app.includes(q) || title.includes(q)
        })
      : samples.slice()

    const field = SORT_KEYS[sortKey] || 'timestamp'
    const dirMul = sortDir === 'asc' ? 1 : -1

    filtered.sort((a, b) => {
      const av = a?.[field]
      const bv = b?.[field]
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * dirMul
      }
      const as = (av ?? '').toString().toLowerCase()
      const bs = (bv ?? '').toString().toLowerCase()
      if (as < bs) return -1 * dirMul
      if (as > bs) return 1 * dirMul
      return 0
    })

    return filtered
  }, [samples, search, sortKey, sortDir])

  const toggleSort = useCallback(
    (key) => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortKey(key)
        // Sensible default direction per column:
        // timestamp/duration default desc (biggest first), app/title asc.
        setSortDir(key === 'timestamp' || key === 'duration' ? 'desc' : 'asc')
      }
    },
    [sortKey]
  )

  const cardStyle = {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 16,
  }

  const headerRowStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  }

  const titleStyle = {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text-primary)',
    letterSpacing: 0.2,
  }

  const badgeStyle = {
    fontSize: 11,
    color: 'var(--text-secondary, #888)',
    background: 'var(--bg-tertiary, rgba(128,128,128,0.12))',
    padding: '2px 8px',
    borderRadius: 999,
    whiteSpace: 'nowrap',
  }

  const searchStyle = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontSize: 12,
    outline: 'none',
    marginBottom: 12,
  }

  // Grid template: Date/Time 160, Duration 100, App 180, Title flex.
  const GRID_TEMPLATE = '160px 100px 180px 1fr'

  const tableWrapStyle = {
    border: '1px solid var(--border)',
    borderRadius: 8,
    overflow: 'hidden',
    background: 'var(--bg-primary)',
  }

  const tableHeaderStyle = {
    display: 'grid',
    gridTemplateColumns: GRID_TEMPLATE,
    gap: 0,
    padding: '8px 12px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    position: 'sticky',
    top: 0,
    zIndex: 1,
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-secondary, #888)',
    textTransform: 'none',
  }

  const headerCellBtnStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    background: 'transparent',
    border: 'none',
    padding: 0,
    margin: 0,
    font: 'inherit',
    color: 'inherit',
    cursor: 'pointer',
    textAlign: 'left',
    userSelect: 'none',
  }

  const bodyScrollStyle = {
    maxHeight: 500,
    overflowY: 'auto',
  }

  const emptyStyle = {
    color: 'var(--text-tertiary, #999)',
    fontSize: 13,
    padding: '24px 12px',
    textAlign: 'center',
  }

  const renderSortIcon = (key) => {
    if (sortKey !== key) return null
    return sortDir === 'asc' ? (
      <ArrowUp size={11} strokeWidth={2.5} />
    ) : (
      <ArrowDown size={11} strokeWidth={2.5} />
    )
  }

  const HeaderCell = ({ label, sortId }) => (
    <button
      type="button"
      style={headerCellBtnStyle}
      onClick={() => toggleSort(sortId)}
      title={`Sort by ${label}`}
    >
      <span>{label}</span>
      {renderSortIcon(sortId)}
    </button>
  )

  return (
    <div style={cardStyle}>
      <div style={headerRowStyle}>
        <span style={titleStyle}>Activity Log</span>
        <span style={badgeStyle}>
          {formatCount(filteredSorted.length)}{' '}
          {filteredSorted.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search apps or window titles..."
        style={searchStyle}
      />

      <div style={tableWrapStyle}>
        <div style={bodyScrollStyle}>
          <div style={tableHeaderStyle}>
            <HeaderCell label="Date & Time" sortId="timestamp" />
            <HeaderCell label="Duration" sortId="duration" />
            <HeaderCell label="App" sortId="app" />
            <HeaderCell label="Window Title" sortId="title" />
          </div>

          {filteredSorted.length === 0 ? (
            <div style={emptyStyle}>No activity logged today.</div>
          ) : (
            filteredSorted.map((s, idx) => {
              const zebra = idx % 2 === 1
              return (
                <ActivityRow
                  key={`${s.timestamp}-${idx}`}
                  sample={s}
                  zebra={zebra}
                  gridTemplate={GRID_TEMPLATE}
                />
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

function ActivityRow({ sample, zebra, gridTemplate }) {
  const [hover, setHover] = useState(false)

  const baseBg = zebra ? 'rgba(0,0,0,0.02)' : 'transparent'
  const bg = hover ? 'var(--bg-primary)' : baseBg

  const rowStyle = {
    display: 'grid',
    gridTemplateColumns: gridTemplate,
    gap: 0,
    padding: '6px 12px',
    fontSize: 12,
    color: 'var(--text-primary)',
    background: bg,
    borderTop: '1px solid var(--border)',
    alignItems: 'center',
  }

  const cellEllipsisStyle = {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: 0,
  }

  const mutedCellStyle = {
    ...cellEllipsisStyle,
    color: 'var(--text-secondary, #888)',
  }

  const appName = sample?.appName || ''
  const windowTitle = sample?.windowTitle || ''
  const duration = Number(sample?.durationSeconds) || 0
  const timestamp = Number(sample?.timestamp) || 0

  return (
    <div
      style={rowStyle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{ ...cellEllipsisStyle, fontVariantNumeric: 'tabular-nums' }}>
        {formatSampleTime(timestamp)}
      </div>
      <div style={{ ...cellEllipsisStyle, fontVariantNumeric: 'tabular-nums' }}>
        {formatDuration(duration)}
      </div>
      <div style={cellEllipsisStyle} title={appName}>
        {appName}
      </div>
      <div style={mutedCellStyle} title={windowTitle}>
        {windowTitle}
      </div>
    </div>
  )
}
