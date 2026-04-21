/**
 * usageDataService
 *
 * Shared data access layer for the Usage tab widgets.
 *
 * Three sources, one interface:
 *   - TODAY (live):     today's sample buffer from Electron main (via IPC).
 *                       Finer-grained than Firestore, updated every ~3s.
 *                       Use this for anything "right now" that widgets render.
 *   - TODAY (summary):  same samples, aggregated via dailyUsageAggregation /
 *                       todayStats - matches what's being uploaded to Firestore.
 *   - HISTORICAL:       Firestore DailyData / DailyStats docs (same shape Swift
 *                       writes). Use for any past-day view.
 *
 * The OverlordKnowledgeWidget specifically reads Firestore even for "today"
 * because its purpose is to show what's injected into the AI prompt - and
 * that's only the Firestore-side representation.
 */

import {
  doc,
  onSnapshot,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore'
import { db, auth, onAuthStateChanged } from './firebaseService'
import { aggregateByAppWithDomains } from './dailyUsageAggregation'
import { getDailyStats, classifySample } from './todayStats'

// ---------------------------------------------------------------------------
// Day-key helpers
// ---------------------------------------------------------------------------

/** Local 'YYYY-MM-DD' matching Swift's DateFormatter("yyyy-MM-dd") behavior. */
export function todayKey() {
  return new Date().toLocaleDateString('en-CA')
}

export function dayKeyFor(date) {
  return date.toLocaleDateString('en-CA')
}

/** Returns ['YYYY-MM-DD', ...] for the N days up to and including today. */
export function recentDayKeys(count) {
  const keys = []
  const now = new Date()
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    keys.push(dayKeyFor(d))
  }
  return keys
}

// ---------------------------------------------------------------------------
// Today's buffer (IPC to electron main)
// ---------------------------------------------------------------------------

/**
 * Returns today's sample buffer from the Electron main process.
 * Returns [] if IPC not available (e.g. in dev web preview).
 */
export async function getTodaySamples() {
  const api = typeof window !== 'undefined' ? window.electronAPI : null
  if (!api || typeof api.getTodayBuffer !== 'function') return []
  try {
    const samples = await api.getTodayBuffer()
    return Array.isArray(samples) ? samples : []
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Live computed today values (uses the same code that the uploader uses)
// ---------------------------------------------------------------------------

export function aggregateToday(samples) {
  return aggregateByAppWithDomains(samples)
}

export function statsToday(samples, wordListService) {
  return getDailyStats(samples, wordListService ? { wordListService } : undefined)
}

export function classifyToday(sample, wordListService) {
  return classifySample(sample, wordListService)
}

// ---------------------------------------------------------------------------
// Firestore subscriptions (live)
// ---------------------------------------------------------------------------

function currentEmail() {
  return auth.currentUser?.email || null
}

/**
 * Resolve `auth.currentUser.email` once auth is ready. Fixes the race where a
 * consumer fires on mount before `onAuthStateChanged` has emitted its first
 * event (especially common for the heatmap that fetches 365 docs at startup).
 * Times out after `timeoutMs` and returns null.
 */
function waitForEmail(timeoutMs = 8000) {
  return new Promise((resolve) => {
    const immediate = currentEmail()
    if (immediate) { resolve(immediate); return }
    let done = false
    const finish = (v) => {
      if (done) return
      done = true
      try { unsub && unsub() } catch { /* noop */ }
      resolve(v)
    }
    const unsub = onAuthStateChanged((user) => {
      if (user?.email) finish(user.email)
    })
    setTimeout(() => finish(null), timeoutMs)
  })
}

/**
 * Subscribe to a daily doc. Works even if called before auth resolves - it
 * waits for the user, then starts the onSnapshot. Returns an unsubscribe
 * function that cancels whichever stage is active.
 */
function subscribeDaily(kind, dayKey, callback) {
  if (!dayKey) { callback(null); return () => {} }
  let unsub = null
  let cancelled = false
  ;(async () => {
    const email = await waitForEmail()
    if (cancelled) return
    if (!email) { callback(null); return }
    const ref = doc(db, 'users', email, 'Integrations', 'MacUsage', kind, dayKey)
    unsub = onSnapshot(
      ref,
      (snap) => callback(snap.exists() ? snap.data() : null),
      (err) => { console.error(`[usageData] ${kind} subscription error:`, err); callback(null) }
    )
  })()
  return () => {
    cancelled = true
    if (typeof unsub === 'function') unsub()
  }
}

/**
 * Shape: { date, lastUpdated, apps: {[key]: {totalSeconds, domain?}} }
 */
export function subscribeToDailyData(dayKey, callback) {
  return subscribeDaily('DailyData', dayKey, callback)
}

/**
 * Shape: { date, lastUpdated, focusScore, activeTimeSeconds, productiveTimeSeconds, afkTimeSeconds }
 */
export function subscribeToDailyStats(dayKey, callback) {
  return subscribeDaily('DailyStats', dayKey, callback)
}

// ---------------------------------------------------------------------------
// Historical one-shot fetches (for heatmap / timeline / range views)
// ---------------------------------------------------------------------------

/**
 * Fetch DailyData for a range of days via a single collection query (the
 * doc IDs are YYYY-MM-DD day keys, so a documentId() >= / <= filter covers
 * the range in one read instead of N getDoc calls).
 *
 * Returns { [dayKey]: data | null }. Days with no doc are absent from the map.
 */
export async function fetchDailyDataRange(startDayKey, endDayKey) {
  const email = await waitForEmail()
  if (!email) {
    console.warn('[usageData] fetchDailyDataRange: no authed user')
    return {}
  }
  try {
    const { documentId } = await import('firebase/firestore')
    const col = collection(db, 'users', email, 'Integrations', 'MacUsage', 'DailyData')
    const q = query(col, where(documentId(), '>=', startDayKey), where(documentId(), '<=', endDayKey))
    const snap = await getDocs(q)
    const out = {}
    snap.forEach(d => { out[d.id] = d.data() })
    return out
  } catch (err) {
    console.error('[usageData] fetchDailyDataRange failed:', err)
    return {}
  }
}

export async function fetchDailyStatsRange(startDayKey, endDayKey) {
  const email = await waitForEmail()
  if (!email) {
    console.warn('[usageData] fetchDailyStatsRange: no authed user')
    return {}
  }
  try {
    const { documentId } = await import('firebase/firestore')
    const col = collection(db, 'users', email, 'Integrations', 'MacUsage', 'DailyStats')
    const q = query(col, where(documentId(), '>=', startDayKey), where(documentId(), '<=', endDayKey))
    const snap = await getDocs(q)
    const out = {}
    snap.forEach(d => { out[d.id] = d.data() })
    return out
  } catch (err) {
    console.error('[usageData] fetchDailyStatsRange failed:', err)
    return {}
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers (match Swift TodayUsageService formatters)
// ---------------------------------------------------------------------------

/** "1h 23m", "23m", "45s" - matches Swift's compact time formatting. */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  if (rem === 0) return `${h}h`
  return `${h}h ${rem}m`
}

export function formatHMS(seconds) {
  const s = Math.max(0, Math.round(seconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n) => String(n).padStart(2, '0')
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(sec)}`
  return `${pad(m)}:${pad(sec)}`
}

export function formatPercentage(fraction) {
  return `${Math.round((fraction || 0) * 100)}%`
}
