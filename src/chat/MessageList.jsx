import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, RefreshCw, Bot, Zap } from 'lucide-react'
import MessageBubble from './MessageBubble'
import { getToolConfig, isToolActionError, getToolShortDetail } from './IntermediateActionsGroup'

/**
 * Message list with Firestore listener, streaming bubble, thinking indicator.
 * Simplified from webapp's MessageList.tsx - no infinite scroll, no first message prompt,
 * no empty state bubbles. Just messages + streaming + scroll-to-bottom.
 */

function formatTimeHeader(timestamp) {
  if (!timestamp) return ''
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()

  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  if (isToday) return `Today, ${timeStr}`
  if (isYesterday) return `Yesterday, ${timeStr}`
  const dateStr = date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  return `${dateStr}, ${timeStr}`
}

/** Convert a streaming ToolActivity into an ActionData-shaped object so we can
 *  reuse getToolConfig / getToolShortDetail / isToolActionError from
 *  IntermediateActionsGroup. */
function toolActivityToActionData(tool) {
  let resultStatus
  let performAction
  if (tool.result) {
    try {
      const parsed = JSON.parse(tool.result)
      resultStatus = parsed?.status
      performAction = parsed?.perform_action
    } catch { /* not JSON */ }
  }
  return {
    type: tool.name,
    status: 'executed',
    data: {
      action: tool.name,
      result: tool.result,
      message: tool.message,
      args: tool.args,
      status: resultStatus,
      perform_action: performAction,
    },
  }
}

