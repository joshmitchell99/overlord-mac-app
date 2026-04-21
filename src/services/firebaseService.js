/**
 * Firebase initialization, authentication, and Firestore sync.
 * Matches the Swift Mac app's Firestore schema exactly.
 */

import { initializeApp } from 'firebase/app'
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
} from 'firebase/auth'
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyDG4R5El_CbAsIJ_nbah5LCypvFXjSO3BE",
  authDomain: "forfeit-58b5d.firebaseapp.com",
  projectId: "forfeit-58b5d",
  storageBucket: "forfeit-58b5d.appspot.com",
  messagingSenderId: "790061375448",
  appId: "1:790061375448:web:f3e16d1ba48ff71b21dcad",
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const googleProvider = new GoogleAuthProvider()

async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider)
  return result.user
}

async function signInWithApple() {
  const provider = new OAuthProvider('apple.com')
  provider.addScope('email')
  provider.addScope('name')
  const result = await signInWithPopup(auth, provider)
  return result.user
}

async function signInWithEmail(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password)
  return result.user
}

async function createAccountWithEmail(email, password) {
  const result = await createUserWithEmailAndPassword(auth, email, password)
  return result.user
}

async function sendPasswordReset(email) {
  await sendPasswordResetEmail(auth, email)
}

async function signOut() {
  await firebaseSignOut(auth)
}

function onAuthStateChanged(callback) {
  return firebaseOnAuthStateChanged(auth, callback)
}

function getCurrentUser() {
  return auth.currentUser || null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise legacy list values from older Firestore docs */
function normaliseList(raw) {
  if (raw === 'unproductive') return 'blocked'
  if (raw === 'unknown') return 'distracting'
  if (['blocked', 'distracting', 'productive'].includes(raw)) return raw
  return 'distracting'
}

/** Parse a single word object from Firestore into the local shape */
function parseWordEntry(raw) {
  return {
    word: raw.word || '',
    score: typeof raw.score === 'number' ? raw.score : 5,
    list: normaliseList(raw.list),
    added_by: raw.added_by || raw.addedBy || 'user',
    reason: raw.reason || '',
    associated_words: Array.isArray(raw.associated_words) ? raw.associated_words : [],
    unblock_until: raw.unblock_until || null,
    schedule: raw.schedule || null,
  }
}

// ---------------------------------------------------------------------------
// Firestore Sync - Word Lists
// Path: users/{email}/Settings/MacBlocking
// ---------------------------------------------------------------------------

function listenToWordList(email, onUpdate) {
  const ref = doc(db, 'users', email, 'Settings', 'MacBlocking')
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      onUpdate([])
      return
    }
    const data = snap.data()
    const rawWords = Array.isArray(data.words) ? data.words : []
    const parsed = rawWords.map(parseWordEntry)
    onUpdate(parsed)
  })
}

async function saveWordList(email, words) {
  const ref = doc(db, 'users', email, 'Settings', 'MacBlocking')
  await setDoc(ref, { words, updatedAt: serverTimestamp() }, { merge: true })
}

// ---------------------------------------------------------------------------
// Firestore Sync - Personality / Mac Instructions
// Path: users/{email}/Settings/OverlordPersonality/Personalities/default
// ---------------------------------------------------------------------------

function listenToPersonality(email, onUpdate) {
  // macInstructions lives on personality/default.
  // The Mac onboarding flag lives on OverlordSettings.macOnboardingCompleted
  // (written by the server tool complete_mac_onboarding). Personality does not
  // own this flag.
  const personalityRef = doc(db, 'users', email, 'Settings', 'OverlordPersonality', 'Personalities', 'default')
  const overlordSettingsRef = doc(db, 'users', email, 'Settings', 'OverlordSettings')

  let macInstructions = ''
  let onboardingFlag = false

  const emit = () => {
    onUpdate({
      macInstructions,
      macInstructionsSetupComplete: onboardingFlag,
    })
  }

  const unsubPersonality = onSnapshot(personalityRef, (snap) => {
    macInstructions = snap.exists() ? (snap.data()?.macInstructions || '') : ''
    emit()
  })

  const unsubOverlord = onSnapshot(overlordSettingsRef, (snap) => {
    onboardingFlag = snap.exists() ? !!snap.data()?.macOnboardingCompleted : false
    emit()
  })

  return () => {
    unsubPersonality()
    unsubOverlord()
  }
}

async function saveMacInstructions(email, text) {
  const ref = doc(db, 'users', email, 'Settings', 'OverlordPersonality', 'Personalities', 'default')
  await setDoc(ref, { macInstructions: text }, { merge: true })
}

async function setMacOnboardingComplete(email, complete) {
  const ref = doc(db, 'users', email, 'Settings', 'OverlordSettings')
  await setDoc(ref, { macOnboardingCompleted: complete }, { merge: true })
}

// ---------------------------------------------------------------------------
// Firestore Sync - AI Blocking Preferences
// Path: users/{email}/Settings/AIBlockingPreferences
// ---------------------------------------------------------------------------

function listenToBlockingPreferences(email, onUpdate) {
  const ref = doc(db, 'users', email, 'Settings', 'AIBlockingPreferences')
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      onUpdate(null)
      return
    }
    onUpdate(snap.data())
  })
}

async function saveBlockingPreferences(email, prefs) {
  const ref = doc(db, 'users', email, 'Settings', 'AIBlockingPreferences')
  await setDoc(ref, { ...prefs, updatedAt: serverTimestamp() }, { merge: true })
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  auth,
  db,
  signInWithGoogle,
  signInWithApple,
  signInWithEmail,
  createAccountWithEmail,
  sendPasswordReset,
  signOut,
  onAuthStateChanged,
  getCurrentUser,
  listenToWordList,
  saveWordList,
  listenToPersonality,
  saveMacInstructions,
  setMacOnboardingComplete,
  listenToBlockingPreferences,
  saveBlockingPreferences,
}
