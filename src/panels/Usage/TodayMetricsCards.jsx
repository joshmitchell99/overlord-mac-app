/**
 * TodayMetricsCards
 *
 * Four summary cards showing today's activity metrics:
 *   1. Active Today  - total active seconds, delta vs yesterday
 *   2. Productive    - productive seconds, % of active today
 *   3. Unproductive  - unproductive seconds, % of active today
 *   4. Focus Score   - focusScore / 100, delta vs yesterday
 *
 * Data sources:
 *   - Today (live): getTodaySamples() every 3s, computed via statsToday()
 *   - Yesterday (for deltas): subscribeToDailyStats(yesterdayKey, cb)
 *
 * Ported from Swift TodayActivityMetricsView. Popover breakdowns and info
 * alerts are intentionally not ported here - just the 4 summary cards.
 */

import React, { useEffect, useState } from 'react'
import {
  getTodaySamples,
  statsToday,
  subscribeToDailyStats,
  dayKeyFor,
  formatDuration,
  formatPercentage,
} from '../../services/usageDataService'
import { wordList } from '../../services'

const REFRESH_MS = 3000

const PLACEHOLDER = '-'

const COLOR_POSITIVE = '#22c55e'
const COLOR_NEGATIVE = '#ef4444'

const FONT_STACK = "'Figtree', sans-serif"
const FONT_BOLD_STACK = "'FigtreeBold', 'Figtree', sans-serif"

function yesterdayKey() {
  return dayKeyFor(new Date(Date.now() - 86400 * 1000))
}

function formatSecondsDelta(seconds) {
  const sign = seconds >= 0 ? '+' : '-'
  const abs = Math.abs(seconds)
  return `${sign}${formatDuration(abs)}`
}

function formatScoreDelta(n) {
  const sign = n >= 0 ? '+' : '-'
  return `${sign}${Math.abs(n)}`
}

function deltaColor(n) {
  if (n > 0) return COLOR_POSITIVE
  if (n < 0) return COLOR_NEGATIVE
  return 'var(--text-tertiary)'
}

function Card({ label, value, sub, subColor }) {
  return (
    <div style={styles.card}>
      <div style={styles.label}>{label}</div>
      <div style={styles.value}>{value}</div>
      <div style={{ ...styles.sub, color: subColor || 'var(--text-tertiary)' }}>
        {sub}
      </div>
    </div>
  )
}

export default function TodayMetricsCards() {
  const [stats, setStats] = useState(null)
  const [yesterday, setYesterday] = useState(null)

  // Poll today's samples every 3s and compute live stats
  useEffect(() => {
    let cancelled = false

    async function tick() {
      try {
        const samples = await getTodaySamples()
        const next = statsToday(samples, wordList)
        if (!cancelled) setStats(next)
      } catch (err) {
        console.error('[TodayMetricsCards] statsToday failed:', err)
      }
    }

    tick()
    const id = setInterval(tick, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  // Subscribe to yesterday's Firestore stats for delta comparisons
  useEffect(() => {
    const key = yesterdayKey()
    const unsub = subscribeToDailyStats(key, (data) => {
      setYesterday(data)
    })
    return () => {
      try { unsub && unsub() } catch { /* noop */ }
    }
  }, [])

  const hasStats = stats !== null
  const active = hasStats ? stats.activeSeconds : 0
  const productive = hasStats ? stats.productiveSeconds : 0
  const unproductive = Math.max(0, active - productive)
  const focus = hasStats ? stats.focusScore : 0

  const yActive = yesterday?.activeTimeSeconds ?? null
  const yFocus = yesterday?.focusScore ?? null

  // Active Today
  const activeValue = hasStats ? formatDuration(active) : PLACEHOLDER
  let activeSub = PLACEHOLDER
  let activeSubColor = 'var(--text-tertiary)'
  if (hasStats && yActive != null) {
    const delta = active - yActive
    activeSub = formatSecondsDelta(delta)
    activeSubColor = deltaColor(delta)
  } else if (hasStats) {
    activeSub = 'no data yesterday'
  }

  // Productive
  const productiveValue = hasStats ? formatDuration(productive) : PLACEHOLDER
  const productiveFraction = active > 0 ? productive / active : 0
  const productiveSub = hasStats
    ? `${formatPercentage(productiveFraction)} of active`
    : PLACEHOLDER

  // Unproductive
  const unproductiveValue = hasStats ? formatDuration(unproductive) : PLACEHOLDER
  const unproductiveFraction = active > 0 ? unproductive / active : 0
  const unproductiveSub = hasStats
    ? `${formatPercentage(unproductiveFraction)} of active`
    : PLACEHOLDER

  // Focus Score
  const focusValue = hasStats ? `${focus}/100` : PLACEHOLDER
  let focusSub = PLACEHOLDER
  let focusSubColor = 'var(--text-tertiary)'
  if (hasStats && yFocus != null) {
    const delta = focus - yFocus
    focusSub = formatScoreDelta(delta)
    focusSubColor = deltaColor(delta)
  } else if (hasStats) {
    focusSub = 'no data yesterday'
  }

  return (
    <div style={styles.grid}>
      <Card
        label="Active Today"
        value={activeValue}
        sub={activeSub}
        subColor={activeSubColor}
      />
      <Card
        label="Productive"
        value={productiveValue}
        sub={productiveSub}
      />
      <Card
        label="Unproductive"
        value={unproductiveValue}
        sub={unproductiveSub}
      />
      <Card
        label="Focus Score"
        value={focusValue}
        sub={focusSub}
        subColor={focusSubColor}
      />
    </div>
  )
}

const styles = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 12,
    width: '100%',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 14,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    minWidth: 0,
  },
  label: {
    fontFamily: FONT_STACK,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: 'var(--text-tertiary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  value: {
    fontFamily: FONT_BOLD_STACK,
    fontWeight: 700,
    fontSize: 22,
    color: 'var(--text-primary)',
    lineHeight: 1.1,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  sub: {
    fontFamily: FONT_STACK,
    fontSize: 12,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
}
