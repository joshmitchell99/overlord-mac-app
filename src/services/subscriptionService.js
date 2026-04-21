/**
 * subscriptionService
 *
 * JS port of the Swift `SubscriptionService` (see
 * overlord-mac-app/OverlordMacScreenUtil/Services/SubscriptionService.swift).
 *
 * Mirrors the same published state, listener path, and Cloud Function calls.
 * Exposed as a module-level singleton with a subscribe callback API for React.
 */

import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { getApp } from 'firebase/app'
import { auth, db, onAuthStateChanged } from './firebaseService'

// ---------------------------------------------------------------------------
// Constants (match Swift)
// ---------------------------------------------------------------------------

// Stripe Price ID for Overlord Pro subscription (Swift line 49)
const PRO_PRICE_ID = 'price_1RKKt2CKleWwVLVTkcpDrDeb'

// Tier ordering for upgrade-only logic (Swift line 230)
const TIER_LEVEL = { none: 0, premium: 1, pro: 2, overlord: 3 }

// Checkout polling (Swift lines 350-394)
const POLL_INTERVAL_MS = 20 * 1000     // 20 seconds
const POLL_DURATION_MS = 5 * 60 * 1000 // 5 minutes

// Firebase Functions handle (default region, matches Swift's Functions.functions())
const functions = getFunctions(getApp())

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

const state = {
  subscriptionStatus: 'none',       // 'none' | 'premium' | 'pro' | 'overlord'
  freeSubscription: false,
  isLoading: false,                 // legacy
  isRefreshing: false,
  isOpeningBillingPortal: false,
  isCheckingOut: false,
  error: null,                      // string | null
  lastCheckTime: null,              // Date | null
}

let firestoreUnsub = null
let pollingTimer = null
let pollingEndTime = null
let authWaiterUnsub = null

const listeners = new Set()

// ---------------------------------------------------------------------------
// Emitter / subscribe API
// ---------------------------------------------------------------------------

function getState() {
  return {
    subscriptionStatus: state.subscriptionStatus,
    freeSubscription: state.freeSubscription,
    isLoading: state.isLoading,
    isRefreshing: state.isRefreshing,
    isOpeningBillingPortal: state.isOpeningBillingPortal,
    isCheckingOut: state.isCheckingOut,
    error: state.error,
    lastCheckTime: state.lastCheckTime,
    hasValidSubscription: hasValidSubscription(),
    canAccessChatFeatures: hasValidSubscription(),
  }
}

function subscribe(fn) {
  listeners.add(fn)
  try { fn(getState()) } catch (e) { console.error('[SubscriptionService] listener error:', e) }
  return () => listeners.delete(fn)
}

function emit() {
  const snapshot = getState()
  for (const fn of listeners) {
    try { fn(snapshot) } catch (e) { console.error('[SubscriptionService] listener error:', e) }
  }
}

// ---------------------------------------------------------------------------
// Computed getters
// ---------------------------------------------------------------------------

function hasValidSubscription() {
  return (
    state.freeSubscription ||
    state.subscriptionStatus === 'pro' ||
    state.subscriptionStatus === 'overlord'
  )
}

function canAccessChatFeatures() {
  return hasValidSubscription()
}

function isSubscribed() {
  return hasValidSubscription()
}

function getTier() {
  return state.subscriptionStatus
}

// ---------------------------------------------------------------------------
// Firebase listener (Swift lines 72-129)
// ---------------------------------------------------------------------------

function attachListenerForEmail(email) {
  // Stop any existing listener before replacing it.
  if (firestoreUnsub) {
    try { firestoreUnsub() } catch { /* noop */ }
    firestoreUnsub = null
  }

  const infoRef = doc(db, 'users', email, 'Settings', 'info')
  console.log(`[SubscriptionService] Starting listener for /users/${email}/Settings/info`)

  firestoreUnsub = onSnapshot(
    infoRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        console.log('[SubscriptionService] No subscription data found, using defaults')
        state.subscriptionStatus = 'none'
        state.freeSubscription = false
        emit()
        return
      }
      const data = snapshot.data() || {}
      const status = typeof data.forfeitSubscriptionStatus === 'string'
        ? data.forfeitSubscriptionStatus
        : 'none'
      const freeSub = data.freeSubscription === true

      console.log(`[SubscriptionService] Subscription updated - status: ${status}, freeSubscription: ${freeSub}`)

      state.subscriptionStatus = status
      state.freeSubscription = freeSub
      emit()
    },
    (err) => {
      console.error('[SubscriptionService] Error listening for subscription:', err?.message || err)
      state.error = err?.message || String(err)
      emit()
    }
  )
}

