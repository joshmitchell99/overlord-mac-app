import React, { useState, useEffect } from 'react'
import {
  Play,
  AlertTriangle,
  Gauge,
  RotateCcw,
  Trash2,
  Settings,
  Edit3,
  Save,
  Monitor,
} from 'lucide-react'
import BlockingOverlay from '../overlays/BlockingOverlay'
import CheckinOverlay from '../overlays/CheckinOverlay'
import { score, engine, wordList, extremeMode } from '../services'
import { saveWordList, saveMacInstructions, setMacOnboardingComplete, auth, db } from '../services/firebaseService'
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore'
import { Server } from 'lucide-react'

const mockBlockingData = {
  appName: 'Reddit',
  windowTitle: 'r/programming - The best of programming',
  reasoning: 'Reddit is on your blocked list and is distracting you from your work goal.',
  url: 'https://reddit.com/r/programming',
  goalId: 'goal_test123',
  goalDescription: 'Stay focused on work tasks during work hours',
  timeRemaining: '2h 30m remaining',
  typeToUnblockEnabled: true,
  matchedWord: 'reddit',
}

const mockCheckinData = {
  appSummary:
    '- Reddit (score: 7/10)\n- YouTube (score: 6/10)\n- VS Code (score: 2/10)\n- Slack (score: 3/10)\n- Twitter (score: 8/10)',
  overlordResponse:
    "I notice you've been spending quite a bit of time on Reddit and Twitter. You mentioned wanting to stay focused on your coding project today. Would you like to get back on track?",
  actions: [
    { type: 'block', label: 'Block Reddit', app: 'Reddit' },
    { type: 'block', label: 'Block Twitter', app: 'Twitter' },
    { type: 'mark_productive', label: 'VS Code is productive', app: 'VS Code' },
    { type: 'snooze', label: 'Snooze for 10 min', minutes: 10 },
    { type: 'dismiss', label: "I'm fine, dismiss" },
  ],
}

const mockApps = [
  { name: 'Reddit', list: 'blocked', score: 7 },
  { name: 'VS Code', list: 'productive', score: 2 },
  { name: 'YouTube', list: 'distracting', score: 6 },
  { name: 'Slack', list: 'productive', score: 3 },
  { name: 'Twitter', list: 'blocked', score: 8 },
  { name: 'Figma', list: 'productive', score: 1 },
]

function listBadgeColor(list) {
  if (list === 'blocked') return { background: 'rgba(239,68,68,0.15)', color: '#ef4444' }
  if (list === 'distracting') return { background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }
  return { background: 'rgba(34,197,94,0.15)', color: '#22c55e' }
}

function scoreColor(val) {
  if (val <= 2) return '#22c55e'
  if (val <= 4) return '#f59e0b'
  if (val <= 6) return '#f97316'
  return '#ef4444'
}

