import React, { useState, useEffect, useRef } from 'react'

/**
 * FloatingScoreBar - tiny menubar-adjacent score pill with expandable poll log.
 * Mirrors the Swift FloatingScoreWindow + FloatingScorePopoverView.
 *
 * Rendered inside a small transparent BrowserWindow created by Electron main.
 * Receives score + poll entries via IPC from the main renderer.
 */
export default function FloatingScoreBar() {
  const [score, setScore] = useState(0)
  const [threshold, setThreshold] = useState(20)
  const [pollLog, setPollLog] = useState([])
  const [expanded, setExpanded] = useState(false)
  const containerRef = useRef(null)

  // Force transparent background for this window (global.css sets a solid one)
  useEffect(() => {
    document.body.style.background = 'transparent'
    document.documentElement.style.background = 'transparent'
  }, [])

  useEffect(() => {
    if (!window.electronAPI?.onScoreBarUpdate) return
    const cleanup = window.electronAPI.onScoreBarUpdate((data) => {
      if (data.score != null) setScore(data.score)
      if (data.threshold != null) setThreshold(data.threshold)
      if (data.entry) {
        setPollLog((prev) => [data.entry, ...prev].slice(0, 100))
      }
    })
    return cleanup
  }, [])

  // Notify Electron to resize the window when expanded/collapsed
  useEffect(() => {
    if (window.electronAPI?.resizeScoreBar) {
      window.electronAPI.resizeScoreBar(expanded)
    }
  }, [expanded])

  // Close popover on blur (user clicked away from the window entirely)
  useEffect(() => {
    if (!expanded) return
    function handleBlur() {
      setExpanded(false)
    }
    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
  }, [expanded])

  const dotColor = getDotColor(score, threshold)

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        fontFamily: "'Figtree', -apple-system, sans-serif",
        userSelect: 'none',
        cursor: 'default',
      }}
    >
      {/* Pill - always visible, flush to the right */}
      <div style={styles.pill} onClick={() => setExpanded(!expanded)}>
        <div style={{ ...styles.dot, background: dotColor }} />
        <span style={styles.pillText}>
          {score.toFixed(1)}/{Math.round(threshold)}
        </span>
        <div style={{ ...styles.dot, background: dotColor }} />
      </div>

      {/* Popover - drops below the pill when expanded */}
      {expanded && (
        <div style={styles.popover}>
          {/* Header */}
          <div style={styles.popoverHeader}>
            <span style={styles.headerScore}>
              Score: {score.toFixed(1)}/{Math.round(threshold)}
            </span>
          </div>
          <div style={styles.divider} />

          {/* Log entries */}
          <div style={styles.logScroll}>
            {pollLog.length === 0 ? (
              <span style={styles.emptyText}>No polls yet...</span>
            ) : (
              pollLog.map((entry, i) => (
                <div
                  key={entry.ts + '-' + i}
                  style={{
                    ...styles.logRow,
                    background: i % 2 === 0 ? 'rgba(0,0,0,0.03)' : 'transparent',
                  }}
                >
                  <span style={styles.timestamp}>{formatTime(entry.ts)}</span>
                  <div style={{ ...styles.logDot, background: listColor(entry.list) }} />
                  <span style={styles.appName}>{entry.app}</span>
                  <span
                    style={{
                      ...styles.scoreDelta,
                      color:
                        entry.delta > 0 ? '#ef4444' : entry.delta < 0 ? '#22c55e' : '#888',
                    }}
                  >
                    {entry.delta >= 0 ? '+' : ''}
                    {entry.delta.toFixed(1)}
                  </span>
                  <span style={styles.totalScore}>{entry.total.toFixed(1)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function getDotColor(score, threshold) {
  if (threshold === 0) return '#22c55e'
  if (score >= threshold) return '#ef4444'
  if (score >= threshold * 0.7) return '#f59e0b'
  if (score >= threshold * 0.3) return '#eab308'
  return '#22c55e'
}

function listColor(list) {
  switch (list) {
    case 'productive': return '#22c55e'
    case 'distracting': return '#f59e0b'
    case 'blocked': return '#ef4444'
    default: return '#eab308'
  }
}

function formatTime(ts) {
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const styles = {
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '2px 8px',
    borderRadius: 5,
    background: 'rgba(0, 0, 0, 0.65)',
    cursor: 'pointer',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    flexShrink: 0,
  },
  pillText: {
    fontSize: 11,
    fontWeight: 600,
    fontFamily: "'SF Mono', 'Menlo', monospace",
    color: '#fff',
    lineHeight: '16px',
  },
  popover: {
    marginTop: 6,
    width: 360,
    flex: 1,
    minHeight: 0,
    background: '#fff',
    borderRadius: 10,
    boxShadow: '0 8px 30px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
    border: '1px solid rgba(0,0,0,0.1)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  popoverHeader: {
    padding: '12px 12px 8px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerScore: {
    fontSize: 14,
    fontWeight: 700,
    fontFamily: "'SF Mono', 'Menlo', monospace",
    color: '#111',
  },
  divider: {
    height: 1,
    background: 'rgba(0,0,0,0.08)',
    marginLeft: 12,
    marginRight: 12,
  },
  logScroll: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px 0',
  },
  logRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 8px',
  },
  timestamp: {
    fontSize: 10,
    fontFamily: "'SF Mono', 'Menlo', monospace",
    color: '#888',
    width: 56,
    flexShrink: 0,
  },
  logDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    flexShrink: 0,
  },
  appName: {
    fontSize: 11,
    fontWeight: 500,
    color: '#222',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  scoreDelta: {
    fontSize: 10,
    fontWeight: 600,
    fontFamily: "'SF Mono', 'Menlo', monospace",
    width: 42,
    textAlign: 'right',
    flexShrink: 0,
  },
  totalScore: {
    fontSize: 10,
    fontFamily: "'SF Mono', 'Menlo', monospace",
    color: '#888',
    width: 32,
    textAlign: 'right',
    flexShrink: 0,
  },
  emptyText: {
    fontSize: 12,
    color: '#999',
    padding: 16,
    display: 'block',
    textAlign: 'center',
  },
}
