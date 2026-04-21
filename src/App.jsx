import React, { useState, useEffect, useRef } from 'react'
import { MessageSquare, Shield, Settings, LogOut, Palette, BookOpen, Wrench, Activity, Sparkles } from 'lucide-react'
import AdminPanel from './panels/AdminPanel'
import SettingsPanel from './panels/SettingsPanel'
import ChatPane from './panels/ChatPane'
import BlockingPanel from './panels/BlockingPanel'
import HowItWorksPanel from './panels/HowItWorksPanel'
import UsagePanel from './panels/UsagePanel'
import OnboardingPanel from './panels/OnboardingPanel'
import UIMockup from './pages/UIMockup'
import LoginScreen from './components/LoginScreen'
import StatusBar from './components/StatusBar'
import {
  onAuthStateChanged,
  signOut,
  listenToWordList,
  saveWordList,
  listenToPersonality,
  listenToBlockingPreferences,
} from './services/firebaseService'
import { engine, score, wordList, persistence, remoteLogger, triggerCheckin, triggerBlocking } from './services'
import './styles/global.css'

const tabs = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'onboarding', label: 'Setup', icon: Sparkles },
  { id: 'blocking', label: 'Blocking', icon: Shield },
  { id: 'usage', label: 'Usage', icon: Activity },
  { id: 'howitworks', label: 'How It Works', icon: BookOpen },
  { id: 'mockup', label: 'Mockup', icon: Palette },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'admin', label: 'Admin', icon: Wrench },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('blocking')
  const [user, setUser] = useState(undefined) // undefined = loading, null = logged out
  const [macOnboardingComplete, setMacOnboardingComplete] = useState(null) // null = unknown
  // One-shot ref so we only auto-switch to 'onboarding' on the initial
  // resolution of the flag. After that, respect whatever tab the user picked.
  const autoOnboardingSwitchedRef = useRef(false)
  const unsubscribersRef = useRef([])

  // Auto-select the onboarding tab the first time we learn the user hasn't
  // completed setup. Stops users from landing on Blocking with no rules set.
  useEffect(() => {
    if (autoOnboardingSwitchedRef.current) return
    if (macOnboardingComplete === null) return  // still loading
    autoOnboardingSwitchedRef.current = true
    if (macOnboardingComplete === false) {
      setActiveTab('onboarding')
    }
  }, [macOnboardingComplete])

  // Auth state listener
  useEffect(() => {
    const unsub = onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser)
    })
    return unsub
  }, [])

  // Firestore listeners - start when user logs in, stop on logout
  useEffect(() => {
    // Clean up any previous listeners
    unsubscribersRef.current.forEach((fn) => fn())
    unsubscribersRef.current = []

    if (!user) return

    const email = user.email
    if (!email) return

    // Start remote logging
    remoteLogger.setUser(email)
    remoteLogger.start()
    remoteLogger.info('App started', { version: '0.1.0' })

    // Word list sync
    const unsubWords = listenToWordList(email, (words) => {
      wordList.loadWords(words)
    })

    // Personality settings sync
    const unsubPersonality = listenToPersonality(email, (personality) => {
      // Store on window for other components to read
      window.__overlordPersonality = personality
      setMacOnboardingComplete(!!personality?.macInstructionsSetupComplete)
    })

    // Blocking preferences sync
    const unsubPrefs = listenToBlockingPreferences(email, (prefs) => {
      window.__overlordBlockingPrefs = prefs
    })

    unsubscribersRef.current = [unsubWords, unsubPersonality, unsubPrefs]

    return () => {
      remoteLogger.stop()
      unsubscribersRef.current.forEach((fn) => fn())
      unsubscribersRef.current = []
    }
  }, [user])

  // Wire up Electron app monitor to decision engine
  useEffect(() => {
    if (!window.electronAPI?.onAppStatusUpdate) return

    const cleanup = window.electronAPI.onAppStatusUpdate((update) => {
      engine.processAppUpdate(update)
    })

    return cleanup
  }, [])

  // Passive score decay every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      score.applyPassiveDecay()
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  // Debug shortcut: trigger real check-in from main process
  useEffect(() => {
    if (!window.electronAPI?.onTriggerCheckin) return
    const cleanup = window.electronAPI.onTriggerCheckin(() => {
      console.log('[App] Debug shortcut - triggering real check-in')
      triggerCheckin()
    })
    return cleanup
  }, [])

  // Debug shortcut: trigger blocking overlay with real auth
  useEffect(() => {
    if (!window.electronAPI?.onTriggerBlocking) return
    const cleanup = window.electronAPI.onTriggerBlocking(() => {
      console.log('[App] Debug shortcut - triggering blocking overlay')
      triggerBlocking()
    })
    return cleanup
  }, [])

  // Authoritative signal: native overlay panel actually closed. Clears the
  // suppression flag no matter how the overlay was dismissed (user click,
  // grant, external kill, etc.) so the next block match can fire cleanly.
  useEffect(() => {
    if (!window.electronAPI?.onOverlayDismissed) return
    const cleanup = window.electronAPI.onOverlayDismissed((data) => {
      // 'countdown' is the tail of the block lifecycle (block -> countdown
      // -> gone). Its dismiss ends the session. 'blocking' alone fires only
      // if the block panel closed without a countdown transition.
      if (data?.type === 'blocking' || data?.type === 'countdown') {
        engine.markOverlayDismissed()
        console.log(`[App] Native overlay dismissed (${data.type}) - cleared suppression flag`)
      }
    })
    return cleanup
  }, [])

  // Listen for overlay actions forwarded from native overlay host
  useEffect(() => {
    if (!window.electronAPI?.onOverlayAction) return

    const cleanup = window.electronAPI.onOverlayAction((data) => {
      if (!data || !data.action) return

      switch (data.action) {
        case 'grant-allowance': {
          // Set unblock_until on the word entry (matching Swift's unblockUntil field)
          const minutes = data.minutes || 5
          const matchedWord = data.matchedWord || data.app
          wordList.setUnblockUntil(matchedWord, minutes)
          console.log(`[App] Set unblock_until on "${matchedWord}" for ${minutes}m`)
          // Clear the cooldown so a fresh overlay can fire the instant the
          // unblock window expires. Do NOT clear _overlayShownAt here - the
          // block panel is about to transition to a countdown panel and the
          // suppression needs to stay active across the handoff. The engine
          // flag is cleared by the authoritative onOverlayDismissed event
          // when the countdown panel eventually closes.
          engine.clearActiveBlock(matchedWord)
          // Persist to Firebase
          if (user?.email) {
            saveWordList(user.email, wordList.getWords()).catch(err =>
              console.error('[App] Failed to save unblock_until:', err)
            )
          }
          break
        }

        case 'dismissed':
          // Do not clear the engine flag here - the block panel is about to
          // transition to a countdown panel. The onOverlayDismissed event for
          // 'countdown' is the authoritative signal that clears suppression.
          break

        case 'snooze':
          score.snooze(data.minutes || 10, 'user_snooze')
          engine.resetUnknowns()
          console.log(`[App] Snoozed for ${data.minutes || 10} minutes`)
          break

        case 'add-word': {
          // Remove from any OTHER list first so moving between classifications works
          const existingOther = wordList.getWords().find(w =>
            w.word.toLowerCase() === data.word.toLowerCase() && w.list !== data.list
          )
          if (existingOther) wordList.removeWord(existingOther.word)

          // If a durationMinutes was provided with a block, attach a timed schedule
          // so the block auto-expires - matches the blocking panel's duration flow.
          let schedule = null
          if (data.list === 'blocked' && data.durationMinutes) {
            const end = new Date(Date.now() + data.durationMinutes * 60000)
            schedule = { end_date: end.toISOString().split('T')[0] }
          }

          wordList.addWord({
            word: data.word,
            list: data.list,
            score: data.score,
            addedBy: 'user',
            reason: 'From overlay',
            ...(schedule ? { schedule } : {}),
          })

          // Persist to Firebase so the change sticks across reloads
          if (user?.email) {
            saveWordList(user.email, wordList.getWords()).catch(err =>
              console.error('[App] Failed to save classified word:', err)
            )
          }
          console.log(`[App] Added "${data.word}" to ${data.list} list${data.durationMinutes ? ` (${data.durationMinutes}m)` : ''}`)
          break
        }

        default:
          console.log(`[App] Unknown overlay action: ${data.action}`)
      }
    })

    return cleanup
  }, [])

  // Local persistence - restore on mount, auto-save every 30s, save on unmount
  useEffect(() => {
    persistence.restore(score).then(() => {
      console.log('[App] Local state restored')
    })
    persistence.startAutoSave(score)

    return () => {
      persistence.save(score)
      persistence.stopAutoSave()
    }
  }, [])

  // Loading state
  if (user === undefined) {
    return (
      <div className="login-container">
        <div className="login-card">
          <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
        </div>
      </div>
    )
  }

  // Not logged in
  if (!user) {
    return <LoginScreen />
  }

  async function handleSignOut() {
    const confirmed = window.confirm('Sign out of Overlord?')
    if (!confirmed) return
    try {
      await signOut()
    } catch (err) {
      console.error('[App] Sign-out failed:', err)
    }
  }

  return (
    <div className="app-container">
      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-title">Overlord</span>
        </div>
        <div className="sidebar-nav">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`sidebar-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              style={{ position: 'relative' }}
            >
              <span style={{ position: 'relative', display: 'inline-flex' }}>
                <tab.icon size={18} />
                {tab.id === 'onboarding' && macOnboardingComplete === false && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -3,
                      right: -5,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#ef4444',
                      border: '2px solid var(--bg-primary)',
                      boxSizing: 'content-box',
                    }}
                    title="Mac onboarding not started"
                  />
                )}
              </span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-footer">
          <div className="sidebar-avatar" aria-hidden="true">
            {(user.email?.[0] || '?').toUpperCase()}
          </div>
          <div className="sidebar-user-meta">
            <span className="sidebar-user-label">Account</span>
            <span className="sidebar-email" title={user.email}>{user.email}</span>
          </div>
          <button className="sidebar-logout" onClick={handleSignOut} title="Sign out" aria-label="Sign out">
            <LogOut size={14} />
          </button>
        </div>
      </nav>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <StatusBar />
        {activeTab === 'chat' ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--background)' }}>
            <ChatPane />
          </div>
        ) : activeTab === 'onboarding' ? (
          // Onboarding reuses the o-agent MessageList/MessageBubble components
          // which require a flex container with overflow:hidden (they use
          // absolute positioning for scrolling). Same shell as chat above.
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--background)' }}>
            <OnboardingPanel />
          </div>
        ) : (
          <main className="main-content">
            {activeTab === 'blocking' && <BlockingPanel />}
            {activeTab === 'usage' && <UsagePanel />}
            {activeTab === 'howitworks' && <HowItWorksPanel />}
            {activeTab === 'mockup' && <UIMockup />}
            {activeTab === 'settings' && <SettingsPanel />}
            {activeTab === 'admin' && <AdminPanel />}
          </main>
        )}
      </div>
    </div>
  )
}
