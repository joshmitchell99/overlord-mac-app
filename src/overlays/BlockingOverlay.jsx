import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Shield, Clock, X, Lock, Check, Ban,
  ShieldCheck, MessageCircle, XCircle, Send
} from 'lucide-react'
import MessageBubble from '../chat/MessageBubble'
import ChatInput from '../chat/ChatInput'
import OverlordChatWidget from '../components/OverlordChatWidget'
import { streamSSE } from '../lib/streamFetch'

// ~200 common English words for friction typing challenge
const WORD_POOL = [
  'focus', 'effort', 'discipline', 'morning', 'coffee', 'laptop', 'window', 'garden',
  'sunset', 'bridge', 'river', 'mountain', 'forest', 'planet', 'ocean', 'desert',
  'village', 'castle', 'tower', 'pillow', 'blanket', 'candle', 'mirror', 'silver',
  'golden', 'purple', 'orange', 'breeze', 'thunder', 'shadow', 'meadow', 'valley',
  'stream', 'pebble', 'falcon', 'rabbit', 'turtle', 'dolphin', 'parrot', 'kitten',
  'basket', 'hammer', 'pencil', 'fabric', 'marble', 'copper', 'velvet', 'cotton',
  'branch', 'feather', 'whistle', 'ladder', 'tunnel', 'harbor', 'anchor', 'voyage',
  'island', 'canyon', 'glacier', 'beacon', 'lantern', 'shelter', 'garden', 'flower',
  'blossom', 'orchid', 'jasmine', 'willow', 'bamboo', 'cedar', 'maple', 'birch',
  'acorn', 'coral', 'oyster', 'clover', 'daisy', 'violet', 'scarlet', 'amber',
  'ivory', 'cobalt', 'indigo', 'tango', 'waltz', 'piano', 'guitar', 'violin',
  'rhythm', 'melody', 'chorus', 'poetry', 'canvas', 'sketch', 'mosaic', 'prism',
  'crystal', 'quartz', 'opal', 'ruby', 'pearl', 'topaz', 'garnet', 'emerald',
  'summit', 'plateau', 'crater', 'dune', 'cavern', 'rapids', 'marsh', 'delta',
  'frost', 'ember', 'spark', 'flame', 'blaze', 'comet', 'nebula', 'orbit',
  'zenith', 'apex', 'crest', 'ridge', 'bluff', 'grove', 'thicket', 'pasture',
  'meadow', 'steppe', 'tundra', 'savanna', 'lagoon', 'inlet', 'fjord', 'strait',
  'lumber', 'timber', 'plank', 'mortar', 'chisel', 'anvil', 'forge', 'crucible',
  'latch', 'hinge', 'lever', 'pulley', 'wedge', 'axle', 'bolt', 'rivet',
  'tablet', 'scroll', 'quill', 'cipher', 'riddle', 'legend', 'fable', 'ballad',
  'goblet', 'chalice', 'scepter', 'crown', 'shield', 'armor', 'banner', 'crest',
  'falcon', 'raven', 'crane', 'heron', 'osprey', 'condor', 'eagle', 'hawk',
  'summit', 'venture', 'journey', 'quest', 'voyage', 'stride', 'sprint', 'dash',
  'resolve', 'spirit', 'vigor', 'grit', 'valor', 'grace', 'honor', 'merit',
  'craft', 'skill', 'talent', 'flair', 'knack', 'depth', 'scope', 'range'
]

const BROWSER_APPS = ['google chrome', 'safari', 'arc', 'firefox', 'microsoft edge', 'brave browser', 'brave', 'chrome', 'edge']

const DURATION_OPTIONS = [
  { label: '5 min', minutes: 5 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
  { label: 'Rest of day', minutes: 480 },
]

const DEFAULT_DATA = {
  appName: 'Reddit',
  windowTitle: 'r/programming - pair programming tips',
  reasoning: 'Reddit is on your blocked list.',
  url: 'https://reddit.com/r/programming',
  goalId: 'goal_test123',
  goalDescription: 'Stay focused on work tasks',
  timeRemaining: '2h 30m remaining',
  typeToUnblockEnabled: true,
  matchedWord: 'reddit',
}

function generateRandomWords(count) {
  const words = []
  const pool = [...WORD_POOL]
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * pool.length)
    words.push(pool[idx])
  }
  return words
}

