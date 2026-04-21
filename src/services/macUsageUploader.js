/**
 * macUsageUploader
 *
 * Uploads daily activity data to Firestore on every minute boundary and once
 * at stop, matching the Swift Mac app's upload format byte-for-byte.
 *
 * Swift references (TrackingStateManager.swift):
 *   - uploadDailyUsageToFirebase: lines 2114-2193
 *   - uploadDailyStatsToFirebase: lines 2233-2267
 *   - uploadToFirestoreWithRetry: lines 2196-2231
 *   - Minute-boundary cadence: lines 1847-1864
 *   - Final upload at stop: lines 989-992
 *
 * Firestore paths (mirror Swift exactly):
 *   users/{email}/Integrations/MacUsage/DailyData/{YYYY-MM-DD}
 *   users/{email}/Integrations/MacUsage/DailyStats/{YYYY-MM-DD}
 */

import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db, auth, onAuthStateChanged } from './firebaseService'
import { aggregateByAppWithDomains } from './dailyUsageAggregation'
import { getDailyStats } from './todayStats'
import { wordList } from './index'
import { remoteLogger } from './remoteLogger'

const TICK_MS = 5000
const MINUTE_BOUNDARY_SECOND_WINDOW = 5
const MAX_RETRY_ATTEMPTS = 3

let tickHandle = null
let lastUploadedMinute = -1
let authUnsub = null
let hasAuthedUser = false
let uploadInFlight = false

function logError(message, err) {
  const detail = err && err.message ? err.message : String(err)
  console.error(`[macUsageUploader] ${message}`, err)
  try {
    remoteLogger?.error(`[macUsageUploader] ${message}: ${detail}`)
  } catch (_) {
    // swallow - never let logging kill the uploader
  }
}

function logInfo(message) {
  console.log(`[macUsageUploader] ${message}`)
  try {
    remoteLogger?.info(`[macUsageUploader] ${message}`)
  } catch (_) {
    // swallow
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Runs `fn` up to `attempts` times with 1s / 2s / 4s exponential backoff,
 * matching Swift's uploadToFirestoreWithRetry.
 */
async function withRetry(fn, attempts = MAX_RETRY_ATTEMPTS) {
  let lastErr = null
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await fn()
      return
    } catch (err) {
      lastErr = err
      if (attempt < attempts) {
        const delayMs = Math.pow(2, attempt - 1) * 1000
        logError(`Upload attempt ${attempt}/${attempts} failed, retrying in ${delayMs}ms`, err)
        await sleep(delayMs)
      } else {
        logError(`Upload failed after ${attempts} attempts`, err)
      }
    }
  }
  throw lastErr
}

/**
 * Build the per-app map matching Swift's format. `domain` is only included
 * when the aggregation produced one (URL-based entries).
 */
function buildAppsMap(aggregation) {
  const apps = {}
  if (!aggregation) return apps
  for (const [appKey, entry] of Object.entries(aggregation)) {
    if (!entry) continue
    const totalSeconds = Math.round(entry.totalSeconds || 0)
    const appData = { totalSeconds }
    if (entry.domain) {
      appData.domain = entry.domain
    }
    apps[appKey] = appData
  }
  return apps
}

/**
 * DailyData doc - mirrors Swift uploadDailyUsageToFirebase()
 * Path: users/{email}/Integrations/MacUsage/DailyData/{dayKey}
 */
async function uploadDailyUsageToFirebase(email, dayKey, aggregation) {
  const apps = buildAppsMap(aggregation)
  const payload = {
    date: dayKey,
    lastUpdated: serverTimestamp(),
    apps,
  }
  const ref = doc(db, 'users', email, 'Integrations', 'MacUsage', 'DailyData', dayKey)
  await withRetry(() => setDoc(ref, payload, { merge: true }))
}

/**
 * DailyStats doc - mirrors Swift uploadDailyStatsToFirebase()
 * Path: users/{email}/Integrations/MacUsage/DailyStats/{dayKey}
 */
async function uploadDailyStatsToFirebase(email, dayKey, stats) {
  const safe = stats || {}
  const payload = {
    date: dayKey,
    lastUpdated: serverTimestamp(),
    focusScore: Math.round(safe.focusScore || 0),
    activeTimeSeconds: Math.round(safe.activeSeconds || 0),
    productiveTimeSeconds: Math.round(safe.productiveSeconds || 0),
    afkTimeSeconds: Math.round(safe.afkSeconds || 0),
  }
  const ref = doc(db, 'users', email, 'Integrations', 'MacUsage', 'DailyStats', dayKey)
  await withRetry(() => setDoc(ref, payload, { merge: true }))
}

