/**
 * monitoringController - orchestrates stopping/starting all monitoring
 * subsystems from a single entry point.
 *
 * Ports the Swift app's PauseStateManager behavior:
 *   - Stop the native app monitor (main-process interval)
 *   - Pause the DecisionEngine polling timer
 *   - Pause ScoreService (recordApp + applyPassiveDecay no-op)
 *   - Stop the macUsageUploader ticker
 *   - Schedule an auto-resume if a resumeAt is provided
 *   - Persist state so a restart-while-paused picks up where it left off
 *
 * Also supports a softer "blocking-only" pause: scoring and check-ins
 * keep running, but hard-block overlays are suppressed. Runs independently
 * from the full pause (both can be active at once in theory, but the UI
 * makes them mutually exclusive).
 *
 * State is broadcast via a simple pub/sub (no React dependency).
 */

import { engine, score } from './index'
import { stopUploader, startUploader } from './macUsageUploader'

const STORE_KEY = 'monitoringPauseState'
const BLOCKING_STORE_KEY = 'blockingPauseState'

let _isStopped = false
let _resumeAt = null   // epoch ms, or null for indefinite
let _resumeTimer = null
let _hydrated = false

let _isBlockingStopped = false
let _blockingResumeAt = null
let _blockingResumeTimer = null

const listeners = new Set()

function emit() {
  const snapshot = {
    isStopped: _isStopped,
    resumeAt: _resumeAt,
    isBlockingStopped: _isBlockingStopped,
    blockingResumeAt: _blockingResumeAt,
  }
  for (const fn of listeners) {
    try { fn(snapshot) } catch (err) { console.error('[monitoringController] listener error', err) }
  }
}

async function persist() {
  try {
    if (!window.electronAPI?.storeSet) return
    if (_isStopped) {
      await window.electronAPI.storeSet(STORE_KEY, {
        isStopped: true,
        resumeAt: _resumeAt,
      })
    } else {
      await window.electronAPI.storeSet(STORE_KEY, null)
    }
  } catch (err) {
    console.error('[monitoringController] persist failed', err)
  }
}

async function persistBlocking() {
  try {
    if (!window.electronAPI?.storeSet) return
    if (_isBlockingStopped) {
      await window.electronAPI.storeSet(BLOCKING_STORE_KEY, {
        isBlockingStopped: true,
        resumeAt: _blockingResumeAt,
      })
    } else {
      await window.electronAPI.storeSet(BLOCKING_STORE_KEY, null)
    }
  } catch (err) {
    console.error('[monitoringController] persistBlocking failed', err)
  }
}

function clearResumeTimer() {
  if (_resumeTimer) {
    clearTimeout(_resumeTimer)
    _resumeTimer = null
  }
}

function clearBlockingResumeTimer() {
  if (_blockingResumeTimer) {
    clearTimeout(_blockingResumeTimer)
    _blockingResumeTimer = null
  }
}

function scheduleAutoResume() {
  clearResumeTimer()
  if (_resumeAt == null) return
  const delay = _resumeAt - Date.now()
  if (delay <= 0) {
    // Already elapsed
    start()
    return
  }
  _resumeTimer = setTimeout(() => {
    _resumeTimer = null
    start()
  }, delay)
}

function scheduleBlockingAutoResume() {
  clearBlockingResumeTimer()
  if (_blockingResumeAt == null) return
  const delay = _blockingResumeAt - Date.now()
  if (delay <= 0) {
    startBlocking()
    return
  }
  _blockingResumeTimer = setTimeout(() => {
    _blockingResumeTimer = null
    startBlocking()
  }, delay)
}

/**
 * Stop monitoring. `resumeAtMs` may be a future epoch-ms or null for
 * indefinite. Idempotent - if already stopped, just updates resumeAt.
 */
