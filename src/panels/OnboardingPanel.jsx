import React, { useEffect, useRef, useState } from 'react'
import { auth } from '../services/firebaseService'
import { getServerHttpBase } from '../services/serverUrl'
import { streamSSE } from '../lib/streamFetch'
import MessageList from '../chat/MessageList'
import ChatInput from '../chat/ChatInput'

/**
 * OnboardingPanel - Mac-blocking setup chat that runs on the dedicated
 * /mac-onboarding-chat endpoint. Streams SSE (text deltas + tool_use /
 * tool_result events) and reuses the main o-agent chat components
 * (MessageList / MessageBubble / ChatInput) so the visuals match.
 *
 * State is 100% local - never persisted to master_chat, never shared with the
 * main chat. Refresh = start over from TURN 1 (the server prompt expects this).
 *
 * Message shape matches what MessageBubble consumes via Firestore: { id,
 * role, content, timestamp (Date), visible_to_user, metadata? }. Tool
 * activity uses the same shape MessageList's StreamingActivityIndicator
 * expects: { kind, name, status, result, args, timestamp }.
 */

function newId() {
  return `ob_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export default function OnboardingPanel() {
  // Persisted conversation (completed turns, user + assistant).
  const [messages, setMessages] = useState([])

  // Active-stream state (mirrors what useWebSocket exposes to MessageList)
  const [streamingMessage, setStreamingMessage] = useState('')
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [isResponseComplete, setIsResponseComplete] = useState(true)
  const [toolActivities, setToolActivities] = useState([])
  const [error, setError] = useState(null)

  const abortRef = useRef(null)
  const hasKickedOffRef = useRef(false)

  // Build the message list we'll POST to the server. Assistant messages use
  // their plain text content; tool_use/tool_result rounds never appear here
  // because the server-side tool-use loop swallows those before the next
  // streaming round - client only ever sees final assistant text.
  function buildApiMessages(base) {
    return base
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }))
  }

  async function sendTurn(userText) {
    if (!isResponseComplete) return
    setError(null)

    // Snapshot of history with the new user message appended (if any).
    let baseMessages = messages
    if (userText) {
      const userMsg = {
        id: newId(),
        role: 'user',
        content: userText,
        timestamp: new Date(),
        visible_to_user: true,
      }
      baseMessages = [...messages, userMsg]
      setMessages(baseMessages)
    }

    // Prime streaming state
    setStreamingMessage('')
    setToolActivities([])
    setIsWaitingForResponse(true)
    setIsThinking(true)
    setIsResponseComplete(false)

    // Track the in-flight text so we can finalize it into messages[] on 'done'
    let accumulatedText = ''
    const abort = new AbortController()
    abortRef.current = abort

    try {
      const user = auth.currentUser
      if (!user) throw new Error('Not signed in')
      const authToken = await user.getIdToken()
      const serverBase = await getServerHttpBase()
      const apiMessages = buildApiMessages(baseMessages)
      const currentTime = new Date().toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true,
      })

      await streamSSE({
        url: `${serverBase}/mac-onboarding-chat`,
        body: {
          messages: apiMessages,
          mac_instructions: window.__overlordPersonality?.macInstructions || '',
          current_time: currentTime,
        },
        headers: { Authorization: `Bearer ${authToken}` },
        signal: abort.signal,
        onEvent: (evt) => {
          if (!evt || !evt.type) return

          if (evt.type === 'ping') {
            console.log('[OnboardingPanel] SSE ping received - transport OK')
            return
          }

          if (evt.type === 'delta') {
            if (isThinkingFirstDelta(accumulatedText)) {
              setIsThinking(false)
              setIsWaitingForResponse(false)
            }
            accumulatedText += evt.text || ''
            setStreamingMessage(accumulatedText)
            return
          }

          if (evt.type === 'tool_use') {
            // Push an executing tool row into the timeline.
            setIsThinking(false)
            setIsWaitingForResponse(false)
            setToolActivities(prev => [
              ...prev,
              {
                kind: 'tool',
                id: evt.id,
                name: evt.name,
                args: evt.input,
                status: 'executing',
                timestamp: Date.now(),
              },
            ])
            return
          }

          if (evt.type === 'tool_result') {
            setToolActivities(prev => prev.map(t =>
              t.id === evt.id
                ? {
                    ...t,
                    status: 'completed',
                    result: typeof evt.result === 'string'
                      ? evt.result
                      : JSON.stringify(evt.result),
                  }
                : t
            ))
            return
          }

          if (evt.type === 'done') {
            // Finalize: freeze accumulated text + tool activities into a
            // single assistant message in the main list.
            const assistantMsg = {
              id: newId(),
              role: 'assistant',
              content: accumulatedText,
              timestamp: new Date(),
              visible_to_user: true,
              // Stash the tool activity on the message so it stays visible
              // after the stream finishes, in a form MessageBubble won't try
              // to render (it ignores unknown metadata keys).
              metadata: { __onboarding_tools: captureToolActivities() },
            }
            setMessages(prev => (
              accumulatedText.trim() ? [...prev, assistantMsg] : prev
            ))
            setStreamingMessage('')
            setToolActivities([])
            setIsThinking(false)
            setIsWaitingForResponse(false)
            setIsResponseComplete(true)
            return
          }

          if (evt.type === 'error') {
            setError(evt.error || 'Unknown stream error')
            // Treat as terminal
            setStreamingMessage('')
            setToolActivities([])
            setIsThinking(false)
            setIsWaitingForResponse(false)
            setIsResponseComplete(true)
            return
          }
        },
      })

      // If the stream ended without a `done` event (e.g. connection close),
      // flush whatever text we have so the user isn't left staring at a
      // half-finished bubble.
      if (!isResponseCompleteRef.current) {
        if (accumulatedText.trim()) {
          setMessages(prev => [...prev, {
            id: newId(),
            role: 'assistant',
            content: accumulatedText,
            timestamp: new Date(),
            visible_to_user: true,
          }])
        }
        setStreamingMessage('')
        setToolActivities([])
        setIsThinking(false)
        setIsWaitingForResponse(false)
        setIsResponseComplete(true)
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      console.error('[OnboardingPanel] stream error:', err)
      setError(err.message || String(err))
      setStreamingMessage('')
      setToolActivities([])
      setIsThinking(false)
      setIsWaitingForResponse(false)
      setIsResponseComplete(true)
    }
  }

  // Cursor hacks to read latest values inside streamSSE callback closures
  const isResponseCompleteRef = useRef(isResponseComplete)
  useEffect(() => { isResponseCompleteRef.current = isResponseComplete }, [isResponseComplete])

  const toolActivitiesRef = useRef(toolActivities)
  useEffect(() => { toolActivitiesRef.current = toolActivities }, [toolActivities])
  function captureToolActivities() {
    return toolActivitiesRef.current
  }

  function isThinkingFirstDelta(currentText) {
    return currentText.length === 0
  }

  // Auto-kick TURN 1 on mount. Polls briefly for auth.currentUser since the
  // panel can mount before Firebase has resolved the user object.
  useEffect(() => {
    console.log('[OnboardingPanel] mounted')
    if (hasKickedOffRef.current) return
    let cancelled = false
    let attempts = 0
    const tryKick = () => {
      if (cancelled || hasKickedOffRef.current) return
      const user = auth.currentUser
      if (user) {
        hasKickedOffRef.current = true
        console.log('[OnboardingPanel] kicking off initial fetch for', user.email)
        sendTurn(null)
        return
      }
      attempts += 1
      if (attempts > 30) {
        // ~3s of retrying - give up and surface error so user sees something
        console.warn('[OnboardingPanel] auth.currentUser never resolved')
        setError('Not signed in - please reopen the app.')
        return
      }
      setTimeout(tryKick, 100)
    }
    tryKick()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Abort any in-flight stream on unmount
  useEffect(() => {
    return () => { try { abortRef.current?.abort() } catch { /* no-op */ } }
  }, [])

  function handleStop() {
    try { abortRef.current?.abort() } catch { /* no-op */ }
    setIsThinking(false)
    setIsWaitingForResponse(false)
    setIsResponseComplete(true)
    // Keep whatever streamingMessage we have on-screen as an assistant msg
    if (streamingMessage.trim()) {
      setMessages(prev => [...prev, {
        id: newId(),
        role: 'assistant',
        content: streamingMessage,
        timestamp: new Date(),
        visible_to_user: true,
      }])
    }
    setStreamingMessage('')
    setToolActivities([])
  }

  const chatInput = (
    <ChatInput
      onSend={sendTurn}
      isWaitingForResponse={!isResponseComplete}
      hasQueuedMessage={false}
      onCancelQueued={() => {}}
      canQueue={false}
      onStop={handleStop}
    />
  )

  const hasMessages = messages.length > 0

  return (
    <div className="flex-1 flex flex-col h-full relative" style={{ minHeight: 0 }}>
      <MessageList
        messages={messages}
        isLoading={false}
        streamingMessage={streamingMessage}
        isThinking={isThinking}
        thinkingText={''}
        isWaitingForResponse={isWaitingForResponse}
        isAgentRunning={!isResponseComplete}
        isResponseComplete={isResponseComplete}
        isProcessingAction={false}
        toolActivities={toolActivities}
        onSendMessage={sendTurn}
        chatInput={!hasMessages ? chatInput : undefined}
      />
      {hasMessages && chatInput}

      {error && (
        <div style={{
          position: 'absolute', top: 10, left: 0, right: 0,
          display: 'flex', justifyContent: 'center', pointerEvents: 'none',
        }}>
          <div style={{
            pointerEvents: 'auto',
            padding: '6px 12px', borderRadius: 8, fontSize: 12,
            background: 'rgba(239,68,68,0.08)', color: '#ef4444',
            border: '1px solid rgba(239,68,68,0.25)',
            fontFamily: "'Figtree', sans-serif",
          }}>
            {error}.{' '}
            <button
              onClick={() => sendTurn(null)}
              style={{
                background: 'transparent', border: 'none', color: '#ef4444',
                fontWeight: 600, cursor: 'pointer', textDecoration: 'underline',
                fontFamily: "'Figtree', sans-serif", padding: 0, fontSize: 12,
              }}
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
