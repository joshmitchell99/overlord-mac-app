import React, { useState, useEffect } from 'react'
import { subscribeToDailyData, subscribeToDailyStats, todayKey } from '../../services/usageDataService'

/**
 * Mirrors the Swift OverlordKnowledgeWidget: two monospaced text blocks showing
 * the exact data injected into the AI prompt (mac_daily_stats, mac_usage_today).
 */
function formatDurationSwift(seconds) {
  const s = Math.max(0, Math.round(seconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${sec}s`
}

function formatUsageDurationSwift(seconds) {
  const s = Math.max(0, Math.round(seconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m ${sec}s`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

export default function OverlordKnowledge() {
  const [dailyStats, setDailyStats] = useState(null)
  const [dailyData, setDailyData] = useState(null)
  const [statsLoaded, setStatsLoaded] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)

  useEffect(() => {
    const dayKey = todayKey()
    const unsubStats = subscribeToDailyStats(dayKey, (d) => {
      setDailyStats(d)
      setStatsLoaded(true)
    })
    const unsubData = subscribeToDailyData(dayKey, (d) => {
      setDailyData(d)
      setDataLoaded(true)
    })
    return () => {
      if (typeof unsubStats === 'function') unsubStats()
      if (typeof unsubData === 'function') unsubData()
    }
  }, [])

  const statsLines = (() => {
    if (!statsLoaded) return 'Loading...'
    if (!dailyStats) return 'No stats for today'
    return [
      `Focus Score: ${Math.round(dailyStats.focusScore || 0)}%`,
      `Active Time: ${formatDurationSwift(dailyStats.activeTimeSeconds)}`,
      `Productive Time: ${formatDurationSwift(dailyStats.productiveTimeSeconds)}`,
      `AFK Time: ${formatDurationSwift(dailyStats.afkTimeSeconds)}`,
    ].join('\n')
  })()

  const usageLines = (() => {
    if (!dataLoaded) return 'Loading...'
    const apps = dailyData?.apps
    if (!apps || Object.keys(apps).length === 0) return 'No usage data for today'
    return Object.entries(apps)
      .map(([name, entry]) => ({ name, seconds: entry?.totalSeconds || 0 }))
      .sort((a, b) => b.seconds - a.seconds)
      .map((e) => `${e.name}: ${formatUsageDurationSwift(e.seconds)}`)
      .join('\n')
  })()

  return (
    <div style={styles.card}>
      <div style={styles.titleRow}>
        <span style={styles.title}>What Overlord Knows</span>
      </div>
      <div style={styles.subtitle}>
        Exact data injected into Overlord's AI prompt.
      </div>

      <div style={styles.blockWrap}>
        <div style={styles.blockLabel}>mac_daily_stats</div>
        <pre style={styles.pre}>{statsLines}</pre>
      </div>

      <div style={styles.blockWrap}>
        <div style={styles.blockLabel}>mac_usage_today</div>
        <pre style={styles.pre}>{usageLines}</pre>
      </div>
    </div>
  )
}

const styles = {
  card: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 16,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: "'Figtree', sans-serif",
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  subtitle: {
    fontFamily: "'Figtree', sans-serif",
    fontSize: 12,
    color: 'var(--text-tertiary)',
    marginTop: 2,
  },
  blockWrap: {
    marginTop: 14,
  },
  blockLabel: {
    fontFamily: "'SF Mono', 'Menlo', monospace",
    fontSize: 11,
    color: 'var(--text-tertiary)',
    marginBottom: 6,
    textTransform: 'lowercase',
  },
  pre: {
    margin: 0,
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 12,
    fontFamily: "'SF Mono', 'Menlo', monospace",
    fontSize: 12,
    color: 'var(--text-primary)',
    whiteSpace: 'pre-wrap',
    overflow: 'auto',
    maxHeight: 260,
  },
}