function CompletedToolRow({ tool, isLast }) {
  const actionData = toolActivityToActionData(tool)
  const config = getToolConfig(actionData)
  const Icon = config.icon
  const label = config.label
  const detail = getToolShortDetail(actionData)
  const isError = isToolActionError(actionData)
  const iconColor = 'var(--foreground)'

  return (
    <div style={{ display: 'flex', gap: 12, position: 'relative', fontFamily: 'Figtree' }}>
      {/* Circle column with connector line */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', width: 36 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            width: 36,
            height: 36,
            backgroundColor: 'var(--background)',
            border: isError ? '1px solid #ef4444' : '1px solid var(--border)',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <Icon style={{ width: 17, height: 17, color: isError ? '#ef4444' : iconColor }} />
        </div>
        {!isLast && (
          <div style={{
            width: 1,
            flex: 1,
            minHeight: 8,
            backgroundColor: 'var(--border)',
          }} />
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: 36 }}>
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 14, color: 'var(--foreground)', fontWeight: 500, fontFamily: 'Figtree' }}>
              {label}
            </span>
            {detail && (
              <span
                style={{
                  marginLeft: 6,
                  fontSize: 12,
                  color: isError ? '#ef4444' : 'var(--muted-foreground)',
                  opacity: isError ? 0.8 : 0.6,
                  fontFamily: 'Figtree',
                }}
              >
                ({detail})
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Live tool activity indicator + thinking fallback.
 *  Renders completed tools as a stacked timeline with an active row
 *  at the bottom (either the currently-executing tool or a
 *  pulsing "Thinking..." label). */
function StreamingActivityIndicator({ activities, fallbackLabel, thinkingText }) {
  const [elapsed, setElapsed] = useState(0)
  const prevLabelRef = useRef('')

  // Only show tool calls (not pipeline status events)
  const tools = (activities || []).filter((a) => a.kind !== 'status')
  const completedTools = tools.filter((t) => t.status === 'completed')
  const executingTool = tools.find((t) => t.status === 'executing')

  // Active label: executing tool name OR fallback ("Thinking...")
  let activeLabel
  if (executingTool) {
    const config = getToolConfig(toolActivityToActionData(executingTool))
    activeLabel = `${config.label}...`
  } else {
    activeLabel = (thinkingText && thinkingText.trim()) || fallbackLabel || 'Thinking...'
  }

  // Reset timer when the active label changes (new tool started)
  useEffect(() => {
    if (activeLabel !== prevLabelRef.current) {
      prevLabelRef.current = activeLabel
      setElapsed(0)
    }
  }, [activeLabel])

  // Tick every second
  useEffect(() => {
    const interval = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const iconColor = 'var(--foreground)'

  return (
    <div style={{ width: '100%', padding: '6px 0' }}>
      <div style={{ maxWidth: '768px', marginLeft: 'auto', marginRight: 'auto', paddingLeft: 20, paddingRight: 20 }}>
        {/* Completed tools - stacked rows above the active row */}
        {completedTools.map((tool, idx) => (
          <CompletedToolRow key={`${tool.name}-${tool.timestamp}-${idx}`} tool={tool} isLast={false} />
        ))}

        {/* Active row */}
        <div style={{ display: 'flex', gap: 12, position: 'relative' }}>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', width: 36 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                width: 36,
                height: 36,
                backgroundColor: 'var(--background)',
                border: '1px solid var(--border)',
                position: 'relative',
                zIndex: 1,
              }}
            >
              <Zap style={{ width: 17, height: 17, color: iconColor }} />
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="streaming-pulse"
              style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                height: 36,
                gap: 12,
                fontFamily: 'Figtree',
              }}
            >
              <span
                style={{
                  flex: 1,
                  textAlign: 'left',
                  fontSize: 14,
                  color: 'var(--foreground)',
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontFamily: 'Figtree',
                }}
              >
                {activeLabel}
              </span>
              <span
                style={{
                  flexShrink: 0,
                  fontSize: 12,
                  fontFamily: "'SF Mono', 'Menlo', monospace",
                  color: 'var(--muted-foreground)',
                  opacity: 0.5,
                }}
              >
                {elapsed}s
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function shouldShowTimeHeader(currentTimestamp, previousTimestamp) {
  if (!currentTimestamp) return false
  if (!previousTimestamp) return true // show header for the very first message
  const current = currentTimestamp.toDate ? currentTimestamp.toDate() : new Date(currentTimestamp)
  const previous = previousTimestamp.toDate ? previousTimestamp.toDate() : new Date(previousTimestamp)
  // Show header if date changes OR if more than 30 minutes apart
  if (current.toDateString() !== previous.toDateString()) return true
  const diffMs = Math.abs(current.getTime() - previous.getTime())
  return diffMs > 30 * 60 * 1000
}

export default function MessageList({
  messages,
  isLoading,
  streamingMessage,
  isThinking,
  thinkingText,
  isWaitingForResponse,
  isAgentRunning = false,
  isResponseComplete = false,
  isProcessingAction,
  toolActivities = [],
  onSendMessage,
  chatInput,
}) {
  const containerRef = useRef(null)
  const contentBottomRef = useRef(null)
  const isFirstRender = useRef(true)
  const isFollowingRef = useRef(true)

  const [showScrollToBottom, setShowScrollToBottom] = useState(false)

  // Helper: get content bottom position
  const getContentBottom = () => {
    return contentBottomRef.current
      ? contentBottomRef.current.offsetTop + contentBottomRef.current.offsetHeight
      : containerRef.current?.scrollHeight || 0
  }

  // Detect user scrolling away
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e) => {
      if (e.deltaY < 0) {
        isFollowingRef.current = false
      }
    }

    container.addEventListener('wheel', handleWheel, { passive: true })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [messages.length])

  // Scroll event for button visibility + re-engage following
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      const { scrollTop, clientHeight } = container
      const contentBottom = getContentBottom()
      const distFromContentBottom = contentBottom - scrollTop - clientHeight

      setShowScrollToBottom(distFromContentBottom > 300)

      if (distFromContentBottom < 100) {
        isFollowingRef.current = true
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [messages.length])

  // Scroll to bottom on first load
  useLayoutEffect(() => {
    if (!isFirstRender.current || messages.length === 0) return
    const container = containerRef.current
    if (!container) return

    isFirstRender.current = false
    const scrollToBottom = () => {
      if (!containerRef.current) return
      const contentBottom = getContentBottom()
      const target = Math.max(0, contentBottom - containerRef.current.clientHeight + 40)
      containerRef.current.scrollTop = target
    }

    scrollToBottom()
    setTimeout(scrollToBottom, 100)
    setTimeout(scrollToBottom, 500)
  }, [messages.length])

  // Reset first render flag when messages go from 0 to n
  useEffect(() => {
    if (messages.length > 0 && isFirstRender.current) {
      // Will be caught by the layout effect
    }
  }, [messages.length])

  // During streaming: follow content bottom
  useEffect(() => {
    const container = containerRef.current
    if (!container || !isFollowingRef.current) return

    const contentBottom = getContentBottom()
    const target = Math.max(0, contentBottom - container.clientHeight + 40)
    if (target > container.scrollTop) {
      container.scrollTop = target
    }
  }, [streamingMessage, isThinking, isWaitingForResponse])

  // New message scroll
  useEffect(() => {
    if (!isFollowingRef.current) return
    const container = containerRef.current
    if (!container) return

    requestAnimationFrame(() => {
      const contentBottom = getContentBottom()
      const target = Math.max(0, contentBottom - container.clientHeight + 40)
      container.scrollTo({ top: target, behavior: 'smooth' })
    })
  }, [messages.length])

  const handleScrollToBottom = () => {
    const container = containerRef.current
    if (!container) return
    const contentBottom = getContentBottom()
    const target = Math.max(0, contentBottom - container.clientHeight + 40)
    container.scrollTo({ top: target, behavior: 'smooth' })
    isFollowingRef.current = true
    setShowScrollToBottom(false)
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--text-tertiary)' }}>
        Loading messages...
      </div>
    )
  }

  // Empty state
  if (messages.length === 0 && !streamingMessage && !isThinking) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4" style={{ color: 'var(--text-tertiary)' }}>
        <Bot size={32} />
        <p className="text-sm">Send a message to start chatting</p>
        {chatInput && <div className="w-full max-w-lg px-4">{chatInput}</div>}
      </div>
    )
  }

  // Check if streaming should show (same logic as webapp)
  const reverseUserIdx = [...messages].reverse().findIndex(m => m.role === 'user')
  const lastUserIndex = reverseUserIdx >= 0 ? messages.length - 1 - reverseUserIdx : -1
  const recentAssistantMessages = lastUserIndex >= 0
    ? messages.slice(lastUserIndex + 1).filter(m => m.role === 'assistant')
    : messages.filter(m => m.role === 'assistant').slice(-3)

  const shouldShowStreaming = !!streamingMessage && recentAssistantMessages.length === 0

  return (
    <div className="flex-1 relative min-h-0">
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-y-auto pb-[80px]"
      >
        {messages.map((message, index) => {
          const previousMessage = index > 0 ? messages[index - 1] : null
          const showHeader = shouldShowTimeHeader(
            message.timestamp,
            previousMessage?.timestamp
          )

          return (
            <div key={message.id} data-message-role={message.role}>
              {/* Time header */}
              {showHeader && message.timestamp && (
                <div style={{ width: '100%', paddingTop: '16px', paddingBottom: '16px' }}>
                  <div style={{ maxWidth: '768px', marginLeft: 'auto', marginRight: 'auto', paddingLeft: '20px', paddingRight: '20px' }}>
                    <div style={{ textAlign: 'center' }}>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 500,
                          paddingLeft: '12px',
                          paddingRight: '12px',
                          paddingTop: '4px',
                          paddingBottom: '4px',
                          borderRadius: '9999px',
                          color: 'var(--text-tertiary)',
                          backgroundColor: 'var(--bg-tertiary)',
                        }}
                      >
                        {formatTimeHeader(message.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <MessageBubble
                message={message}
                onSendMessage={onSendMessage}
              />
            </div>
          )
        })}

        {/* Live tool activity + thinking indicator - matches webapp StreamingActionsIndicator.
            Visible while the agent is running OR while tool activity exists -
            this keeps the timeline alive across thinking -> tool-call -> streaming
            transitions so each tool appears live as it starts/completes. */}
        {(() => {
          if (recentAssistantMessages.length > 0) return null

          const isActivelyThinking = isThinking || isWaitingForResponse
          const hasTools = toolActivities.filter((a) => a.kind !== 'status').length > 0
          const hasExecutingTool = toolActivities.some(
            (a) => a.kind !== 'status' && a.status === 'executing'
          )
          const showToolsDuringStreaming = hasTools && shouldShowStreaming
          // Keep the indicator visible for the full agent run. Without this,
          // the indicator disappears during the gap between `thinking_end` and
          // the first `claude_delta`, hiding live tool_result_display rows.
          const isVisible =
            isActivelyThinking
            || isAgentRunning
            || isProcessingAction
            || hasExecutingTool
            || showToolsDuringStreaming
          if (!isVisible) return null

          // Use "Thinking..." only when no tools have run yet; otherwise no fallback
          const fallback = hasTools
            ? undefined
            : (isProcessingAction ? 'Taking action...' : 'Thinking...')

          return (
            <StreamingActivityIndicator
              activities={toolActivities}
              fallbackLabel={fallback}
              thinkingText={isActivelyThinking && !hasTools ? thinkingText : undefined}
            />
          )
        })()}

        {/* Streaming message */}
        {shouldShowStreaming && (
          <MessageBubble
            message={{
              id: 'streaming',
              role: 'assistant',
              content: streamingMessage,
              timestamp: null,
              visible_to_user: true,
            }}
            isStreaming
            onSendMessage={onSendMessage}
          />
        )}

        {/* Content bottom marker */}
        <div ref={contentBottomRef} className="h-px" />
      </div>

      {/* Scroll-to-bottom button */}
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          zIndex: 9999,
          pointerEvents: 'none',
          opacity: showScrollToBottom ? 1 : 0,
          transform: showScrollToBottom ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 200ms ease-out, transform 200ms ease-out',
        }}
      >
        <button
          onClick={handleScrollToBottom}
          style={{
            pointerEvents: 'auto',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            cursor: 'pointer',
          }}
        >
          <ArrowDown size={14} />
        </button>
      </div>

      {/* Keyframe animation */}
      <style>{`
        @keyframes chatPanePulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