/**
 * Fetch samples + dayKey from the main-process buffer (Agent A), aggregate, and
 * upload both docs in parallel.
 */
async function uploadNow() {
  if (uploadInFlight) {
    // Don't stack uploads - the in-flight one will cover this minute.
    return
  }
  uploadInFlight = true
  try {
    const user = auth.currentUser
    if (!user || !user.email) {
      return
    }
    const email = user.email

    const api = typeof window !== 'undefined' ? window.electronAPI : null
    if (!api || typeof api.getTodayBuffer !== 'function' || typeof api.getTodayKey !== 'function') {
      // Main-process IPC not ready yet (Agent A pending). Safe to skip.
      return
    }

    const [samples, dayKey] = await Promise.all([
      api.getTodayBuffer(),
      api.getTodayKey(),
    ])

    if (!samples || !Array.isArray(samples) || samples.length === 0) {
      return
    }
    if (!dayKey || typeof dayKey !== 'string') {
      return
    }

    const aggregation = aggregateByAppWithDomains(samples)
    // Pass the wordList singleton so user-defined productive/distracting/blocked
    // classifications are honored (matches Swift AppCategoryService behavior).
    const stats = getDailyStats(samples, { wordListService: wordList })

    await Promise.all([
      uploadDailyUsageToFirebase(email, dayKey, aggregation).catch((err) => {
        logError('DailyData upload failed', err)
      }),
      uploadDailyStatsToFirebase(email, dayKey, stats).catch((err) => {
        logError('DailyStats upload failed', err)
      }),
    ])
  } catch (err) {
    logError('uploadNow crashed', err)
  } finally {
    uploadInFlight = false
  }
}

/**
 * 5s ticker. On each tick, if we're in the 0-5s window of a minute we haven't
 * uploaded for yet, kick off an upload. Mirrors Swift lines 1847-1864.
 */
function tick() {
  if (!hasAuthedUser) return
  const now = new Date()
  const currentSecond = now.getSeconds()
  const currentMinute = now.getMinutes()
  if (currentSecond <= MINUTE_BOUNDARY_SECOND_WINDOW && lastUploadedMinute !== currentMinute) {
    lastUploadedMinute = currentMinute
    uploadNow()
  }
}

/**
 * Kick off the uploader. Idempotent - safe to call multiple times.
 * Subscribes to auth state so uploads pause on sign-out and resume on sign-in.
 */
export function startUploader() {
  if (tickHandle !== null) return

  // Auth subscription - pauses/resumes tick behavior based on sign-in state.
  if (!authUnsub) {
    try {
      authUnsub = onAuthStateChanged((user) => {
        const hadUser = hasAuthedUser
        hasAuthedUser = !!(user && user.email)
        if (hasAuthedUser && !hadUser) {
          // Reset minute tracker so first tick after sign-in uploads.
          lastUploadedMinute = -1
          logInfo(`Auth ready for ${user.email} - uploads enabled`)
        } else if (!hasAuthedUser && hadUser) {
          logInfo('User signed out - uploads paused')
        }
      })
    } catch (err) {
      logError('onAuthStateChanged subscription failed', err)
    }
  }

  // Seed hasAuthedUser with current state in case auth is already resolved.
  const current = auth.currentUser
  hasAuthedUser = !!(current && current.email)

  tickHandle = setInterval(tick, TICK_MS)
  logInfo('Ticker started (5s cadence, minute-boundary uploads)')
}

/**
 * Stop the uploader and perform one final upload, mirroring Swift's
 * "Final Firebase upload before stopping" at lines 989-992.
 * Returns a promise that resolves when the final upload finishes.
 */
export async function stopUploader() {
  if (tickHandle !== null) {
    clearInterval(tickHandle)
    tickHandle = null
  }
  if (authUnsub) {
    try { authUnsub() } catch (_) { /* noop */ }
    authUnsub = null
  }
  lastUploadedMinute = -1
  try {
    await uploadNow()
  } catch (err) {
    logError('Final upload failed', err)
  }
  logInfo('Ticker stopped')
}