export default function AdminPanel() {
  const isBrowser = !window.electronAPI
  const [debugStatus, setDebugStatus] = useState('')
  const [inlineOverlay, setInlineOverlay] = useState(null)

  // Mac Instructions
  const [macInstructions, setMacInstructions] = useState(
    'Block social media during work hours 9am-5pm. Allow VS Code, Terminal, Figma. Be strict with YouTube and Reddit.'
  )
  const [editingMac, setEditingMac] = useState(false)
  const [macDraft, setMacDraft] = useState(macInstructions)

  // Onboarding
  const [onboardingMsg, setOnboardingMsg] = useState(
    '[SYSTEM] The user has just connected their Mac app. They are ready to start using screen monitoring and blocking features. Initialize their session and confirm the connection is active.'
  )
  const [editingOnboarding, setEditingOnboarding] = useState(false)
  const [onboardingDraft, setOnboardingDraft] = useState(onboardingMsg)

  // Live score state - refreshes from service every second
  const [scoreState, setScoreState] = useState(() => score?.getState() ?? {
    currentScore: 25,
    distractingRate: 0.03,
    unknownRate: 0.04,
    productiveDecayRate: 0.1,
    passiveDecayRate: 0.1,
    threshold: 50,
  })
  const [activePreset, setActivePreset] = useState('default')

  // Recent apps from engine
  const [recentApps, setRecentApps] = useState([])

  // Word list stats
  const [wlStats, setWlStats] = useState(() => wordList?.stats() ?? { blocked: 0, distracting: 0, productive: 0, total: 0 })

  // Refresh display every second
  useEffect(() => {
    const interval = setInterval(() => {
      if (score) {
        setScoreState(score.getState())
      }
      if (engine) {
        const apps = engine.getRecentApps()
        if (apps.length > 0) {
          setRecentApps(apps.map((a) => ({
            name: a.app,
            list: a.classification,
            score: a.score,
          })))
        }
      }
      if (wordList) {
        setWlStats(wordList.stats())
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Displayed apps: real data if available, mock fallback
  const displayApps = recentApps.length > 0 ? recentApps : mockApps

  // Reset
  const [resetExpanded, setResetExpanded] = useState(false)
  const [resetChecks, setResetChecks] = useState({
    wordList: true,
    macInstructions: true,
    onboardingFlag: true,
    reassessmentScore: true,
  })
  const [resetSuccess, setResetSuccess] = useState(false)

  // Extreme mode
  const [extremeModeOn, setExtremeModeOn] = useState(false)

  // Server toggle (ngrok local vs Railway production)
  const [ngrokEnabled, setNgrokEnabled] = useState(false)
  const [ngrokLoading, setNgrokLoading] = useState(false)

  useEffect(() => {
    if (extremeMode) {
      extremeMode.checkStatus().then(() => {
        setExtremeModeOn(extremeMode.getState().isEnabled)
      })
    }
  }, [])

  async function toggleExtremeMode() {
    if (!extremeMode) return
    if (extremeModeOn) {
      await extremeMode.disable()
    } else {
      await extremeMode.enable()
    }
    setExtremeModeOn(extremeMode.getState().isEnabled)
  }

  // Listen to OverlordSettings.ngrok flag for the server toggle
  useEffect(() => {
    const email = auth.currentUser?.email
    if (!email) return
    const ref = doc(db, 'users', email, 'Settings', 'OverlordSettings')
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.exists() ? snap.data() : {}
      const raw = data?.ngrok
      setNgrokEnabled(raw === true || raw === 'true' || raw === 'True')
    })
    return () => unsub()
  }, [])

  async function toggleNgrok() {
    const email = auth.currentUser?.email
    if (!email || ngrokLoading) return
    setNgrokLoading(true)
    try {
      const ref = doc(db, 'users', email, 'Settings', 'OverlordSettings')
      await setDoc(ref, { ngrok: !ngrokEnabled }, { merge: true })
      // Invalidate the server URL cache so the next reassessment fetch picks up the new setting
      const { invalidateServerUrlCache } = await import('../services/serverUrl')
      invalidateServerUrlCache()
    } catch (err) {
      console.error('[admin] Failed to toggle ngrok:', err)
    } finally {
      setNgrokLoading(false)
    }
  }

  // Presets config (service uses lowercase keys)
  const presetNames = [
    { key: 'relaxed', label: 'Relaxed' },
    { key: 'default', label: 'Default' },
    { key: 'strict', label: 'Strict' },
    { key: 'aggressive', label: 'Aggressive' },
  ]

  // -- Handlers --

  function handleShowBlocking() {
    if (isBrowser) {
      setInlineOverlay('blocking')
      setDebugStatus('[browser] Showing blocking overlay inline')
    } else {
      window.electronAPI.showBlockingOverlay(mockBlockingData)
      setDebugStatus('[electron] showBlockingOverlay called at ' + new Date().toLocaleTimeString())
    }
  }

  function handleShowCheckin() {
    if (isBrowser) {
      setInlineOverlay('checkin')
      setDebugStatus('[browser] Showing check-in overlay inline')
    } else {
      window.electronAPI.showCheckinOverlay(mockCheckinData)
      setDebugStatus('[electron] showCheckinOverlay called at ' + new Date().toLocaleTimeString())
    }
  }

  function handleSliderChange(key, value) {
    const parsed = parseFloat(value)
    if (score) {
      score[key] = parsed
      setScoreState(score.getState())
    }
    setActivePreset(null)
  }

  function handlePreset(name) {
    if (score) {
      score.applyPreset(name)
      setScoreState(score.getState())
    }
    setActivePreset(name)
  }

  async function handleResetSelected() {
    const selected = Object.entries(resetChecks)
      .filter(([, v]) => v)
      .map(([k]) => k)
    if (selected.length === 0) return

    const email = auth.currentUser?.email
    const errors = []
    const cleared = []

    // Word list - clear locally and in Firebase
    if (selected.includes('wordList')) {
      try {
        if (wordList) wordList.clear()
        if (email) await saveWordList(email, [])
        cleared.push('wordList')
      } catch (e) {
        errors.push(`wordList: ${e.message}`)
      }
    }

    // Mac instructions - clear in Firebase
    if (selected.includes('macInstructions')) {
      try {
        if (!email) throw new Error('not signed in')
        await saveMacInstructions(email, '')
        if (window.__overlordPersonality) window.__overlordPersonality.macInstructions = ''
        cleared.push('macInstructions')
      } catch (e) {
        errors.push(`macInstructions: ${e.message}`)
      }
    }

    // Onboarding flag - reset Mac onboarding complete flag in Firebase + local store
    if (selected.includes('onboardingFlag')) {
      try {
        if (!email) throw new Error('not signed in')
        await setMacOnboardingComplete(email, false)
        // Also clear any local "first-launch" flag if one exists
        if (window.electronAPI?.storeSet) {
          await window.electronAPI.storeSet('hasCompletedOnboarding', false)
        }
        try { localStorage.removeItem('hasCompletedOnboarding') } catch {}
        cleared.push('onboardingFlag')
      } catch (e) {
        errors.push(`onboardingFlag: ${e.message}`)
      }
    }

    // Reassessment score - local reset
    if (selected.includes('reassessmentScore')) {
      try {
        if (score) {
          score.reset('admin_manual')
          setScoreState(score.getState())
        }
        cleared.push('reassessmentScore')
      } catch (e) {
        errors.push(`reassessmentScore: ${e.message}`)
      }
    }

    const status = errors.length
      ? `[reset] Cleared: ${cleared.join(', ') || 'none'} | errors: ${errors.join('; ')}`
      : `[reset] Cleared: ${cleared.join(', ')}`
    console.log(status)
    setDebugStatus(status)
    setResetSuccess(errors.length === 0)
    setResetChecks({ wordList: true, macInstructions: true, onboardingFlag: true, reassessmentScore: true })
    setTimeout(() => setResetSuccess(false), 3000)
  }

  // -- Render --

  return (
    <div style={{ maxWidth: 640 }}>
      {/* ===== 1. TEST TRIGGERS ===== */}
      <div className="section">
        <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Play size={16} /> Test Triggers
        </div>
        <div className="card">
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button className="btn btn-warning" onClick={handleShowBlocking}>
              <Monitor size={14} /> Show Blocking Overlay
            </button>
            <button className="btn btn-warning" onClick={handleShowCheckin}>
              <AlertTriangle size={14} /> Show Check-in Overlay
            </button>
          </div>
          {isBrowser && (
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>
              Running in browser mode - overlays shown inline below
            </div>
          )}
          {debugStatus && <div className="debug-box">{debugStatus}</div>}
        </div>
      </div>

      {/* Inline overlay previews (browser mode) */}
      {isBrowser && inlineOverlay === 'blocking' && (
        <BlockingOverlay data={mockBlockingData} onDismiss={() => setInlineOverlay(null)} />
      )}

      {isBrowser && inlineOverlay === 'checkin' && (
        <CheckinOverlay data={mockCheckinData} onDismiss={() => setInlineOverlay(null)} />
      )}

      <div className="divider" />

      {/* ===== SERVER ===== */}
      <div className="section">
        <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Server size={16} /> Server
        </div>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Use local server (ngrok)</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                {ngrokEnabled
                  ? 'Hitting wss://overlord.ngrok.app - your local Python server'
                  : 'Hitting wss://overlordserver.up.railway.app - production Railway'}
              </div>
            </div>
            <button
              className={`btn ${ngrokEnabled ? 'btn-warning' : 'btn-ghost'}`}
              onClick={toggleNgrok}
              disabled={ngrokLoading}
            >
              {ngrokLoading ? '...' : ngrokEnabled ? 'ngrok' : 'railway'}
            </button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>
            Requires chat reconnect to take effect. Close and reopen the chat after toggling.
          </p>
        </div>
      </div>

      <div className="divider" />

      {/* ===== EXTREME MODE ===== */}
      <div className="section">
        <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} /> Extreme Mode
        </div>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13 }}>Prevent app from being quit</span>
            <button
              className={`btn ${extremeModeOn ? 'btn-danger' : 'btn-ghost'}`}
              onClick={toggleExtremeMode}
            >
              {extremeModeOn ? 'Enabled' : 'Disabled'}
            </button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>
            Installs a LaunchAgent that restarts the app if force-quit. Cannot be bypassed without terminal access.
          </p>
        </div>
      </div>

      <div className="divider" />

      {/* ===== 2. MAC INSTRUCTIONS ===== */}
      <div className="section">
        <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Settings size={16} /> Mac Instructions
        </div>
        <div className="card">
          {editingMac ? (
            <>
              <textarea
                className="textarea"
                value={macDraft}
                onChange={(e) => setMacDraft(e.target.value)}
                rows={4}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setMacInstructions(macDraft)
                    setEditingMac(false)
                  }}
                >
                  <Save size={14} /> Save
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setMacDraft(macInstructions)
                    setEditingMac(false)
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                {macInstructions}
              </div>
              <button
                className="btn btn-ghost"
                style={{ marginTop: 8 }}
                onClick={() => {
                  setMacDraft(macInstructions)
                  setEditingMac(true)
                }}
              >
                <Edit3 size={14} /> Edit
              </button>
            </>
          )}
        </div>
      </div>

      {/* ===== 3. ONBOARDING SYSTEM MESSAGE ===== */}
      <div className="section">
        <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Settings size={16} /> Onboarding System Message
        </div>
        <div className="card">
          {editingOnboarding ? (
            <>
              <textarea
                className="textarea"
                value={onboardingDraft}
                onChange={(e) => setOnboardingDraft(e.target.value)}
                rows={4}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setOnboardingMsg(onboardingDraft)
                    setEditingOnboarding(false)
                  }}
                >
                  <Save size={14} /> Save
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setOnboardingDraft(onboardingMsg)
                    setEditingOnboarding(false)
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                {onboardingMsg}
              </div>
              <button
                className="btn btn-ghost"
                style={{ marginTop: 8 }}
                onClick={() => {
                  setOnboardingDraft(onboardingMsg)
                  setEditingOnboarding(true)
                }}
              >
                <Edit3 size={14} /> Edit
              </button>
            </>
          )}
        </div>
      </div>

      <div className="divider" />

      {/* ===== 4. SCORE EQUATION ===== */}
      <div className="section">
        <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Gauge size={16} /> Score Equation
        </div>
        <div className="card">
          {/* Current score */}
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              marginBottom: 16,
              color: scoreState.currentScore >= scoreState.threshold ? '#ef4444' : 'var(--text-primary)',
            }}
          >
            Score: {Math.round(scoreState.currentScore)}/{scoreState.threshold}
          </div>

          {/* Equation rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, fontSize: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316', flexShrink: 0 }} />
              <span style={{ minWidth: 90 }}>Distracting</span>
              <code style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                score * {scoreState.distractingRate} * elapsed
              </code>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
              <span style={{ minWidth: 90 }}>Unknown</span>
              <code style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                score * {scoreState.unknownRate} * elapsed
              </code>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
              <span style={{ minWidth: 90 }}>Productive</span>
              <code style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                -{scoreState.productiveDecayRate} * elapsed
              </code>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />
              <span style={{ minWidth: 90 }}>Passive decay</span>
              <code style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                -{scoreState.passiveDecayRate} * 30s tick
              </code>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
              <span style={{ minWidth: 90 }}>Threshold</span>
              <code style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{scoreState.threshold}</code>
            </div>
          </div>

          {/* Preset buttons */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {presetNames.map(({ key, label }) => (
              <button
                key={key}
                className={activePreset === key ? 'btn btn-primary' : 'btn btn-ghost'}
                style={{ fontSize: 12 }}
                onClick={() => handlePreset(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Sliders */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="slider-row">
              <label>Distracting rate</label>
              <input
                type="range"
                min="0.01"
                max="0.2"
                step="0.005"
                value={scoreState.distractingRate}
                onChange={(e) => handleSliderChange('distractingRate', e.target.value)}
              />
              <span className="slider-value">{scoreState.distractingRate.toFixed(3)}</span>
            </div>
            <div className="slider-row">
              <label>Unknown rate</label>
              <input
                type="range"
                min="0.01"
                max="0.2"
                step="0.005"
                value={scoreState.unknownRate}
                onChange={(e) => handleSliderChange('unknownRate', e.target.value)}
              />
              <span className="slider-value">{scoreState.unknownRate.toFixed(3)}</span>
            </div>
            <div className="slider-row">
              <label>Productive decay</label>
              <input
                type="range"
                min="0.01"
                max="0.3"
                step="0.005"
                value={scoreState.productiveDecayRate}
                onChange={(e) => handleSliderChange('productiveDecayRate', e.target.value)}
              />
              <span className="slider-value">{scoreState.productiveDecayRate.toFixed(3)}</span>
            </div>
            <div className="slider-row">
              <label>Passive decay</label>
              <input
                type="range"
                min="0.01"
                max="0.3"
                step="0.005"
                value={scoreState.passiveDecayRate}
                onChange={(e) => handleSliderChange('passiveDecayRate', e.target.value)}
              />
              <span className="slider-value">{scoreState.passiveDecayRate.toFixed(3)}</span>
            </div>
            <div className="slider-row">
              <label>Threshold</label>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={scoreState.threshold}
                onChange={(e) => handleSliderChange('threshold', e.target.value)}
              />
              <span className="slider-value">{scoreState.threshold}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="divider" />

      {/* ===== 5. RECENT APPS ===== */}
      <div className="section">
        <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Monitor size={16} /> Recent Apps
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 400 }}>
            ({displayApps.length})
          </span>
        </div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-header">
            <span style={{ flex: 1 }}>App</span>
            <span style={{ width: 80, textAlign: 'center' }}>List</span>
            <span style={{ width: 50, textAlign: 'right' }}>Score</span>
          </div>
          {displayApps.map((app, i) => {
            const badgeStyle = listBadgeColor(app.list)
            return (
              <div className="table-row" key={i}>
                <span style={{ flex: 1, fontSize: 13 }}>{app.name}</span>
                <span style={{ width: 80, textAlign: 'center' }}>
                  <span className="badge" style={badgeStyle}>
                    {app.list}
                  </span>
                </span>
                <span
                  style={{
                    width: 50,
                    textAlign: 'right',
                    fontWeight: 600,
                    fontSize: 13,
                    color: scoreColor(app.score),
                  }}
                >
                  {app.score}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="divider" />

      {/* ===== 6. WORD LIST STATS ===== */}
      <div className="section">
        <div className="section-title">Word List Stats</div>
        <div className="stats-row">
          <div className="stat-box" style={{ background: 'rgba(239,68,68,0.1)' }}>
            <div className="stat-value" style={{ color: '#ef4444' }}>{wlStats.blocked}</div>
            <div className="stat-label">Blocked</div>
          </div>
          <div className="stat-box" style={{ background: 'rgba(245,158,11,0.1)' }}>
            <div className="stat-value" style={{ color: '#f59e0b' }}>{wlStats.distracting}</div>
            <div className="stat-label">Distracting</div>
          </div>
          <div className="stat-box" style={{ background: 'rgba(34,197,94,0.1)' }}>
            <div className="stat-value" style={{ color: '#22c55e' }}>{wlStats.productive}</div>
            <div className="stat-label">Productive</div>
          </div>
          <div className="stat-box" style={{ background: 'var(--bg-tertiary)' }}>
            <div className="stat-value">{wlStats.total}</div>
            <div className="stat-label">Total</div>
          </div>
        </div>
      </div>

      <div className="divider" />

      {/* ===== 7. RESET SECTION ===== */}
      <div className="section">
        {!resetExpanded ? (
          <button className="btn btn-danger" onClick={() => setResetExpanded(true)}>
            <Trash2 size={14} /> Reset Everything...
          </button>
        ) : (
          <div className="card" style={{ border: '1px solid var(--danger)' }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: '#ef4444' }}>
              <AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
              Select items to reset
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {[
                { key: 'wordList', label: 'Word list' },
                { key: 'macInstructions', label: 'Mac instructions' },
                { key: 'onboardingFlag', label: 'Onboarding flag' },
                { key: 'reassessmentScore', label: 'Reassessment score' },
              ].map(({ key, label }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={resetChecks[key]}
                    onChange={(e) => setResetChecks((prev) => ({ ...prev, [key]: e.target.checked }))}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-danger"
                disabled={!Object.values(resetChecks).some(Boolean)}
                onClick={handleResetSelected}
              >
                <RotateCcw size={14} /> Reset Selected
              </button>
              <button className="btn btn-ghost" onClick={() => setResetExpanded(false)}>
                Cancel
              </button>
            </div>
            {resetSuccess && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#22c55e', fontWeight: 500 }}>
                Reset successful.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
