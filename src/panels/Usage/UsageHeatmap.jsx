/**
 * UsageHeatmap
 *
 * GitHub-style contribution heatmap showing daily usage over the past year.
 * Matches the Swift UsageHeatmapWidget (OverlordMacScreenUtil/Views/UsageHeatmapWidget.swift)
 * as closely as possible for visual parity.
 *
 * Layout: 7 rows (Mon..Sun) x N weeks. Leftmost column is oldest, rightmost
 * column is current week. Month abbreviations are rendered above the grid at
 * the column where that month first appears (when its 1st-of-month falls in
 * the first 7 days of the column run). Day-of-week labels (Mon, Wed, Fri) sit
 * to the left of the grid. A "Less ... More" legend sits at bottom-right.
 *
 * Intensity (copied verbatim from Swift UsageHeatmapService.intensityLevel):
 *   totalSeconds == 0 -> grey (no-activity, not in legend)
 *   0h < h < 1h      -> level 0 -> opacity 0.2
 *   1h <= h < 3h     -> level 1 -> opacity 0.4
 *   3h <= h < 6h     -> level 2 -> opacity 0.6
 *   6h <= h < 9h     -> level 3 -> opacity 0.8
 *   h >= 9h          -> level 4 -> opacity 1.0
 *
 * Data source: fetchDailyStatsRange over the past 365 days, one-shot on mount.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchDailyStatsRange,
  todayKey,
  dayKeyFor,
} from '../../services/usageDataService'

// Dimensions match Swift (non-compact): cellSize 12, cellSpacing 3.
const DAYS_TO_SHOW = 365
const CELL_SIZE = 12
const CELL_GAP = 3
const CELL_RADIUS = 2
const MONTH_LABEL_HEIGHT = 20
const DAY_LABEL_COL_WIDTH = 30
const DAY_LABEL_PAD_RIGHT = 8

const FONT_STACK = "'Figtree', sans-serif"
const FONT_BOLD_STACK = "'FigtreeBold', 'Figtree', sans-serif"

// macOS system green approximated in sRGB.
const GREEN_RGB = '52, 199, 89'

// Opacity ramp (from Swift): [0.2, 0.4, 0.6, 0.8, 1.0]
const OPACITIES = [0.2, 0.4, 0.6, 0.8, 1.0]
const EMPTY_FILL = 'rgba(128, 128, 128, 0.12)'

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/**
 * Swift intensityLevel mapping. Returns 0..4.
 * Note: when totalSeconds == 0, caller should use EMPTY_FILL instead of this.
 */
function intensityLevelFor(totalHours) {
  if (totalHours < 1) return 0
  if (totalHours < 3) return 1
  if (totalHours < 6) return 2
  if (totalHours < 9) return 3
  return 4
}

function intensityColor(level) {
  return `rgba(${GREEN_RGB}, ${OPACITIES[level]})`
}

function parseDayKey(key) {
  return new Date(`${key}T00:00:00`)
}

/**
 * Format a duration (seconds) the same way Swift DayUsageData.formattedDuration does:
 *   "{H}h {M}m" when hours > 0
 *   "{M}m"     when minutes > 0
 *   "{S}s"     otherwise
 */
function formatSwiftDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return `${s}s`
}

/**
 * Format a date as "MMM d, yyyy" (matches Swift formattedDate).
 */
function formatDateMDY(date) {
  const month = MONTH_NAMES[date.getMonth()]
  return `${month} ${date.getDate()}, ${date.getFullYear()}`
}

/**
 * Convert JS getDay() (0=Sun..6=Sat) to Swift's Mon-first row index (0=Mon..6=Sun).
 * Mirrors Swift: `firstWeekday == 1 ? 6 : firstWeekday - 2` where firstWeekday
 * is Calendar.component(.weekday), which is 1=Sun..7=Sat. So:
 *   Sun -> 6, Mon -> 0, Tue -> 1, ... Sat -> 5.
 */
function mondayIndex(date) {
  const d = date.getDay()
  return d === 0 ? 6 : d - 1
}

