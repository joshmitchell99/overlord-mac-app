import { useState, useEffect, useCallback, useRef } from 'react'
import { auth, db } from '../services/firebaseService'
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore'
import { isFinalAction } from './actionParser'

const WS_BASE_URL = 'wss://overlordserver.up.railway.app'

/**
 * WebSocket hook for the Mac Electron app.
 * Simplified from the webapp's useWebSocket.ts - removed stores, analytics, remote logger.
 * Uses connect-on-demand pattern (matches Flutter 2.17.17+).
 */
export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false)
  const [streamingMessage, setStreamingMessage] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [thinkingText, setThinkingText] = useState('')
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false)
  const [isResponseComplete, setIsResponseComplete] = useState(false)
  const [isProcessingAction, setIsProcessingAction] = useState(false)
  // True from user send through conversation_over. Unlike isWaitingForResponse,
  // this stays true during tool rounds + streaming text, so the live
  // StreamingActivityIndicator remains visible for the whole agent run.
  const [isAgentRunning, setIsAgentRunning] = useState(false)
  const [serverUrl, setServerUrl] = useState(WS_BASE_URL)

  // Live tool activity timeline (matches webapp). Each entry:
  // { name, status: 'executing'|'completed', kind: 'tool'|'status', detail?, args?, result?, message?, timestamp }
  const [toolActivities, setToolActivities] = useState([])
  const toolActivitiesRef = useRef([])

  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const reconnectAttemptsRef = useRef(0)
  const streamingMessageRef = useRef('')
  const ignoreStreamingRef = useRef(false)
  const lastDeltaTimeRef = useRef(0)
  const pauseDetectionTimerRef = useRef(null)
  const disconnectTimeRef = useRef(0)

  // Retry state refs
  const lastSentPayloadRef = useRef(null)
  const retryCountRef = useRef(0)
  const responseStartedRef = useRef(false)
  const responseTimeoutRef = useRef(null)
  const streamingCleanupTimeoutRef = useRef(null)
  const rafPendingRef = useRef(false)

  // Queued message
  const queuedMessageRef = useRef(null)
  const [hasQueuedMessage, setHasQueuedMessage] = useState(false)

  // Load server URL based on user settings (ngrok override)
  const loadServerUrl = useCallback(async () => {
    const user = auth.currentUser
    if (!user) {
      setServerUrl(WS_BASE_URL)
      return
    }

    try {
      const userId = user.email || user.uid
      const settingsRef = doc(db, 'users', userId, 'Settings', 'OverlordSettings')
      const settingsDoc = await getDoc(settingsRef)
      const settings = settingsDoc.exists() ? settingsDoc.data() : {}

      const ngrokRaw = settings?.ngrok ?? false
      const useNgrok = ngrokRaw === true || ngrokRaw === 'true' || ngrokRaw === 'True'

      if (useNgrok) {
        if (user.email === 'eddie@forfeit.app' || user.email === 'support@forfeit.app') {
          setServerUrl('wss://overlord1.ngrok.app')
        } else {
          setServerUrl('wss://overlord.ngrok.app')
        }
        return
      }

      setServerUrl(WS_BASE_URL)
    } catch (error) {
      console.error('Error loading server URL:', error)
      setServerUrl(WS_BASE_URL)
    }
  }, [])

  // 5-minute response timeout
  const _startResponseTimeout = useCallback(() => {
    if (responseTimeoutRef.current) clearTimeout(responseTimeoutRef.current)
    responseTimeoutRef.current = setTimeout(() => {
      if (lastSentPayloadRef.current && !responseStartedRef.current) {
        console.error('[WebSocket] 5-minute response timeout - clearing stuck state')
        lastSentPayloadRef.current = null
        retryCountRef.current = 0
        setIsWaitingForResponse(false)
        setIsThinking(false)
        setIsAgentRunning(false)
        streamingMessageRef.current = ''
        setStreamingMessage('')

        if (queuedMessageRef.current) {
          const queued = queuedMessageRef.current
          queuedMessageRef.current = null
          setHasQueuedMessage(false)
          setTimeout(() => sendMessage(queued.text, queued.metadata), 500)
        }
      }
    }, 5 * 60 * 1000)
  }, [])

  const connect = useCallback(async () => {
    const user = auth.currentUser
    if (!user || wsRef.current?.readyState === WebSocket.OPEN) return

    // Clean up existing socket
    if (wsRef.current) {
      const oldWs = wsRef.current
      oldWs.onclose = null
      oldWs.onerror = null
      oldWs.onmessage = null
      oldWs.close()
      wsRef.current = null
    }

    try {
      const token = await user.getIdToken()
      const wsUrl = `${serverUrl}/streaming_master_chat_module/ws/master_chat?token=${encodeURIComponent(token)}`
      const socket = new WebSocket(wsUrl)

      socket.onopen = () => {
        setIsConnected(true)
        reconnectAttemptsRef.current = 0

        // Retry pending message if exists
        if (lastSentPayloadRef.current && retryCountRef.current > 0) {
          const { text, metadata, messageId } = lastSentPayloadRef.current
          ignoreStreamingRef.current = false
          responseStartedRef.current = false

          const retryPayload = {
            type: 'user_message',
            content: text,
            metadata: {
              ...metadata,
              message_id: messageId,
              goal_id: 'master_chat',
              source: 'mac',
              user_id: user.email || user.uid,
            },
          }
          try {
            socket.send(JSON.stringify(retryPayload))
            setIsWaitingForResponse(true)
            _startResponseTimeout()
          } catch (err) {
            console.error('[WebSocket] Retry send failed:', err)
          }
        }
      }

      socket.onclose = (event) => {
        setIsConnected(false)
        wsRef.current = null

        // Retry if response hasn't started
        if (lastSentPayloadRef.current && !responseStartedRef.current) {
          const maxRetries = 3
          if (retryCountRef.current < maxRetries) {
            retryCountRef.current++
            const delaySeconds = 1 << (retryCountRef.current - 1)
            retryTimeoutRef.current = setTimeout(() => {
              connect()
            }, delaySeconds * 1000)
          } else {
            console.error('[WebSocket] Max retries exceeded')
            lastSentPayloadRef.current = null
            retryCountRef.current = 0
            setIsWaitingForResponse(false)
          }
        } else if (lastSentPayloadRef.current && responseStartedRef.current) {
          lastSentPayloadRef.current = null
          retryCountRef.current = 0
          responseStartedRef.current = false

          if (queuedMessageRef.current) {
            const queued = queuedMessageRef.current
            queuedMessageRef.current = null
            setHasQueuedMessage(false)
            setTimeout(() => sendMessage(queued.text, queued.metadata), 3000)
          }
        }

        disconnectTimeRef.current = Date.now()
      }

      socket.onerror = (error) => {
        console.error('WebSocket error:', error)
      }

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (ignoreStreamingRef.current) return

          // Debug: log every WS event so we can verify live streaming is firing
          // (toggle by setting window.__forfeit_ws_debug = false in dev console)
          if (typeof window !== 'undefined' && window.__forfeit_ws_debug !== false) {
            const _t = data.type
            if (_t === 'tool_result_display') {
              const p = data.data || data.action_json
              const po = typeof p === 'string' ? (() => { try { return JSON.parse(p) } catch { return {} } })() : (p || {})
              console.log('[WS]', _t, po.action, po.status)
            } else if (_t === 'agent_status') {
              console.log('[WS]', _t, data.label, '-', data.detail)
            } else if (_t === 'claude_delta') {
              // Keep quiet for delta spam - only log first one
              if (streamingMessageRef.current.length === 0) console.log('[WS] claude_delta (first)')
            } else {
              console.log('[WS]', _t)
            }
          }

          switch (data.type) {
            case 'message_received':
              responseStartedRef.current = true
              break

            case 'thinking_start':
              responseStartedRef.current = true
              setIsThinking(true)
              setThinkingText('')
              setIsWaitingForResponse(false)
              streamingMessageRef.current = ''
              setStreamingMessage('')
              break

            case 'thinking_delta':
              if (data.data) {
                setThinkingText((prev) => prev + data.data)
              }
              break

            case 'thinking_end':
              setIsThinking(false)
              break

            case 'claude_clear_stream':
              streamingMessageRef.current = ''
              setStreamingMessage('')
              rafPendingRef.current = false
              break

            case 'claude_delta':
              if (data.data) {
                const isFirstDelta = streamingMessageRef.current.length === 0
                responseStartedRef.current = true
                setIsWaitingForResponse(false)
                setIsProcessingAction(false)
                streamingMessageRef.current += data.data

                if (isFirstDelta) {
                  setStreamingMessage(streamingMessageRef.current)
                } else if (!rafPendingRef.current) {
                  rafPendingRef.current = true
                  requestAnimationFrame(() => {
                    rafPendingRef.current = false
                    setStreamingMessage(streamingMessageRef.current)
                  })
                }

                lastDeltaTimeRef.current = Date.now()
                if (pauseDetectionTimerRef.current) clearTimeout(pauseDetectionTimerRef.current)
                pauseDetectionTimerRef.current = setTimeout(() => {
                  if (streamingMessageRef.current.length > 0) {
                    setIsProcessingAction(true)
                  }
                }, 800)
              }
              break

            case 'claude_end_turn':
            case 'conversation_over': {
              lastSentPayloadRef.current = null
              retryCountRef.current = 0
              responseStartedRef.current = false
              if (responseTimeoutRef.current) clearTimeout(responseTimeoutRef.current)
              if (pauseDetectionTimerRef.current) clearTimeout(pauseDetectionTimerRef.current)
              setIsProcessingAction(false)
              setIsAgentRunning(false)

              if (streamingMessageRef.current) {
                setStreamingMessage(streamingMessageRef.current)
              }
              setIsResponseComplete(true)
              setIsWaitingForResponse(false)

              if (streamingCleanupTimeoutRef.current) clearTimeout(streamingCleanupTimeoutRef.current)
              streamingCleanupTimeoutRef.current = setTimeout(() => {
                streamingMessageRef.current = ''
                setStreamingMessage('')
                toolActivitiesRef.current = []
                setToolActivities([])
              }, 30000)

              if (queuedMessageRef.current) {
                const queued = queuedMessageRef.current
                queuedMessageRef.current = null
                setHasQueuedMessage(false)
                if (streamingCleanupTimeoutRef.current) {
                  clearTimeout(streamingCleanupTimeoutRef.current)
                  streamingCleanupTimeoutRef.current = null
                }
                setTimeout(() => sendMessage(queued.text, queued.metadata), 500)
              } else {
                try {
                  if (wsRef.current) {
                    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
                    const ws = wsRef.current
                    ws.onclose = null
                    ws.close()
                    wsRef.current = null
                    setIsConnected(false)
                  }
                } catch (e) {
                  console.error('[WebSocket] Error closing after end:', e)
                }
              }
              break
            }

            case 'tool_result_display': {
              const payload = data.data || data.action_json
              if (payload) {
                let actionObj = null
                if (typeof payload === 'string') {
                  try { actionObj = JSON.parse(payload) } catch { /* ignore */ }
                } else if (typeof payload === 'object') {
                  actionObj = payload
                }

                // Track tool activity for live streaming timeline (matches webapp)
                if (actionObj) {
                  const activity = {
                    name: actionObj.action || 'unknown',
                    status: actionObj.status === 'executing' ? 'executing' : 'completed',
                    kind: 'tool',
                    args: actionObj.args,
                    result: actionObj.result,
                    message: actionObj.message,
                    timestamp: Date.now(),
                  }
                  if (activity.status === 'executing') {
                    toolActivitiesRef.current = [...toolActivitiesRef.current, activity]
                  } else {
                    // Upgrade the matching "executing" entry to "completed"
                    const idx = toolActivitiesRef.current.findIndex(
                      (a) => a.name === activity.name && a.status === 'executing'
                    )
                    if (idx >= 0) {
                      const updated = [...toolActivitiesRef.current]
                      updated[idx] = {
                        ...updated[idx],
                        status: 'completed',
                        result: activity.result,
                        message: activity.message,
                        args: activity.args || updated[idx].args,
                      }
                      toolActivitiesRef.current = updated
                    } else {
                      toolActivitiesRef.current = [...toolActivitiesRef.current, activity]
                    }
                  }
                  setToolActivities([...toolActivitiesRef.current])
                }

                if (actionObj) {
                  const aName = actionObj.action || ''
                  const aStatus = actionObj.status || ''
                  if (isFinalAction(aName) && aStatus !== 'executing') {
                    const jsonText = typeof payload === 'string' ? payload : JSON.stringify(payload)
                    const actionJson = `\n[[ACTION_JSON:${jsonText}]]\n`
                    streamingMessageRef.current += actionJson
                    setStreamingMessage(streamingMessageRef.current)
                  }
                }
                setIsProcessingAction(false)
              }
              break
            }

            case 'agent_status': {
              // Pipeline status updates from O-Agent (routing, context loading, model call, etc.)
              const statusLabel = data.label || 'Status'
              const statusDetail = data.detail || ''
              const statusActivity = {
                name: statusLabel,
                status: 'completed',
                kind: 'status',
                detail: statusDetail,
                timestamp: Date.now(),
              }
              toolActivitiesRef.current = [...toolActivitiesRef.current, statusActivity]
              setToolActivities([...toolActivitiesRef.current])
              break
            }

            case 'error_display':
              console.error('Server error:', data.data)
              break

            default:
              break
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      wsRef.current = socket
    } catch (error) {
      console.error('[WebSocket] Failed to connect:', error)
    }
  }, [serverUrl, _startResponseTimeout])

  // Retry timeout ref (declared at top but used in connect)
  const retryTimeoutRef = useRef(null)

  // Ensure WebSocket is connected before sending
  const _ensureSocketReady = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return true

    const maxAttempts = 3
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await connect()

      const connected = await new Promise((resolve) => {
        const startTime = Date.now()
        const checkInterval = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            clearInterval(checkInterval)
            resolve(true)
          } else if (Date.now() - startTime > 5000) {
            clearInterval(checkInterval)
            resolve(false)
          }
        }, 100)
      })

      if (connected) return true

      if (attempt < maxAttempts - 1) {
        const delaySeconds = 1 << attempt
        await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000))
      }
    }

    console.error('[WebSocket] _ensureSocketReady failed after 3 attempts')
    return false
  }, [connect])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setIsConnected(false)
  }, [])

  const cancelQueuedMessage = useCallback(async () => {
    if (!queuedMessageRef.current) return
    queuedMessageRef.current = null
    setHasQueuedMessage(false)
  }, [])

  const clearStreaming = useCallback(() => {
    ignoreStreamingRef.current = true
    rafPendingRef.current = false

    if (pauseDetectionTimerRef.current) clearTimeout(pauseDetectionTimerRef.current)

    streamingMessageRef.current = ''
    setStreamingMessage('')
    setIsThinking(false)
    setThinkingText('')
    setIsWaitingForResponse(false)
    setIsResponseComplete(true)
    setIsProcessingAction(false)
    setIsAgentRunning(false)

    // Clear tool activities
    toolActivitiesRef.current = []
    setToolActivities([])

    lastSentPayloadRef.current = null
    retryCountRef.current = 0
    responseStartedRef.current = false
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
    if (responseTimeoutRef.current) clearTimeout(responseTimeoutRef.current)
    if (streamingCleanupTimeoutRef.current) clearTimeout(streamingCleanupTimeoutRef.current)

    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'stop_generation' }))
      }
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      const ws = wsRef.current
      ws.onclose = null
      ws.close()
      wsRef.current = null
      setIsConnected(false)
    }

    queuedMessageRef.current = null
    setHasQueuedMessage(false)
  }, [])

  const sendMessage = useCallback(async (text, metadata) => {
    const user = auth.currentUser
    if (!user) {
      console.error('No user available')
      return
    }

    const userId = user.email || user.uid

    // Queue if agent is busy
    const isAgentBusy = lastSentPayloadRef.current !== null
    if (isAgentBusy) {
      queuedMessageRef.current = { text, metadata }
      setHasQueuedMessage(true)
      return
    }

    // Clear previous streaming state
    streamingMessageRef.current = ''
    setStreamingMessage('')
    setIsResponseComplete(false)
    if (streamingCleanupTimeoutRef.current) {
      clearTimeout(streamingCleanupTimeoutRef.current)
      streamingCleanupTimeoutRef.current = null
    }

    let messageId = 'temp_' + Date.now()

    // Save to Firestore (respect visible_to_user from metadata, default true)
    const visibleToUser = metadata?.visible_to_user !== false
    try {
      const msgRef = await addDoc(
        collection(db, 'users', userId, 'Goals', 'master_chat', 'Messages'),
        {
          role: 'user',
          content: text,
          timestamp: serverTimestamp(),
          visible_to_user: visibleToUser,
          metadata: {
            ...metadata,
            source: 'mac',
          },
        }
      )
      messageId = msgRef.id
    } catch (error) {
      console.error('[WebSocket] Failed to save message to Firestore:', error)
    }

    // Ensure WebSocket is connected
    const socketReady = await _ensureSocketReady()

    if (socketReady && wsRef.current?.readyState === WebSocket.OPEN) {
      // Clear tool activities before sending new message (matches webapp)
      toolActivitiesRef.current = []
      setToolActivities([])
      setIsAgentRunning(true)

      ignoreStreamingRef.current = false

      const payload = {
        type: 'user_message',
        content: text,
        metadata: {
          ...metadata,
          message_id: messageId,
          goal_id: 'master_chat',
          source: 'mac',
          user_id: userId,
        },
      }
      setIsWaitingForResponse(true)
      setIsResponseComplete(false)

      wsRef.current.send(JSON.stringify(payload))
      lastSentPayloadRef.current = { text, metadata, messageId }
      retryCountRef.current = 0
      responseStartedRef.current = false
      _startResponseTimeout()
    } else {
      lastSentPayloadRef.current = { text, metadata, messageId }
      retryCountRef.current = 1
      responseStartedRef.current = false
      setIsWaitingForResponse(true)

      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      reconnectAttemptsRef.current = 0
      connect()
    }
  }, [_ensureSocketReady, connect, _startResponseTimeout])

  // Load server URL on mount
  useEffect(() => {
    const user = auth.currentUser
    if (user) {
      loadServerUrl()
    }
  }, [loadServerUrl])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
      if (responseTimeoutRef.current) clearTimeout(responseTimeoutRef.current)
      if (streamingCleanupTimeoutRef.current) clearTimeout(streamingCleanupTimeoutRef.current)
      if (wsRef.current) {
        const ws = wsRef.current
        ws.onclose = null
        ws.close()
        wsRef.current = null
      }
    }
  }, [])

  return {
    isConnected,
    streamingMessage,
    isThinking,
    thinkingText,
    isWaitingForResponse,
    isAgentRunning,
    isResponseComplete,
    isProcessingAction,
    toolActivities,
    sendMessage,
    connect,
    disconnect,
    clearStreaming,
    hasQueuedMessage,
    cancelQueuedMessage,
  }
}