function extractDomain(url) {
  try {
    const hostname = new URL(url).hostname
    return hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

function parseData(props) {
  try {
    const hashParts = window.location.hash.split('?')
    if (hashParts[1]) {
      const params = new URLSearchParams(hashParts[1])
      const raw = params.get('data')
      if (raw) {
        return { ...DEFAULT_DATA, ...JSON.parse(decodeURIComponent(raw)) }
      }
    }
  } catch (e) {
    console.warn('Failed to parse URL data:', e)
  }

  if (props && Object.keys(props).length > 0) {
    const { onDismiss, ...rest } = props
    if (Object.keys(rest).length > 0) {
      return { ...DEFAULT_DATA, ...rest }
    }
  }

  return DEFAULT_DATA
}

// Logarithmic slider helper: maps 0-1 to min-max on log scale
function logSliderToValue(position, min, max) {
  const minLog = Math.log(min)
  const maxLog = Math.log(max)
  return Math.round(Math.exp(minLog + position * (maxLog - minLog)))
}

function valueToLogSlider(value, min, max) {
  const minLog = Math.log(min)
  const maxLog = Math.log(max)
  return (Math.log(value) - minLog) / (maxLog - minLog)
}

// Format a schedule object into a human-readable string like "Weekdays 9am-5pm"
function formatSchedule(schedule) {
  if (!schedule) return null
  const parts = []

  // Days
  if (schedule.days && schedule.days.length > 0) {
    const wkdy = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
    const wknd = ['Sat', 'Sun']
    const all = [...wkdy, ...wknd]
    const isAllWeekdays = wkdy.every(d => schedule.days.includes(d)) && schedule.days.length === 5
    const isAllWeekends = wknd.every(d => schedule.days.includes(d)) && schedule.days.length === 2
    const isEveryDay = all.every(d => schedule.days.includes(d))
    if (isEveryDay) parts.push('Every day')
    else if (isAllWeekdays) parts.push('Weekdays')
    else if (isAllWeekends) parts.push('Weekends')
    else parts.push(schedule.days.join(', '))
  }

  // Time range
  if (schedule.startTime || schedule.start_time) {
    const start = formatTime12h(schedule.startTime || schedule.start_time)
    const end = formatTime12h(schedule.endTime || schedule.end_time)
    if (start && end) parts.push(`${start}-${end}`)
    else if (start) parts.push(`from ${start}`)
  }

  // End date
  if (schedule.endDate || schedule.end_date) {
    const until = new Date(schedule.endDate || schedule.end_date)
    if (!isNaN(until.getTime())) {
      parts.push(`until ${until.toLocaleDateString([], { month: 'short', day: 'numeric' })}`)
    }
  }

  return parts.length > 0 ? parts.join(' ') : null
}

function formatTime12h(hhmm) {
  if (!hhmm) return null
  const [h, m] = hhmm.split(':').map(Number)
  if (isNaN(h)) return null
  const period = h >= 12 ? 'pm' : 'am'
  const hour12 = h % 12 || 12
  return m ? `${hour12}:${String(m).padStart(2, '0')}${period}` : `${hour12}${period}`
}

function formatTimerLabel(seconds) {
  if (seconds < 60) return `${seconds} sec`
  if (seconds < 3600) {
    const mins = Math.round(seconds / 60)
    return mins === 1 ? '1 min' : `${mins} min`
  }
  const hours = Math.floor(seconds / 3600)
  const mins = Math.round((seconds % 3600) / 60)
  if (mins === 0) return hours === 1 ? '1 hour' : `${hours} hours`
  return `${hours}h ${mins}m`
}

export default function BlockingOverlay(props) {
  const data = useMemo(() => parseData(props), [])

  // Force body/html transparent + dark mode so text is visible on the dark overlay
  useEffect(() => {
    const prev = {
      body: document.body.style.background,
      html: document.documentElement.style.background,
    }
    document.body.style.background = 'transparent'
    document.documentElement.style.background = 'transparent'

    // Force dark theme variables on the overlay so MessageBubble / ActionCard
    // inherited styles render for dark mode.
    const style = document.createElement('style')
    style.id = 'overlay-dark-vars'
    style.textContent = `
      :root {
        --background: transparent;
        --foreground: #ffffff;
        --muted: rgba(255,255,255,0.08);
        --muted-foreground: rgba(255,255,255,0.6);
        --border: rgba(255,255,255,0.12);
        --input-background: rgba(255,255,255,0.08);
        --user-message-bg: rgba(59,130,246,0.3);
        --user-message-border: rgba(59,130,246,0.4);
        --user-message-text: #ffffff;
        --bg-primary: transparent;
        --bg-secondary: rgba(255,255,255,0.05);
        --bg-tertiary: rgba(255,255,255,0.06);
        --text-primary: #ffffff;
        --text-secondary: rgba(255,255,255,0.7);
        --text-tertiary: rgba(255,255,255,0.4);
      }
      /* Range input thumbs for the popup sliders */
      input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #fff;
        border: 2px solid #3b82f6;
        cursor: pointer;
      }
      input[type="range"]::-moz-range-thumb {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #fff;
        border: 2px solid #3b82f6;
        cursor: pointer;
      }
      /* Compact chat in overlay */
      .overlay-chat-compact [data-message-role],
      .overlay-chat-compact > form > div,
      .overlay-chat-compact > form {
        font-size: 12px !important;
      }
      .overlay-chat-compact > form > div > div:first-child {
        padding-top: 6px !important;
        padding-bottom: 6px !important;
      }
      .overlay-chat-compact textarea {
        font-size: 12px !important;
        min-height: 18px !important;
      }
    `
    document.head.appendChild(style)

    return () => {
      document.body.style.background = prev.body
      document.documentElement.style.background = prev.html
      const el = document.getElementById('overlay-dark-vars')
      if (el) el.remove()
    }
  }, [])

  const isBrowser = BROWSER_APPS.includes((data.appName || '').toLowerCase())
  const displayName = isBrowser && data.url ? (extractDomain(data.url) || data.appName) : data.appName
  const showWindowTitle = data.windowTitle && data.windowTitle !== displayName

  // Mac instructions from native bridge
  const macInstructions = data.macInstructions || window.__overlordPersonality?.macInstructions || ''

  // Friction state
  const [frictionMode, setFrictionMode] = useState('none') // 'none', 'words', 'timer', 'complete'
  const [showFriction, setShowFriction] = useState(false) // toggle via paperclip button
  const [activeChipPopup, setActiveChipPopup] = useState(null) // 'words' | 'timer' | null
  const wordsChipRef = useRef(null)
  const timerChipRef = useRef(null)
  const [suggestions, setSuggestions] = useState(null) // AI-suggested chips from /blocking-suggestions
  const [aiReasoning, setAiReasoning] = useState('')   // DISPLAYED text (drips smoothly)
  const targetReasoningRef = useRef('')                // TARGET text (grows as chunks arrive)
  const typewriterRafRef = useRef(null)
  const streamDoneRef = useRef(false)

  // Smoothly drip characters from targetReasoningRef into aiReasoning state.
  // Decouples irregular network chunk arrival from display rate. Runs at a
  // steady ~90 chars/sec while streaming, catches up quickly once stream ends.
  useEffect(() => {
    let lastTick = performance.now()
    let cancelled = false

    const CHARS_PER_SEC_STREAMING = 90
    const CHARS_PER_SEC_CATCHUP = 400  // faster catch-up after stream ends

    const tick = (now) => {
      if (cancelled) return
      const dt = Math.min(100, now - lastTick)
      lastTick = now

      setAiReasoning(prev => {
        const target = targetReasoningRef.current
        if (prev.length >= target.length) return prev
        const rate = streamDoneRef.current ? CHARS_PER_SEC_CATCHUP : CHARS_PER_SEC_STREAMING
        const charsToAdd = Math.max(1, Math.floor((dt / 1000) * rate))
        const nextLen = Math.min(target.length, prev.length + charsToAdd)
        return target.slice(0, nextLen)
      })

      typewriterRafRef.current = requestAnimationFrame(tick)
    }

    typewriterRafRef.current = requestAnimationFrame(tick)
    return () => { cancelled = true; if (typewriterRafRef.current) cancelAnimationFrame(typewriterRafRef.current) }
  }, [])
  const [suggestionsLoading, setSuggestionsLoading] = useState(true)
  const [frictionWordCount, setFrictionWordCount] = useState(20)
  const [frictionTimerSeconds, setFrictionTimerSeconds] = useState(30)
  const [frictionTargetWords, setFrictionTargetWords] = useState([])
  const [frictionTypedText, setFrictionTypedText] = useState('')
  const [frictionTimerRemaining, setFrictionTimerRemaining] = useState(0)
  const timerRef = useRef(null)

  // Grace phase is rendered by a separate click-through native panel
  // (CountdownOverlay), triggered via window.nativeOverlay.showCountdown.
  //   'granted' -> unblock approved, 10s "Returning to <app>..."
  //   'dismiss' -> user said they'll close the app, 3s "Close <app> now..."
  const GRACE_GRANTED_DURATION = 10
  const GRACE_DISMISS_DURATION = 3
  const graceDismissedRef = useRef(false)

  // Chat state - scoped to this overlay only, NOT the main Overlord chat.
  // Messages live in React state; each send calls /blocking-chat and the
  // response comes back as an assistant message. No Firestore on the client,
  // but the server persists turns to MacOverlayChats for the support-webapp.
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef(null)
  // Stable per-overlay id used by the server to group persisted turns.
  const sessionIdRef = useRef(`blk_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`)

  const userEmail = data.userEmail || null
  const authToken = data.authToken || null

  // Stream the opening message from /blocking-suggestions. Reasoning text
  // comes in as deltas; the final event carries the structured chips.
  useEffect(() => {
    if (!authToken) {
      setSuggestionsLoading(false)
      return
    }
    const controller = new AbortController()
    let cancelled = false
    setSuggestionsLoading(true)
    setAiReasoning('')
    setSuggestions(null)
    targetReasoningRef.current = ''
    streamDoneRef.current = false

    ;(async () => {
      try {
        const serverBase = data.serverBase || 'https://overlordserver.up.railway.app'
        await streamSSE({
          url: `${serverBase}/blocking-suggestions`,
          signal: controller.signal,
          headers: { Authorization: `Bearer ${authToken}` },
          body: {
            app: data.appName,
            matched_word: data.matchedWord || '',
            mac_instructions: macInstructions,
            schedule: data.schedule || null,
            current_time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
            window_title: data.windowTitle || '',
            url: data.url || '',
            app_summary: data.appSummary || '',
            today_summary: data.todaySummary || '',
            session_id: sessionIdRef.current,
          },
          onEvent: (evt) => {
            if (cancelled) return
            if (evt.type === 'delta' && typeof evt.text === 'string') {
              // Append to target; the typewriter effect will release chars into state.
              targetReasoningRef.current += evt.text
              setSuggestionsLoading(false)
            } else if (evt.type === 'final') {
              if (typeof evt.reasoning === 'string' && evt.reasoning.trim()) {
                // Overwrite target with the authoritative final text, keeping any
                // already-displayed chars so the typewriter catches up from there.
                targetReasoningRef.current = evt.reasoning.trim()
              }
              if (Array.isArray(evt.suggestions) && evt.suggestions.length > 0) {
                setSuggestions(evt.suggestions)
              }
              streamDoneRef.current = true
              setSuggestionsLoading(false)
            } else if (evt.type === 'error') {
              console.error('[BlockingOverlay] stream error:', evt.error)
              streamDoneRef.current = true
              setSuggestionsLoading(false)
            }
          },
        })
        streamDoneRef.current = true
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('[BlockingOverlay] suggestions stream failed:', err)
        }
        streamDoneRef.current = true
        if (!cancelled) setSuggestionsLoading(false)
      }
    })()
    return () => { cancelled = true; controller.abort() }
  }, [authToken, data.appName, data.matchedWord])


  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Transition from the block overlay to a click-through countdown panel.
  // The native overlay-host silently swaps the block panel for a new
  // ignoresMouseEvents panel loading /countdown - user can actually click
  // into their app during the countdown. The countdown panel dismisses
  // itself at 0 and fires the single authoritative 'dismissed' event that
  // clears the engine's suppression flag.
  const startGrace = (mode = 'granted') => {
    if (graceDismissedRef.current) return
    graceDismissedRef.current = true
    const seconds = mode === 'dismiss' ? GRACE_DISMISS_DURATION : GRACE_GRANTED_DURATION
    const payload = { mode, seconds, appName: displayName }
    const base = window.location.href.split('#')[0]
    const url = `${base}#/countdown?data=${encodeURIComponent(JSON.stringify(payload))}`
    if (window.nativeOverlay?.showCountdown) {
      window.nativeOverlay.showCountdown(url)
    } else {
      // Fallback (e.g. non-native test env): just dismiss.
      if (window.nativeOverlay?.dismiss) window.nativeOverlay.dismiss()
      else if (window.electronAPI?.dismissOverlay) window.electronAPI.dismissOverlay('blocking')
    }
    props.onDismiss?.()
  }

  // Word slider position (0-1)
  const wordSliderPos = valueToLogSlider(frictionWordCount, 1, 2000)
  // Timer slider position (0-1)
  const timerSliderPos = valueToLogSlider(frictionTimerSeconds, 10, 86400)

  const handleWordSlider = (e) => {
    const pos = parseFloat(e.target.value)
    setFrictionWordCount(logSliderToValue(pos, 1, 2000))
  }

  const handleTimerSlider = (e) => {
    const pos = parseFloat(e.target.value)
    let raw = logSliderToValue(pos, 10, 86400)
    // Snap to minutes when >= 60s
    if (raw >= 60) raw = Math.round(raw / 60) * 60
    setFrictionTimerSeconds(Math.max(10, raw))
  }

  const startWordsChallenge = () => {
    const words = generateRandomWords(frictionWordCount)
    setFrictionTargetWords(words)
    setFrictionTypedText('')
    setFrictionMode('words')
  }

  const startTimerChallenge = () => {
    setFrictionTimerRemaining(frictionTimerSeconds)
    setFrictionMode('timer')
    if (timerRef.current) clearInterval(timerRef.current)
    const startingSeconds = frictionTimerSeconds
    let remaining = frictionTimerSeconds
    timerRef.current = setInterval(() => {
      remaining -= 1
      setFrictionTimerRemaining(remaining)
      if (remaining <= 0) {
        clearInterval(timerRef.current)
        timerRef.current = null
        setFrictionMode('none')
        setActiveChipPopup(null)
        const msg = window.__suggestedUnblockMessage
          || `I waited ${formatTimerLabel(startingSeconds)}. Can you unblock ${data.appName}?`
        window.__suggestedUnblockMessage = null
        sendChatMessage(msg)
      }
    }, 1000)
  }

  const cancelFriction = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setFrictionMode('none')
    setFrictionTypedText('')
    setFrictionTargetWords([])
  }

  // Check words progress
  const typedWords = frictionTypedText.trim().split(/\s+/).filter(Boolean)
  const matchedWordCount = useMemo(() => {
    let count = 0
    for (let i = 0; i < Math.min(typedWords.length, frictionTargetWords.length); i++) {
      if (typedWords[i].toLowerCase() === frictionTargetWords[i].toLowerCase()) count++
    }
    return count
  }, [frictionTypedText, frictionTargetWords])

  const handleFrictionTyping = (e) => {
    const val = e.target.value
    setFrictionTypedText(val)
    // Check completion
    const words = val.trim().split(/\s+/).filter(Boolean)
    if (words.length >= frictionTargetWords.length) {
      let allMatch = true
      for (let i = 0; i < frictionTargetWords.length; i++) {
        if (!words[i] || words[i].toLowerCase() !== frictionTargetWords[i].toLowerCase()) {
          allMatch = false
          break
        }
      }
      if (allMatch) {
        const count = frictionTargetWords.length
        setFrictionMode('none')
        setFrictionTypedText('')
        setFrictionTargetWords([])
        setActiveChipPopup(null)
        const msg = window.__suggestedUnblockMessage
          || `I typed ${count} random words. Can you unblock ${data.appName}?`
        window.__suggestedUnblockMessage = null
        sendChatMessage(msg)
      }
    }
  }

  const handleDurationPick = (minutes) => {
    if (window.nativeOverlay?.sendStatus) {
      window.nativeOverlay.sendStatus({
        action: 'grant-allowance',
        app: data.appName,
        minutes: minutes,
        matchedWord: data.matchedWord,
      })
    }
    startGrace()
  }

  const handleDismiss = () => {
    if (window.nativeOverlay?.sendStatus) {
      window.nativeOverlay.sendStatus({ action: 'dismissed', app: data.appName })
    }
    startGrace('dismiss')
  }

  // Send a chat message to /blocking-chat. Purely local state - does not touch
  // the main master_chat. Reused by the ChatInput and example chip buttons.
  const sendChatMessage = async (text) => {
    const msg = (text || '').trim()
    if (!msg || !authToken || chatLoading) return
    setChatInput('')

    const userMsg = { id: `u_${Date.now()}`, role: 'user', content: msg, timestamp: new Date() }
    const history = [...chatMessages, userMsg]
    setChatMessages(history)
    setChatLoading(true)

    try {
      const serverBase = data.serverBase || 'https://overlordserver.up.railway.app'
      const resp = await fetch(`${serverBase}/blocking-chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: history.map(m => ({ role: m.role, content: m.content })),
          app: data.appName,
          matched_word: data.matchedWord || '',
          mac_instructions: macInstructions,
          schedule: data.schedule || null,
          app_summary: data.appSummary || '',
          today_summary: data.todaySummary || '',
          current_time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          window_title: data.windowTitle || '',
          url: data.url || '',
          session_id: sessionIdRef.current,
        }),
      })
      if (!resp.ok) throw new Error(`Server ${resp.status}`)
      const result = await resp.json()

      setChatMessages(prev => [...prev, {
        id: `a_${Date.now()}`,
        role: 'assistant',
        content: result.response || 'OK.',
        tool_actions: result.tool_actions || [],
        timestamp: new Date(),
      }])

      const granted = (result.tool_actions || []).some(ta => (ta?.tool || ta?.name) === 'grant_mac_unblock')
      if (granted) startGrace()
    } catch (err) {
      console.error('[BlockingOverlay] /blocking-chat failed:', err)
      setChatMessages(prev => [...prev, {
        id: `err_${Date.now()}`,
        role: 'assistant',
        content: `Connection failed: ${err.message}. Try again.`,
        timestamp: new Date(),
      }])
    } finally {
      setChatLoading(false)
    }
  }

  const handleChatSend = () => sendChatMessage(chatInput)

  // Timer progress (0-1)
  const timerProgress = frictionTimerSeconds > 0
    ? (frictionTimerSeconds - frictionTimerRemaining) / frictionTimerSeconds
    : 0


  return (
    <div style={styles.container}>
      <div style={styles.scrollWrapper}>
        <div style={styles.contentColumn}>

          {/* 1. ACCESS BLOCKED badge */}
          <div style={styles.badge}>
            <Lock size={14} strokeWidth={2.5} />
            <span style={styles.badgeText}>ACCESS BLOCKED</span>
          </div>

          {/* 2. App name + window title */}
          <div style={styles.appSection}>
            <div style={styles.appName}>{displayName}</div>
            {showWindowTitle && (
              <div style={styles.windowTitle}>{data.windowTitle}</div>
            )}
          </div>

          {/* 3. Blocked reason (compact) */}
          {data.matchedWord && (
            <div style={styles.blockedReason}>
              <Ban size={12} strokeWidth={2} style={{ color: '#ef4444', flexShrink: 0 }} />
              <span style={styles.blockedReasonText}>
                Blocked: "{data.matchedWord}"
                {data.schedule && formatSchedule(data.schedule) && (
                  <span style={{ opacity: 0.6, marginLeft: 6 }}>
                    · {formatSchedule(data.schedule)}
                  </span>
                )}
              </span>
            </div>
          )}

          {/* 4. Your Unblock Rules (message widget) */}
          <div style={styles.rulesCard}>
            <div style={styles.rulesIconWrap}>
              {macInstructions ? (
                <ShieldCheck size={16} strokeWidth={1.8} style={{ color: 'rgba(59,130,246,0.7)' }} />
              ) : (
                <MessageCircle size={16} strokeWidth={1.8} style={{ color: 'rgba(255,255,255,0.3)' }} />
              )}
            </div>
            <div style={styles.rulesContent}>
              <div style={styles.rulesTitle}>
                Mac Instructions
              </div>
              <div style={styles.rulesBody}>
                {macInstructions || 'No instructions set up yet. Use the chat below to tell Overlord about your work.'}
              </div>
            </div>
          </div>

          {/* 5. Friction widgets - only shown once user commits to words/timer challenge */}
          {false && frictionMode === 'none' && (
            <div style={styles.frictionContainer}>
              {/* Option A: Random Words */}
              <div style={styles.frictionCard}>
                <div style={styles.frictionDesc}>
                  Type random words to request an unblock. Higher friction = harder to bypass.
                </div>
                <div style={styles.frictionRow}>
                  <span style={styles.frictionLabel}>Words to type</span>
                  <span style={{ ...styles.frictionValue, color: '#ef4444' }}>
                    {frictionWordCount} words
                  </span>
                </div>
                <div style={styles.sliderWrap}>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.001"
                    value={wordSliderPos}
                    onChange={handleWordSlider}
                    style={styles.sliderRed}
                  />
                  <div style={styles.sliderLabels}>
                    <span>1</span>
                    <span>2000</span>
                  </div>
                </div>
                <button onClick={startWordsChallenge} style={styles.btnRed}>
                  Type {frictionWordCount} words to unblock
                </button>
              </div>

              {/* Option B: Wait Timer */}
              <div style={styles.frictionCard}>
                <div style={styles.frictionDesc}>
                  Wait a set amount of time before unblocking. Countdown starts now.
                </div>
                <div style={styles.frictionRow}>
                  <span style={styles.frictionLabel}>Wait time</span>
                  <span style={{ ...styles.frictionValue, color: '#3b82f6' }}>
                    {formatTimerLabel(frictionTimerSeconds)}
                  </span>
                </div>
                <div style={styles.sliderWrap}>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.001"
                    value={timerSliderPos}
                    onChange={handleTimerSlider}
                    style={styles.sliderBlue}
                  />
                  <div style={styles.sliderLabels}>
                    <span>10 sec</span>
                    <span>24 hours</span>
                  </div>
                </div>
                <button onClick={startTimerChallenge} style={styles.btnBlue}>
                  Wait {formatTimerLabel(frictionTimerSeconds)} to unblock
                </button>
              </div>
            </div>
          )}

          {/* 5.5 Shared OverlordChatWidget (same component used by the check-in overlay).
               Shows the "Huge Statement" headline, stacked action buttons parsed from
               the AI's reasoning bullets, and handles the follow-up chat against
               /blocking-chat. */}
          {suggestionsLoading ? (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 8,
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 14, padding: 16, width: '100%',
              minHeight: 340,
            }}>
              {['90%', '70%'].map((w, i) => (
                <div key={i} style={{
                  height: 26, width: w, borderRadius: 6,
                  background: 'linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.14), rgba(255,255,255,0.06))',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 1.4s ease-in-out infinite',
                }} />
              ))}
            </div>
          ) : (
            <OverlordChatWidget
              initialMessage={
                // Reasoning + suggestion labels as bullets (the widget parses
                // these as clickable chips; clicking sends the label as a chat
                // message, and /blocking-chat decides what to do via grant_mac_unblock).
                aiReasoning
                  ? (suggestions && suggestions.length > 0
                      ? `${aiReasoning}\n${suggestions.map(s => `- ${s.label || s.message || 'Unblock'}`).join('\n')}`
                      : aiReasoning)
                  : `${displayName} is blocked. Reply below to request an unblock.`
              }
              initialActions={[]}
              quickReplies={[]}
              serverBase={data.serverBase || 'https://overlordserver.up.railway.app'}
              endpoint="/blocking-chat"
              authToken={authToken}
              context={{
                app: data.appName,
                matched_word: data.matchedWord || '',
                mac_instructions: macInstructions,
                schedule: data.schedule || null,
                app_summary: data.appSummary || '',
                today_summary: data.todaySummary || '',
                current_time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
                window_title: data.windowTitle || '',
                url: data.url || '',
                session_id: sessionIdRef.current,
              }}
              onDismiss={handleDismiss}
              containerStyle={{ width: '100%', minHeight: 340 }}
            />
          )}

          {/* 7. Dismiss button - stays in natural flow. The widget above
               has a min-height so streaming growth rarely pushes this down. */}
          <button onClick={handleDismiss} style={styles.dismissBtn}>
            <XCircle size={16} strokeWidth={1.8} />
            <span>I will close this app</span>
          </button>

        </div>
      </div>
    </div>
  )
}

// Custom slider CSS injected once
const sliderThumbCSS = `
  input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 4px;
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    cursor: pointer;
  }
  .slider-red { background: rgba(239,68,68,0.2); }
  .slider-red::-webkit-slider-thumb { background: #ef4444; }
  .slider-blue { background: rgba(59,130,246,0.2); }
  .slider-blue::-webkit-slider-thumb { background: #3b82f6; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
`

// Inject slider styles
if (typeof document !== 'undefined') {
  const existing = document.getElementById('blocking-overlay-slider-css')
  if (!existing) {
    const styleEl = document.createElement('style')
    styleEl.id = 'blocking-overlay-slider-css'
    styleEl.textContent = sliderThumbCSS
    document.head.appendChild(styleEl)
  }
}

// --- Chip tooltip popups ---

function ChipPopup({ children, onClose, anchorRef }) {
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (anchorRef?.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      setPos({
        top: rect.top - 8,
        left: rect.left + rect.width / 2,
      })
    }
    const handler = (e) => {
      if (!e.target.closest('[data-chip-popup]') && !e.target.closest('[data-chip-anchor]')) onClose()
    }
    const t = setTimeout(() => window.addEventListener('mousedown', handler), 50)
    return () => { clearTimeout(t); window.removeEventListener('mousedown', handler) }
  }, [onClose, anchorRef])

  return (
    <div data-chip-popup="true" style={{
      position: 'fixed',
      top: pos.top,
      left: pos.left,
      transform: 'translate(-50%, -100%)',
      width: 280,
      padding: 14,
      borderRadius: 10,
      background: 'rgba(30, 30, 30, 0.98)',
      border: '1px solid rgba(255,255,255,0.12)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      zIndex: 999999,
      fontFamily: 'Figtree, sans-serif',
    }}>
      {children}
      {/* Arrow pointer */}
      <div style={{
        position: 'absolute',
        bottom: -6, left: '50%', transform: 'translateX(-50%) rotate(45deg)',
        width: 12, height: 12,
        background: 'rgba(30, 30, 30, 0.98)',
        borderRight: '1px solid rgba(255,255,255,0.12)',
        borderBottom: '1px solid rgba(255,255,255,0.12)',
      }} />
    </div>
  )
}

function WordsFrictionPopup({ wordCount, setWordCount, wordsSliderPos, handleWordsSlider, onStart,
  frictionMode, frictionTargetWords, frictionTypedText, handleFrictionTyping, matchedWordCount, onCancel,
}) {
  const sliderStyle = {
    width: '100%',
    WebkitAppearance: 'none', appearance: 'none',
    height: 6, borderRadius: 3,
    background: 'linear-gradient(to right, #3b82f6 0%, #3b82f6 ' + (wordsSliderPos * 100) + '%, rgba(255,255,255,0.15) ' + (wordsSliderPos * 100) + '%, rgba(255,255,255,0.15) 100%)',
    outline: 'none', cursor: 'pointer',
  }

  if (frictionMode === 'words') {
    return (
      <div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
          Type these {frictionTargetWords.length} words:
        </div>
        <div style={{
          maxHeight: 100, overflowY: 'auto', padding: 8, borderRadius: 6,
          background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8,
        }}>
          {frictionTargetWords.map((word, i) => {
            const typed = (frictionTypedText || '').trim().split(/\s+/)
            const isTyped = i < typed.length && typed[i].length > 0
            const isCorrect = isTyped && typed[i].toLowerCase() === word.toLowerCase()
            const isWrong = isTyped && !isCorrect
            return (
              <span key={i} style={{
                fontSize: 11, fontFamily: "'SF Mono', Menlo, monospace", padding: '1px 5px', borderRadius: 3,
                color: isCorrect ? '#22c55e' : isWrong ? '#ef4444' : 'rgba(255,255,255,0.5)',
                background: isCorrect ? 'rgba(34,197,94,0.15)' : isWrong ? 'rgba(239,68,68,0.15)' : 'transparent',
              }}>{word}</span>
            )
          })}
        </div>
        <textarea
          value={frictionTypedText}
          onChange={handleFrictionTyping}
          onPaste={(e) => e.preventDefault()}
          placeholder="Type the words above..."
          spellCheck={false}
          style={{
            width: '100%', height: 50, padding: 8, borderRadius: 6,
            background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#fff', fontSize: 11, fontFamily: "'SF Mono', Menlo, monospace",
            outline: 'none', resize: 'none', boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
            {matchedWordCount}/{frictionTargetWords.length} words
          </span>
          <button onClick={onCancel} style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 500,
            border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
            color: 'rgba(255,255,255,0.7)', cursor: 'pointer',
          }}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 10, lineHeight: 1.4 }}>
        Type random words to unblock. Higher = harder.
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>Words</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6' }}>{wordCount}</span>
      </div>
      <input
        type="range" min="0" max="1" step="0.001"
        value={wordsSliderPos}
        onChange={handleWordsSlider}
        style={sliderStyle}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
        <span>1</span><span>2000</span>
      </div>
      <button
        onClick={onStart}
        style={{
          marginTop: 10, width: '100%', padding: '8px 12px', borderRadius: 8,
          border: '1px solid rgba(59, 130, 246, 0.4)',
          background: 'rgba(59, 130, 246, 0.2)',
          color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'Figtree, sans-serif',
        }}
      >
        Type {wordCount} words to unblock
      </button>
    </div>
  )
}

function TimerFrictionPopup({ timerSeconds, setTimerSeconds, timerSliderPos, handleTimerSlider, onStart,
  frictionMode, frictionTimerRemaining, onCancel,
}) {
  const sliderStyle = {
    width: '100%',
    WebkitAppearance: 'none', appearance: 'none',
    height: 6, borderRadius: 3,
    background: 'linear-gradient(to right, #3b82f6 0%, #3b82f6 ' + (timerSliderPos * 100) + '%, rgba(255,255,255,0.15) ' + (timerSliderPos * 100) + '%, rgba(255,255,255,0.15) 100%)',
    outline: 'none', cursor: 'pointer',
  }

  if (frictionMode === 'timer' && frictionTimerRemaining > 0) {
    const progress = 1 - (frictionTimerRemaining / timerSeconds)
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>
          Waiting to unblock...
        </div>
        <div style={{ fontSize: 32, fontWeight: 700, color: '#3b82f6', fontFamily: "'SF Mono', Menlo, monospace", marginBottom: 12 }}>
          {formatTimerLabel(frictionTimerRemaining)}
        </div>
        <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.15)', overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ width: (progress * 100) + '%', height: '100%', background: '#3b82f6', transition: 'width 0.5s linear' }} />
        </div>
        <button onClick={onCancel} style={{
          padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 500,
          border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
          color: 'rgba(255,255,255,0.7)', cursor: 'pointer',
        }}>Cancel</button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 10, lineHeight: 1.4 }}>
        Wait before unblocking. Countdown starts now.
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>Wait time</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6' }}>{formatTimerLabel(timerSeconds)}</span>
      </div>
      <input
        type="range" min="0" max="1" step="0.001"
        value={timerSliderPos}
        onChange={handleTimerSlider}
        style={sliderStyle}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
        <span>10 sec</span><span>24 hours</span>
      </div>
      <button
        onClick={onStart}
        style={{
          marginTop: 10, width: '100%', padding: '8px 12px', borderRadius: 8,
          border: '1px solid rgba(59, 130, 246, 0.4)',
          background: 'rgba(59, 130, 246, 0.2)',
          color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'Figtree, sans-serif',
        }}
      >
        Wait {formatTimerLabel(timerSeconds)} to unblock
      </button>
    </div>
  )
}

const styles = {
  container: {
    position: 'fixed',
    inset: 0,
    background: 'transparent',
    zIndex: 99999,
    fontFamily: "'Figtree', -apple-system, BlinkMacSystemFont, sans-serif",
    color: '#fff',
  },
  scrollWrapper: {
    width: '100%',
    height: '100%',
    overflowY: 'auto',
    display: 'flex',
    justifyContent: 'center',
  },
  contentColumn: {
    maxWidth: 550,
    width: '100%',
    padding: '40px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
  },

  // 1. Badge
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 16px',
    borderRadius: 99,
    background: '#ef4444',
    alignSelf: 'center',
  },
  badgeText: {
    fontSize: 13,
    fontFamily: "'Figtree', sans-serif",
    fontWeight: 700,
    letterSpacing: '1.2px',
    color: '#fff',
  },

  // 2. App name + window title
  appSection: {
    width: '100%',
    textAlign: 'center',
  },
  appName: {
    fontSize: 32,
    fontFamily: "'Figtree', sans-serif",
    fontWeight: 700,
    color: '#fff',
    lineHeight: 1.2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  windowTitle: {
    fontSize: 13,
    fontFamily: "'Figtree', sans-serif",
    color: 'rgba(255,255,255,0.5)',
    marginTop: 6,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  // 3. Blocked reason
  blockedReason: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
  },
  blockedReasonText: {
    fontSize: 13,
    fontFamily: "'Figtree', sans-serif",
    fontWeight: 500,
    color: 'rgba(255,255,255,0.7)',
  },

  // 4. Unblock rules card
  rulesCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    width: '100%',
    padding: 12,
    borderRadius: 10,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.06)',
    boxSizing: 'border-box',
  },
  rulesIconWrap: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rulesContent: {
    flex: 1,
    minWidth: 0,
  },
  rulesTitle: {
    fontSize: 12,
    fontFamily: "'Figtree', sans-serif",
    fontWeight: 600,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 4,
  },
  rulesBody: {
    fontSize: 11,
    fontFamily: "'Figtree', sans-serif",
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 1.5,
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },

  // 5. Friction
  frictionContainer: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  frictionCard: {
    width: '100%',
    padding: 14,
    borderRadius: 12,
    background: 'rgba(20, 20, 20, 0.6)',
    border: '1px solid rgba(255,255,255,0.08)',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  frictionDesc: {
    fontSize: 12,
    fontFamily: "'Figtree', sans-serif",
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 1.5,
  },
  frictionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  frictionLabel: {
    fontSize: 13,
    fontFamily: "'Figtree', sans-serif",
    fontWeight: 600,
    color: '#fff',
  },
  frictionValue: {
    fontSize: 13,
    fontFamily: "'Figtree', sans-serif",
    fontWeight: 700,
  },
  sliderWrap: {
    width: '100%',
  },
  sliderLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 10,
    fontFamily: "'Figtree', sans-serif",
    color: 'rgba(255,255,255,0.3)',
    marginTop: 2,
  },
  sliderRed: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    background: 'rgba(239,68,68,0.2)',
    accentColor: '#ef4444',
    className: 'slider-red',
  },
  sliderBlue: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    background: 'rgba(59,130,246,0.2)',
    accentColor: '#3b82f6',
    className: 'slider-blue',
  },
  btnRed: {
    width: '100%',
    padding: '12px 0',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 10,
    background: 'rgba(239,68,68,0.2)',
    color: '#fff',
    fontSize: 14,
    fontFamily: "'Figtree', sans-serif",
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'center',
  },
  btnBlue: {
    width: '100%',
    padding: '12px 0',
    border: '1px solid rgba(59,130,246,0.3)',
    borderRadius: 10,
    background: 'rgba(59,130,246,0.2)',
    color: '#fff',
    fontSize: 14,
    fontFamily: "'Figtree', sans-serif",
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'center',
  },

  // Words challenge
  wordsDisplay: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
    padding: 10,
    borderRadius: 8,
    background: 'rgba(255,255,255,0.04)',
    maxHeight: 80,
    overflowY: 'auto',
  },
  wordChip: {
    fontSize: 12,
    fontFamily: "'SF Mono', 'Menlo', monospace",
    padding: '2px 5px',
    borderRadius: 4,
    transition: 'color 0.15s, background 0.15s',
  },
  wordsInput: {
    width: '100%',
    height: 60,
    padding: 10,
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    color: '#fff',
    fontSize: 12,
    fontFamily: "'SF Mono', 'Menlo', monospace",
    outline: 'none',
    resize: 'none',
    boxSizing: 'border-box',
  },
  wordsFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  wordsCount: {
    fontSize: 11,
    fontFamily: "'Figtree', sans-serif",
    color: 'rgba(255,255,255,0.4)',
  },
  cancelBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontFamily: "'Figtree', sans-serif",
    cursor: 'pointer',
    padding: '4px 8px',
  },

  // Timer challenge
  timerCircleWrap: {
    position: 'relative',
    width: 110,
    height: 110,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerText: {
    position: 'absolute',
    textAlign: 'center',
  },
  timerNumber: {
    fontSize: 28,
    fontFamily: "'SF Mono', 'Menlo', monospace",
    fontWeight: 800,
    color: '#fff',
    lineHeight: 1,
  },
  timerUnit: {
    fontSize: 10,
    fontFamily: "'Figtree', sans-serif",
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },

  // Completion picker
  completeCard: {
    width: '100%',
    padding: 14,
    borderRadius: 12,
    background: 'rgba(34,197,94,0.05)',
    border: '1px solid rgba(34,197,94,0.2)',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },
  completeHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  completeText: {
    fontSize: 14,
    fontFamily: "'Figtree', sans-serif",
    fontWeight: 600,
    color: '#22c55e',
  },
  durationGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 6,
    width: '100%',
  },
  durationBtn: {
    padding: '10px 0',
    borderRadius: 8,
    border: 'none',
    background: 'rgba(34,197,94,0.12)',
    color: '#22c55e',
    fontSize: 13,
    fontFamily: "'Figtree', sans-serif",
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'center',
  },

  // 6. Chat
  chatContainer: {
    width: '100%',
    borderRadius: 12,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
    display: 'flex',
    flexDirection: 'column',
  },
  chatMessages: {
    height: 260,
    overflowY: 'auto',
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  chatEmpty: {
    fontSize: 12,
    fontFamily: "'Figtree', sans-serif",
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    marginTop: 60,
  },
  chatBubble: {
    maxWidth: '80%',
    padding: '8px 12px',
    borderRadius: 10,
    fontSize: 13,
    fontFamily: "'Figtree', sans-serif",
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 1.5,
  },
  chatThinking: {
    fontSize: 12,
    fontFamily: "'Figtree', sans-serif",
    color: 'rgba(255,255,255,0.4)',
    fontStyle: 'italic',
  },
  chatInputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  chatInput: {
    flex: 1,
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.05)',
    color: '#fff',
    fontSize: 13,
    fontFamily: "'Figtree', sans-serif",
    outline: 'none',
  },
  chatSendBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: 'none',
    background: 'rgba(59,130,246,0.3)',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // 7. Dismiss
  dismissBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    padding: 14,
    borderRadius: 99,
    background: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    fontFamily: "'Figtree', sans-serif",
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 8,
  },

}