/**
 * Build the list of days and group them into columns. Each column is an array
 * of 7 slots (indexed 0..6 for Mon..Sun). Missing slots at the start of the
 * first column and the end of the last column are `null`.
 *
 * Also computes month labels: for each day whose month changes AND whose
 * day-of-month is <= 7, record the column offset. This mirrors Swift's
 * computeRenderData().
 */
function buildLayout(startKey, endKey, statsByKey) {
  const start = parseDayKey(startKey)
  const end = parseDayKey(endKey)
  const days = []
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const k = dayKeyFor(d)
    const data = statsByKey ? (statsByKey[k] || null) : null
    const totalSeconds = (data && data.activeTimeSeconds) || 0
    days.push({
      dayKey: k,
      date: new Date(d),
      totalSeconds,
    })
  }

  const columns = []
  const monthLabels = [] // [{ text, colIndex }]
  let currentCol = new Array(7).fill(null)
  let colIndex = 0
  let hasData = false
  let lastMonth = null

  for (const day of days) {
    const rowIdx = mondayIndex(day.date)

    // A new column begins on Monday (rowIdx 0) unless this is the very first day.
    if (rowIdx === 0 && hasData) {
      columns.push(currentCol)
      currentCol = new Array(7).fill(null)
      colIndex = columns.length
    }

    currentCol[rowIdx] = day
    hasData = true

    // Month label: first time we see this month, and day-of-month <= 7
    // (Swift guards with `dayOfMonth <= 7` to avoid late-in-month labels).
    const m = day.date.getMonth()
    const dom = day.date.getDate()
    if (m !== lastMonth && dom <= 7) {
      monthLabels.push({
        text: MONTH_NAMES[m],
        colIndex,
      })
      lastMonth = m
    }
  }
  if (currentCol.some((c) => c !== null)) columns.push(currentCol)

  return { columns, monthLabels }
}

function tooltipText(day) {
  if (!day) return ''
  const date = formatDateMDY(day.date)
  if (day.totalSeconds > 0) {
    return `${date} - ${formatSwiftDuration(day.totalSeconds)}`
  }
  return `${date} - No activity`
}

function cellFill(day) {
  if (!day) return 'transparent'
  if (day.totalSeconds <= 0) return EMPTY_FILL
  const hours = day.totalSeconds / 3600
  const level = intensityLevelFor(hours)
  return intensityColor(level)
}

function Cell({ day }) {
  return (
    <div
      title={day ? tooltipText(day) : ''}
      style={{
        width: CELL_SIZE,
        height: CELL_SIZE,
        borderRadius: CELL_RADIUS,
        background: cellFill(day),
        boxSizing: 'border-box',
      }}
    />
  )
}

function DayLabels() {
  // Row 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun.
  // Swift labels Mon (row 0), Wed (row 2), Fri (row 4).
  const labels = ['Mon', '', 'Wed', '', 'Fri', '', '']
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        width: DAY_LABEL_COL_WIDTH,
        paddingRight: DAY_LABEL_PAD_RIGHT,
        paddingTop: MONTH_LABEL_HEIGHT, // Align first row with top of grid cells
        boxSizing: 'border-box',
        flexShrink: 0,
      }}
    >
      {labels.map((label, i) => (
        <div
          key={i}
          style={{
            height: CELL_SIZE,
            marginBottom: i < 6 ? CELL_GAP : 0,
            fontFamily: FONT_STACK,
            fontSize: 10,
            lineHeight: `${CELL_SIZE}px`,
            color: 'var(--text-secondary)',
          }}
        >
          {label}
        </div>
      ))}
    </div>
  )
}

function MonthLabelsRow({ monthLabels, totalWidth }) {
  return (
    <div
      style={{
        position: 'relative',
        width: totalWidth,
        height: MONTH_LABEL_HEIGHT,
      }}
    >
      {monthLabels.map((m, i) => (
        <div
          key={`${m.text}-${m.colIndex}-${i}`}
          style={{
            position: 'absolute',
            left: m.colIndex * (CELL_SIZE + CELL_GAP),
            top: 0,
            fontFamily: FONT_STACK,
            fontSize: 10,
            color: 'var(--text-secondary)',
            whiteSpace: 'nowrap',
          }}
        >
          {m.text}
        </div>
      ))}
    </div>
  )
}