/**
 * Start the real-time listener. If auth is not yet resolved, waits for the
 * first authenticated user and then attaches. Idempotent per email.
 */
function startListening() {
  const currentEmail = auth.currentUser?.email || null
  if (currentEmail) {
    attachListenerForEmail(currentEmail)
    return
  }

  // Wait for auth to resolve, then attach.
  if (authWaiterUnsub) {
    try { authWaiterUnsub() } catch { /* noop */ }
    authWaiterUnsub = null
  }
  authWaiterUnsub = onAuthStateChanged((user) => {
    const email = user?.email || null
    if (email) {
      attachListenerForEmail(email)
    } else {
      // User signed out - tear down listener and reset to defaults.
      stopListening()
      state.subscriptionStatus = 'none'
      state.freeSubscription = false
      emit()
    }
  })
}

function stopListening() {
  if (firestoreUnsub) {
    try { firestoreUnsub() } catch { /* noop */ }
    firestoreUnsub = null
  }
}

// ---------------------------------------------------------------------------
// Stripe Subscription Check (Swift lines 134-267)
// ---------------------------------------------------------------------------

async function checkStripeSubscription() {
  const userEmail = auth.currentUser?.email || null
  if (!userEmail) {
    state.error = 'Not authenticated'
    emit()
    console.log('[SubscriptionService] Cannot check Stripe - not authenticated')
    return
  }

  // Prevent duplicate calls while already refreshing (Swift line 144-148).
  if (state.isRefreshing) {
    console.log('[SubscriptionService] Already checking subscription, skipping duplicate call')
    return
  }

  state.isRefreshing = true
  state.error = null
  emit()

  console.log(`[SubscriptionService] Checking Stripe subscription for ${userEmail}...`)

  try {
    // Fetch stripeCustomerId from the user doc (Swift lines 158-162).
    const userDocRef = doc(db, 'users', userEmail)
    const userSnap = await getDoc(userDocRef)
    const stripeCustomerId = userSnap.exists()
      ? (userSnap.data()?.stripeCustomerId || null)
      : null

    console.log(`[SubscriptionService] Fetched stripeCustomerId: ${stripeCustomerId ?? 'nil'}`)

    const params = { userEmail }
    if (stripeCustomerId) params.stripeCustomerId = stripeCustomerId

    const callable = httpsCallable(functions, 'checkFirstActiveStripeWebSubscription')
    const result = await callable(params)

    const responseData = result?.data
    if (!responseData || typeof responseData !== 'object') {
      console.log('[SubscriptionService] No data in response')
      state.isRefreshing = false
      state.lastCheckTime = new Date()
      emit()
      return
    }

    // Extract subscription from response (Swift lines 186-192).
    const subscriptionData = (responseData.subscription && typeof responseData.subscription === 'object')
      ? responseData.subscription
      : responseData

    if (!subscriptionData || typeof subscriptionData !== 'object') {
      console.log('[SubscriptionService] No subscription data found')
      state.isRefreshing = false
      state.lastCheckTime = new Date()
      emit()
      return
    }

    const productNameRaw = typeof subscriptionData.product_name === 'string'
      ? subscriptionData.product_name
      : ''
    const productName = productNameRaw.toLowerCase()

    if (productName === '') {
      console.log('[SubscriptionService] No product name in response, data:', subscriptionData)
      state.isRefreshing = false
      state.lastCheckTime = new Date()
      emit()
      return
    }

    console.log(`[SubscriptionService] Found subscription with product: ${productName}`)

    // Map product name to tier (Swift lines 216-225).
    let tier
    if (productName.includes('overlord')) {
      tier = 'overlord'
    } else if (productName.includes('pro')) {
      tier = 'pro'
    } else if (productName.includes('premium')) {
      tier = 'premium'
    } else {
      tier = 'none'
    }

    console.log(`[SubscriptionService] Mapped to tier: ${tier}`)

    // Upgrade-only logic, hardened against stale local state.
    //
    // Critical: read the authoritative current tier from Firestore right now,
    // NOT from in-memory state. The Firestore snapshot listener may not have
    // fired yet (e.g. if the user hits Refresh immediately after sign-in or
    // if checkout polling kicks in before the first listener emit), in which
    // case state.subscriptionStatus is still the default 'none' and a legit
    // but lower-tier Stripe response would look like an upgrade.
    const infoRef = doc(db, 'users', userEmail, 'Settings', 'info')
    let authoritativeStatus = state.subscriptionStatus
    let authoritativePremium = false
    try {
      const infoSnap = await getDoc(infoRef)
      if (infoSnap.exists()) {
        const data = infoSnap.data() || {}
        if (typeof data.forfeitSubscriptionStatus === 'string') {
          authoritativeStatus = data.forfeitSubscriptionStatus
        }
        authoritativePremium = !!data.overlordPremiumEnabled
      }
    } catch (readErr) {
      // If the read fails, fall back to local state - still upgrade-only,
      // just vulnerable to the stale-state race we tried to avoid.
      console.warn('[SubscriptionService] Could not read authoritative tier; falling back to local state:', readErr?.message)
    }

    const currentLevel = TIER_LEVEL[authoritativeStatus] ?? 0
    const newLevel = TIER_LEVEL[tier] ?? 0

    if (newLevel > currentLevel) {
      // Upgrade: update Firebase then local state. Monotonic on premiumEnabled:
      // if it was already true in Firestore, keep it true - never flip it off
      // (e.g. upgrading 'none' -> 'premium' must not clobber an admin-set
      // overlordPremiumEnabled=true).
      const nextPremium = (tier === 'pro' || tier === 'overlord') || authoritativePremium
      await updateSubscriptionInFirebase(tier, nextPremium)
      state.subscriptionStatus = tier
      state.isRefreshing = false
      state.lastCheckTime = new Date()
      state.error = null
      emit()
      console.log(`[SubscriptionService] Successfully UPGRADED subscription from ${authoritativeStatus} to ${tier}`)
    } else {
      // Would be a downgrade (or same tier) - skip Firebase update.
      console.log(
        `[SubscriptionService] Skipping downgrade from ${authoritativeStatus} to ${tier} - only upgrades allowed`
      )
      state.isRefreshing = false
      state.lastCheckTime = new Date()
      state.error = null
      emit()
    }
  } catch (err) {
    const message = err?.message || String(err)
    console.error('[SubscriptionService] Error checking Stripe:', message)
    state.error = message
    state.isRefreshing = false
    emit()
  }
}

