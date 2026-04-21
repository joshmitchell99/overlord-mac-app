import React, { useState, useEffect, useRef } from 'react'
import { ArrowUp, Square, Loader2 } from 'lucide-react'

/**
 * Chat input component for the Mac Electron app.
 * Simplified from webapp's ChatInput.tsx - no media uploads, no speech-to-text,
 * no screen recording, no admin long-press. Just text input + send/stop.
 */

export default function ChatInput({
  onSend,
  isWaitingForResponse = false,
  hasQueuedMessage = false,
  onCancelQueued,
  canQueue = false,
  onStop,
}) {
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const textareaRef = useRef(null)

  const hasText = message.trim().length > 0
  const isSendDisabled = (isWaitingForResponse && !canQueue) || hasQueuedMessage

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    if (!message) {
      textarea.style.height = '24px'
      textarea.style.overflowY = 'hidden'
      return
    }

    textarea.style.height = '24px'
    const newHeight = Math.min(textarea.scrollHeight, 200)
    textarea.style.height = `${newHeight}px`
    textarea.style.overflowY = textarea.scrollHeight > 200 ? 'auto' : 'hidden'
  }, [message])

  const handleSubmit = async (e) => {
    if (e) e.preventDefault()
    if (!message.trim() || isSending || isSendDisabled) return

    setIsSending(true)
    try {
      await onSend(message.trim())
      setMessage('')
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // Determine button state
  const isStop = isWaitingForResponse && !hasQueuedMessage && ((!hasText) || !canQueue)
  const isQueue = canQueue && hasText && !hasQueuedMessage
  const isSend = hasText && !isStop && !isQueue
  const isIdle = !hasText && !isStop
  const isDisabled = isIdle || (isSend && (isSending || isSendDisabled))

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full"
      style={{
        background: 'linear-gradient(transparent, var(--bg-primary) 20%)',
        paddingTop: '8px',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{ maxWidth: '768px', pointerEvents: 'auto', marginLeft: 'auto', marginRight: 'auto', paddingLeft: '7px', paddingRight: '7px', paddingBottom: '7px' }}
      >
        {/* Queued message banner */}
        {hasQueuedMessage && (
          <div
            className="flex items-center justify-between px-4 py-2 mb-1 rounded-xl text-xs"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: 'var(--warning)', animation: 'chatPanePulse 1.4s ease-in-out infinite' }}
              />
              <span>Message queued - will send when Overlord finishes</span>
            </div>
            <button
              type="button"
              onClick={onCancelQueued}
              className="text-xs font-medium hover:opacity-80 transition-opacity ml-3"
              style={{ color: 'var(--text-secondary)' }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Pill-shaped input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 8px 8px 18px',
            backgroundColor: 'var(--input-background)',
            border: '1px solid var(--border)',
            borderRadius: '26px',
            transition: 'all 0.2s ease-in-out',
            ...(isQueue && hasText ? { outline: '1.5px solid var(--warning)' } : {}),
          }}
        >
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isWaitingForResponse ? (canQueue ? 'Type to queue a message...' : 'Waiting for response...') : 'What do you want to do?'}
            rows={1}
            style={{
              flex: 1,
              resize: 'none',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--foreground)',
              height: '22px',
              lineHeight: '22px',
              overflowY: 'hidden',
              minHeight: '22px',
              maxHeight: '200px',
              fontFamily: 'inherit',
              fontSize: '13px',
              padding: 0,
              paddingTop: '2px',
              display: 'block',
            }}
          />

          <button
            type={isStop ? 'button' : 'submit'}
            disabled={!!isDisabled}
            onClick={isStop ? () => onStop?.() : undefined}
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              width: '30px',
              height: '30px',
              borderRadius: '15px',
              border: 'none',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              opacity: isDisabled ? 0.4 : 1,
              backgroundColor: isStop
                ? '#ef4444'
                : isQueue
                  ? '#f59e0b'
                  : hasText
                    ? '#0d0d0d'
                    : 'var(--bg-tertiary)',
              color: (isStop || isQueue || hasText) ? '#ffffff' : 'var(--text-tertiary)',
            }}
          >
            {isSending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : isStop ? (
              <Square size={10} fill="currentColor" />
            ) : (
              <ArrowUp size={14} strokeWidth={2.5} />
            )}
          </button>
        </div>

      </div>
    </form>
  )
}