function Legend() {
  return (
    <div style={styles.legend}>
      <span style={styles.legendLabel}>Less</span>
      {OPACITIES.map((_, i) => (
        <div
          key={i}
          style={{
            width: 10,
            height: 10,
            borderRadius: CELL_RADIUS,
            background: intensityColor(i),
            boxSizing: 'border-box',
          }}
        />
      ))}
      <span style={styles.legendLabel}>More</span>
    </div>
  )
}

export default function UsageHeatmap() {
  const [statsByKey, setStatsByKey] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const scrollRef = useRef(null)

  const { startKey, endKey } = useMemo(() => {
    const end = todayKey()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - (DAYS_TO_SHOW - 1))
    return { startKey: dayKeyFor(startDate), endKey: end }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchDailyStatsRange(startKey, endKey)
      .then((result) => {
        if (cancelled) return
        setStatsByKey(result || {})
        setLoading(false)
      })
      .catch((err) => {
        console.error('[UsageHeatmap] fetchDailyStatsRange failed:', err)
        if (cancelled) return
        setError(err)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [startKey, endKey])

  // Always compute layout (even for loading state) so the placeholder grid
  // has the same shape. When statsByKey is null, all days have totalSeconds 0
  // and render as EMPTY_FILL.
  const { columns, monthLabels } = useMemo(
    () => buildLayout(startKey, endKey, statsByKey || {}),
    [statsByKey, startKey, endKey]
  )

  const totalWidth =
    columns.length > 0
      ? columns.length * CELL_SIZE + (columns.length - 1) * CELL_GAP
      : 0

  const showPlaceholder = loading || !!error

  // Anchor to the rightmost column so today is visible by default. Runs after
  // layout, every time column count changes (including the first paint once
  // data loads). Uses rAF to wait for the grid to settle before measuring.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const apply = () => { el.scrollLeft = el.scrollWidth }
    const raf = requestAnimationFrame(apply)
    return () => cancelAnimationFrame(raf)
  }, [columns.length, showPlaceholder])

  return (
    <div style={styles.card}>
      <div style={styles.titleRow}>
        <div style={styles.title}>Activity Heatmap</div>
      </div>

      <div ref={scrollRef} style={styles.scrollWrap}>
        <div style={styles.gridRow}>
          <DayLabels />

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <MonthLabelsRow
              monthLabels={showPlaceholder ? [] : monthLabels}
              totalWidth={totalWidth}
            />

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${columns.length || 1}, ${CELL_SIZE}px)`,
                gridTemplateRows: `repeat(7, ${CELL_SIZE}px)`,
                columnGap: CELL_GAP,
                rowGap: CELL_GAP,
              }}
            >
              {Array.from({ length: 7 }).map((_, row) =>
                columns.map((col, colIdx) => (
                  <div
                    key={`r${row}-c${colIdx}`}
                    style={{
                      gridColumn: colIdx + 1,
                      gridRow: row + 1,
                    }}
                  >
                    <Cell day={showPlaceholder ? null : col[row]} />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={styles.legendRow}>
        <Legend />
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
    width: '100%',
    boxSizing: 'border-box',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontFamily: FONT_BOLD_STACK,
    fontWeight: 700,
    fontSize: 16,
    color: 'var(--text-primary)',
  },
  scrollWrap: {
    width: '100%',
    overflowX: 'auto',
    overflowY: 'hidden',
    paddingBottom: 4,
  },
  gridRow: {
    display: 'flex',
    alignItems: 'flex-start',
  },
  legendRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: 8,
    paddingRight: 4,
  },
  legend: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  legendLabel: {
    fontFamily: FONT_STACK,
    fontSize: 11,
    color: 'var(--text-secondary)',
  },
}