// ---------------------------------------------------------------------------
// Firebase Update (Swift lines 272-291)
// ---------------------------------------------------------------------------

async function updateSubscriptionInFirebase(status, premiumEnabled) {
  const userEmail = auth.currentUser?.email || null
  if (!userEmail) {
    console.log('[SubscriptionService] Cannot update Firebase - not authenticated')
    return
  }
  const infoRef = doc(db, 'users', userEmail, 'Settings', 'info')
  // Monotonic write on overlordPremiumEnabled: only set when true, omit
  // otherwise. This prevents any path through this function from flipping
  // overlordPremiumEnabled back to false (e.g. a 'premium' tier upgrade that
  // would otherwise clobber an admin-granted premium flag).
  const payload = { forfeitSubscriptionStatus: status }
  if (premiumEnabled) payload.overlordPremiumEnabled = true
  try {
    await setDoc(
      infoRef,
      payload,
      { merge: true }
    )
    console.log(`[SubscriptionService] Updated Firebase - status: ${status}, premiumEnabled: ${premiumEnabled}`)
  } catch (err) {
    console.error('[SubscriptionService] Error updating Firebase:', err?.message || err)
  }
}

// ---------------------------------------------------------------------------
// External URL opening
// ---------------------------------------------------------------------------

function openExternalUrl(url) {
  if (!url) return
  const api = typeof window !== 'undefined' ? window.electronAPI : null
  if (api && typeof api.openExternal === 'function') {
    try {
      api.openExternal(url)
      return
    } catch (e) {
      console.warn('[SubscriptionService] openExternal failed, falling back:', e?.message)
    }
  }
  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open(url, '_blank')
  }
}

