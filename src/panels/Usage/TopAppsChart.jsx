import React, { useEffect, useState, useMemo } from 'react'
import {
  getTodaySamples,
  aggregateToday,
  formatDuration,
} from '../../services/usageDataService'

const POLL_INTERVAL_MS = 3000
const DEFAULT_LIMIT = 10
const ACCENT_COLOR = 'var(--brand-primary, #6366f1)'

export default function TopAppsChart() {
  const [entries, setEntries] = useState([])
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false

    const tick = async () => {
      try {
        const samples = await getTodaySamples()
        if (cancelled) return
        const agg = aggregateToday(samples) || {}
        const list = Object.keys(agg).map((key) => ({
          key,
          name: key,
          totalSeconds: Number(agg[key]?.totalSeconds) || 0,
          domain: agg[key]?.domain || null,
        }))
        list.sort((a, b) => b.totalSeconds - a.totalSeconds)
        setEntries(list)
      } catch (err) {
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.error('[TopAppsChart] poll failed:', err)
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

  const totalActiveSeconds = useMemo(
    () => entries.reduce((sum, e) => sum + (e.totalSeconds || 0), 0),
    [entries]
  )

  const maxSeconds = entries.length > 0 ? entries[0].totalSeconds : 0

  const visibleEntries = expanded ? entries : entries.slice(0, DEFAULT_LIMIT)
  const canExpand = entries.length > DEFAULT_LIMIT

  const cardStyle = {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 16,
  }

  const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  }

  const titleStyle = {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text-primary)',
    letterSpacing: 0.2,
  }

  const toggleBtnStyle = {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary, #888)',
    fontSize: 12,
    cursor: 'pointer',
    padding: '2px 6px',
  }

  const emptyStyle = {
    color: 'var(--text-tertiary, #999)',
    fontSize: 13,
    padding: '16px 4px',
    textAlign: 'center',
  }

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>Top Applications</span>
        {canExpand && (
          <button
            type="button"
            style={toggleBtnStyle}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Show less' : 'Show all'}
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div style={emptyStyle}>No activity yet today.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visibleEntries.map((e) => {
            const barPct = maxSeconds > 0
              ? Math.max(0, Math.min(100, (e.totalSeconds / maxSeconds) * 100))
              : 0
            const sharePct = totalActiveSeconds > 0
              ? Math.round((e.totalSeconds / totalActiveSeconds) * 100)
              : 0
            return (
              <div
                key={e.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  fontSize: 13,
                  color: 'var(--text-primary)',
                }}
              >
                <div
                  style={{
                    width: '30%',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={e.name}
                >
                  {e.name}
                </div>
                <div
                  style={{
                    width: '50%',
                    height: 8,
                    background: 'var(--bg-tertiary, rgba(128,128,128,0.2))',
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${barPct}%`,
                      height: '100%',
                      background: ACCENT_COLOR,
                      borderRadius: 4,
                      transition: 'width 300ms ease',
                    }}
                  />
                </div>
                <div
                  style={{
                    width: '20%',
                    textAlign: 'right',
                    color: 'var(--text-secondary, #888)',
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {formatDuration(e.totalSeconds)} {sharePct}%
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