export async function stopUntil(resumeAtMs) {
  _isStopped = true
  _resumeAt = (typeof resumeAtMs === 'number' && resumeAtMs > Date.now()) ? resumeAtMs : null

  // 1. Native monitor process interval
  try {
    await window.electronAPI?.stopMonitoring?.()
  } catch (err) {
    console.error('[monitoringController] stopMonitoring IPC failed', err)
  }

  // 2. DecisionEngine polling re-record timer
  try { engine.pause?.() } catch (err) { console.error('[monitoringController] engine.pause failed', err) }

  // 3. ScoreService (freezes recordApp + passive decay)
  try { score.setPaused?.(true) } catch (err) { console.error('[monitoringController] score.setPaused failed', err) }

  // 4. Mac usage uploader
  try { await stopUploader() } catch (err) { console.error('[monitoringController] stopUploader failed', err) }

  scheduleAutoResume()
  await persist()
  emit()
}

/**
 * Start monitoring. Idempotent.
 */
export async function start() {
  _isStopped = false
  _resumeAt = null
  clearResumeTimer()

  // Reverse each subsystem.
  try {
    await window.electronAPI?.startMonitoring?.()
  } catch (err) {
    console.error('[monitoringController] startMonitoring IPC failed', err)
  }

  try { engine.resume?.() } catch (err) { console.error('[monitoringController] engine.resume failed', err) }
  try { score.setPaused?.(false) } catch (err) { console.error('[monitoringController] score.setPaused failed', err) }
  try { startUploader() } catch (err) { console.error('[monitoringController] startUploader failed', err) }

  await persist()
  emit()
}

/**
 * Softer pause: suppress only the block overlay for a duration. Scoring and
 * check-ins still fire. Clears any existing full-monitoring pause - the UI
 * treats the two modes as mutually exclusive.
 */
export async function stopBlockingUntil(resumeAtMs) {
  // If a full-stop is active, resume it first so the two modes don't stack.
  if (_isStopped) {
    await start()
  }

  _isBlockingStopped = true
  _blockingResumeAt = (typeof resumeAtMs === 'number' && resumeAtMs > Date.now()) ? resumeAtMs : null

  try { engine.setBlockingPaused?.(true) } catch (err) {
    console.error('[monitoringController] engine.setBlockingPaused failed', err)
  }

  scheduleBlockingAutoResume()
  await persistBlocking()
  emit()
}

/**
 * Resume hard-blocking. Idempotent.
 */
export async function startBlocking() {
  _isBlockingStopped = false
  _blockingResumeAt = null
  clearBlockingResumeTimer()

  try { engine.setBlockingPaused?.(false) } catch (err) {
    console.error('[monitoringController] engine.setBlockingPaused(false) failed', err)
  }

  await persistBlocking()
  emit()
}

export function isStopped() {
  return _isStopped
}

export function resumeAt() {
  return _resumeAt
}

export function isBlockingStopped() {
  return _isBlockingStopped
}

export function blockingResumeAt() {
  return _blockingResumeAt
}

export function getState() {
  return {
    isStopped: _isStopped,
    resumeAt: _resumeAt,
    isBlockingStopped: _isBlockingStopped,
    blockingResumeAt: _blockingResumeAt,
  }
}

export function onChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * Rehydrate from persisted state. Call once at startup. If the saved resumeAt
 * is already in the past, resumes immediately (and clears the saved state).
 * If still in the future, restores the stopped state and schedules auto-resume.
 */
export async function hydrateFromStore() {
  if (_hydrated) return
  _hydrated = true
  try {
    if (!window.electronAPI?.storeGet) return

    // Full monitoring pause
    const saved = await window.electronAPI.storeGet(STORE_KEY)
    if (saved && saved.isStopped) {
      const savedResumeAt = (typeof saved.resumeAt === 'number') ? saved.resumeAt : null
      if (savedResumeAt != null && savedResumeAt <= Date.now()) {
        await persist() // writes null since _isStopped is still false
      } else {
        await stopUntil(savedResumeAt)
      }
    }

    // Blocking-only pause
    const savedBlocking = await window.electronAPI.storeGet(BLOCKING_STORE_KEY)
    if (savedBlocking && savedBlocking.isBlockingStopped) {
      const savedResumeAt = (typeof savedBlocking.resumeAt === 'number') ? savedBlocking.resumeAt : null
      if (savedResumeAt != null && savedResumeAt <= Date.now()) {
        await persistBlocking()
      } else {
        await stopBlockingUntil(savedResumeAt)
      }
    }
  } catch (err) {
    console.error('[monitoringController] hydrateFromStore failed', err)
  }
}