// ---------------------------------------------------------------------------
// Stripe Checkout (Swift lines 298-344)
// ---------------------------------------------------------------------------

async function initiateStripeCheckout(priceId) {
  if (!auth.currentUser) {
    state.error = 'Not authenticated'
    emit()
    console.log('[SubscriptionService] Cannot initiate checkout - not authenticated')
    return
  }

  state.isCheckingOut = true
  state.error = null
  emit()

  console.log('[SubscriptionService] Initiating Stripe checkout...')

  try {
    const callable = httpsCallable(functions, 'createStripeCheckoutSession')
    const result = await callable({ priceId: priceId || PRO_PRICE_ID })

    const data = result?.data
    const urlString = data && typeof data.url === 'string' ? data.url : null
    if (!urlString) {
      throw new Error('Invalid response from checkout')
    }

    console.log('[SubscriptionService] Opening Stripe checkout URL')
    state.isCheckingOut = false
    emit()
    openExternalUrl(urlString)

    // Start polling for subscription status.
    startCheckoutPolling()
  } catch (err) {
    const message = err?.message || String(err)
    console.error('[SubscriptionService] Checkout error:', message)
    state.error = message
    state.isCheckingOut = false
    emit()
  }
}

// ---------------------------------------------------------------------------
// Checkout Polling (Swift lines 350-394)
// ---------------------------------------------------------------------------

function startCheckoutPolling() {
  stopCheckoutPolling()

  console.log('[SubscriptionService] Starting checkout polling (every 20s for 5 minutes)')
  pollingEndTime = Date.now() + POLL_DURATION_MS

  pollingTimer = setInterval(() => {
    // Reached polling deadline.
    if (pollingEndTime !== null && Date.now() >= pollingEndTime) {
      console.log('[SubscriptionService] Checkout polling expired after 5 minutes')
      stopCheckoutPolling()
      return
    }

    // Already have a valid subscription - stop polling.
    if (hasValidSubscription()) {
      console.log('[SubscriptionService] Subscription detected, stopping polling')
      stopCheckoutPolling()
      return
    }

    console.log('[SubscriptionService] Polling: checking subscription status...')
    checkStripeSubscription()
  }, POLL_INTERVAL_MS)
}

function stopCheckoutPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
  pollingEndTime = null
  console.log('[SubscriptionService] Checkout polling stopped')
}

// ---------------------------------------------------------------------------
// Billing Portal (Swift lines 400-441)
// ---------------------------------------------------------------------------

async function openBillingPortal() {
  if (!auth.currentUser) {
    state.error = 'Not authenticated'
    emit()
    console.log('[SubscriptionService] Cannot open billing portal - not authenticated')
    return
  }

  state.isOpeningBillingPortal = true
  state.error = null
  emit()

  console.log('[SubscriptionService] Opening billing portal...')

  try {
    const callable = httpsCallable(functions, 'createStripeBillingPortal')
    const result = await callable({ returnUrl: 'https://overlord.app' })

    const data = result?.data
    const urlString = data && typeof data.url === 'string' ? data.url : null
    if (!urlString) {
      throw new Error('Invalid response from billing portal')
    }

    console.log('[SubscriptionService] Opening Stripe billing portal URL')
    state.isOpeningBillingPortal = false
    emit()
    openExternalUrl(urlString)
  } catch (err) {
    const message = err?.message || String(err)
    console.error('[SubscriptionService] Billing portal error:', message)
    state.error = message
    state.isOpeningBillingPortal = false
    emit()
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  // State access
  getState,
  subscribe,
  // Computed getters
  hasValidSubscription,
  canAccessChatFeatures,
  isSubscribed,
  getTier,
  // Lifecycle
  startListening,
  stopListening,
  // Actions
  checkStripeSubscription,
  initiateStripeCheckout,
  openBillingPortal,
  stopCheckoutPolling,
  // Constants (exported for any UI that needs to reference)
  PRO_PRICE_ID,
}
