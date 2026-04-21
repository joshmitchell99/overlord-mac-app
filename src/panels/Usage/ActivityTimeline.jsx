import React, { useEffect, useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  getTodaySamples,
  formatDuration,
} from '../../services/usageDataService'

const POLL_INTERVAL_MS = 5000

// 5 distinct colors for the top apps + grey for "Other".
const APP_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6']
const OTHER_COLOR = '#64748b'
const OTHER_KEY = 'Other'

const HOURS = Array.from({ length: 24 }, (_, i) => i)

function formatHourLabel(hour) {
  // 12am, 3am, 6am, 9am, 12pm, 3pm, 6pm, 9pm
  if (hour === 0) return '12am'
  if (hour === 12) return '12pm'
  if (hour < 12) return `${hour}am`
  return `${hour - 12}pm`
}

function formatMinutesAxis(seconds) {
  if (!seconds || seconds <= 0) return '0'
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  if (rem === 0) return `${hrs}h`
  return `${hrs}h${rem}m`
}

function displayNameForSample(sample) {
  if (!sample) return 'Unknown'
  return sample.appName || sample.bundleId || 'Unknown'
}

export default function ActivityTimeline() {
  const [samples, setSamples] = useState([])

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
          console.error('[ActivityTimeline] poll failed:', err)
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

  const { chartData, legend, colorMap, hasAnyActivity } = useMemo(() => {
    // Aggregate per-app totals across the whole day to find the top 5.
    const dayTotals = new Map()
    // And per-hour, per-app seconds.
    const hourApp = Array.from({ length: 24 }, () => new Map())

    for (const s of samples || []) {
      const ts = Number(s?.timestamp)
      const dur = Number(s?.durationSeconds) || 0
      if (!ts || dur <= 0) continue
      const hour = new Date(ts).getHours()
      if (hour < 0 || hour > 23) continue
      const name = displayNameForSample(s)

      dayTotals.set(name, (dayTotals.get(name) || 0) + dur)
      const bucket = hourApp[hour]
      bucket.set(name, (bucket.get(name) || 0) + dur)
    }

    const sortedApps = Array.from(dayTotals.entries()).sort(
      (a, b) => b[1] - a[1]
    )
    const topApps = sortedApps.slice(0, 5).map(([name]) => name)
    const topSet = new Set(topApps)

    // Build the chart data: one row per hour, each top app as its own key, plus "Other".
    const rows = HOURS.map((hour) => {
      const row = { hour, hourLabel: formatHourLabel(hour) }
      for (const app of topApps) row[app] = 0
      row[OTHER_KEY] = 0
      const bucket = hourApp[hour]
      for (const [name, dur] of bucket.entries()) {
        if (topSet.has(name)) {
          row[name] = (row[name] || 0) + dur
        } else {
          row[OTHER_KEY] = (row[OTHER_KEY] || 0) + dur
        }
      }
      return row
    })

    // Color map (stable by rank).
    const cMap = {}
    topApps.forEach((app, i) => {
      cMap[app] = APP_COLORS[i % APP_COLORS.length]
    })
    cMap[OTHER_KEY] = OTHER_COLOR

    // Legend entries with day totals.
    const legendEntries = topApps.map((app) => ({
      key: app,
      name: app,
      total: dayTotals.get(app) || 0,
      color: cMap[app],
    }))

    // "Other" total across all non-top apps.
    let otherTotal = 0
    for (const [name, total] of dayTotals.entries()) {
      if (!topSet.has(name)) otherTotal += total
    }
    if (otherTotal > 0) {
      legendEntries.push({
        key: OTHER_KEY,
        name: OTHER_KEY,
        total: otherTotal,
        color: OTHER_COLOR,
      })
    }

    const hasActivity = dayTotals.size > 0
    return {
      chartData: rows,
      legend: legendEntries,
      colorMap: cMap,
      hasAnyActivity: hasActivity,
    }
  }, [samples])

  const stackedKeys = useMemo(() => {
    // All keys that have a non-zero value anywhere, in legend order.
    return legend.map((l) => l.key)
  }, [legend])

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

  const emptyStyle = {
    color: 'var(--text-tertiary, #999)',
    fontSize: 13,
    padding: '32px 4px',
    textAlign: 'center',
    minHeight: 280,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  const chartWrapStyle = {
    width: '100%',
    height: 260,
  }

  const legendWrapStyle = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
    paddingTop: 8,
    borderTop: '1px solid var(--border)',
  }

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>Today's Activity Timeline</span>
      </div>

      {!hasAnyActivity ? (
        <div style={emptyStyle}>No activity yet today.</div>
      ) : (
        <>
          <div style={chartWrapStyle}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                barCategoryGap={2}
              >
                <XAxis
                  dataKey="hour"
                  tick={{ fill: 'var(--text-tertiary, #999)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                  interval={2}
                  tickFormatter={(h) => formatHourLabel(h)}
                />
                <YAxis
                  tick={{ fill: 'var(--text-tertiary, #999)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickFormatter={formatMinutesAxis}
                  width={44}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(128,128,128,0.08)' }}
                  content={<HourTooltip colorMap={colorMap} />}
                />
                {stackedKeys.map((key) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    stackId="a"
                    fill={colorMap[key] || OTHER_COLOR}
                    isAnimationActive={false}
                    radius={0}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={legendWrapStyle}>
            {legend.map((item) => (
              <div
                key={item.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  color: 'var(--text-secondary, #888)',
                }}
                title={item.name}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    maxWidth: 140,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    color: 'var(--text-primary)',
                  }}
                >
                  {item.name}
                </span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatDuration(item.total)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function HourTooltip({ active, payload, label, colorMap }) {
  if (!active || !payload || payload.length === 0) return null

  const hour = typeof label === 'number' ? label : payload[0]?.payload?.hour
  const hourText = formatHourLabel(hour ?? 0)

  // Sort payload entries by value desc, drop zeros.
  const rows = payload
    .map((p) => ({
      name: p.dataKey,
      value: Number(p.value) || 0,
      color: (colorMap && colorMap[p.dataKey]) || p.color || OTHER_COLOR,
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)

  if (rows.length === 0) return null

  const tooltipStyle = {
    background: 'var(--bg-secondary, #1a1a1a)',
    border: '1px solid var(--border, rgba(128,128,128,0.3))',
    borderRadius: 6,
    padding: '8px 10px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    minWidth: 160,
  }

  return (
    <div style={tooltipStyle}>
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-tertiary, #999)',
          marginBottom: 6,
        }}
      >
        {hourText}
      </div>
      {rows.map((r) => (
        <div
          key={r.name}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: 'var(--text-primary)',
            padding: '2px 0',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: 2,
              background: r.color,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              flex: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 160,
            }}
          >
            {r.name}
          </span>
          <span
            style={{
              color: 'var(--text-secondary, #888)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatDuration(r.value)}
          </span>
        </div>
      ))}
    </div>
  )
}
