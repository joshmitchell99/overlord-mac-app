/**
 * OverlordChatWidget - reusable "Huge Statement" check-in chat UI.
 *
 * Renders:
 *   - Initial message as a massive headline
 *   - Stacked action buttons (primary/secondary/tertiary styled)
 *   - Chat follow-up thread (user messages + assistant replies with tool cards)
 *   - Reply input with send button
 *   - Optional "Continue in full chat" button after maxExchanges
 *
 * Usage:
 *   <OverlordChatWidget
 *     initialMessage={overlordResponse}
 *     initialActions={serverActions}
 *     quickReplies={['Lock me in for 1 hour', 'Lock me in for the rest of the day']}
 *     serverBase={serverBase}
 *     authToken={authToken}
 *     context={{ usage, today_usage, mac_instructions, current_app, current_time }}
 *     onSnooze={(mins) => ...}
 *     onDismiss={() => ...}
 *     onContinueFull={() => ...}
 *   />
 */

import React, { useState, useEffect, useRef } from 'react'
import { Shield, ShieldCheck, Ban, Send, Lock } from 'lucide-react'

const DEFAULT_QUICK_REPLIES = [
  'Lock me in for 1 hour',
  'Lock me in for the rest of the day',
]
const DEFAULT_MAX_EXCHANGES = 4

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Split an assistant message into main text + bullet suggestions. */
function parseBullets(text) {
  if (!text || typeof text !== 'string') return { main: text || '', bullets: [] }
  const parts = text.split(/(?:^|\n)\s*[•·‣]\s+|(?:^|\n)\s*[-*]\s+|\s[•·‣]\s+/)
    .map(s => s.trim())
    .filter(Boolean)
  if (parts.length < 2) return { main: text, bullets: [] }
  const [main, ...bullets] = parts
  return { main: main.replace(/[:.,\s]+$/, '').trim(), bullets }
}

/** Readable "what happened" label for a tool call result. */
function describeToolAction(ta) {
  if (typeof ta === 'string') return ta
  const tool = ta?.tool || ta?.name || ''
  const input = ta?.input || {}
  if (tool === 'edit_mac_list') {
    const listName = input.list_name || input.list || ''
    const addEntries = Array.isArray(input.add) ? input.add : []
    const removeEntries = Array.isArray(input.remove) ? input.remove : []
    const parts = []
    if (addEntries.length > 0) {
      const words = addEntries.map(e => (typeof e === 'string' ? e : e.word)).filter(Boolean)
      if (words.length > 0) parts.push(`Added ${words.join(', ')}${listName ? ` to ${listName}` : ''}`)
    }
    if (removeEntries.length > 0) {
      const words = removeEntries.map(e => (typeof e === 'string' ? e : e.word)).filter(Boolean)
      if (words.length > 0) parts.push(`Removed ${words.join(', ')}${listName ? ` from ${listName}` : ''}`)
    }
    if (parts.length > 0) return parts.join(' · ')
    return `Updated ${listName || 'list'}`
  }
  if (tool === 'grant_mac_unblock') {
    const app = input.app || input.word || 'app'
    const mins = input.duration_minutes || input.minutes
    return `Unblocked ${app}${mins ? ` for ${mins}m` : ''}`
  }
  return tool || 'Action taken'
}

/** Classify a button label/action for visual priority. */
function classifyItem(label, action) {
  if (action) {
    if (action.type === 'block' || action.type === 'lock_in') return 'primary'
    if (action.type === 'snooze' || action.type === 'dismiss') return 'tertiary'
    return 'secondary'
  }
  if (/lock me in|lock in|block|kill|cut/i.test(label)) return 'primary'
  if (/ask me again|snooze|dismiss/i.test(label)) return 'tertiary'
  return 'secondary'
}

// ---------------------------------------------------------------------------
// Main widget
// ---------------------------------------------------------------------------

export default function OverlordChatWidget({
  initialMessage = '',
  initialActions = [],
  quickReplies = DEFAULT_QUICK_REPLIES,
  serverBase = 'https://overlordserver.up.railway.app',
  endpoint = '/reassessment-chat',
  authToken = null,
  context = {},
  maxExchanges = DEFAULT_MAX_EXCHANGES,
  onSnooze,
  onDismiss,
  onContinueFull,
  // Visual
  headlineSize = 28,
  containerStyle,
}) {
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef(null)

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const userMessageCount = chatMessages.filter(m => m.role === 'user').length

  async function sendChat(overrideText) {
    const raw = typeof overrideText === 'string' ? overrideText : chatInput
    if (!raw.trim() || chatLoading) return
    const userMsg = raw.trim()
    if (typeof overrideText !== 'string') setChatInput('')
    const newMessages = [...chatMessages, { role: 'user', content: userMsg }]
    setChatMessages(newMessages)
    setChatLoading(true)

    try {
      const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }))
      const headers = { 'Content-Type': 'application/json' }
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`

      // Spread the whole context into the body so callers can pass endpoint-
      // specific fields (e.g. /blocking-chat needs app/matched_word/schedule).
      // Known defaults are preserved for back-compat with /reassessment-chat.
      const resp = await fetch(`${serverBase}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          usage: '',
          today_usage: '',
          mac_instructions: '',
          current_app: '',
          current_time: '',
          ...context,
          messages: apiMessages,
        }),
      })
      if (!resp.ok) throw new Error(`Server ${resp.status}`)
      const result = await resp.json()

      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: result.response || result.message || 'I understand.',
        actions: result.actions || [],
        tool_actions: result.tool_actions || [],
      }])
    } catch (err) {
      console.error('[OverlordChatWidget] Chat error:', err)
      const reason = !authToken
        ? "I'm not logged in right now - please reopen the app to re-auth."
        : `Connection failed: ${err.message}. Try again in a moment.`
      setChatMessages(prev => [...prev, {
        role: 'assistant', content: reason, actions: [], tool_actions: [],
      }])
    } finally {
      setChatLoading(false)
    }
  }

  // Primary/secondary/tertiary button styles
  const btnStyle = (kind) => ({
    width: '100%', textAlign: 'left',
    padding: kind === 'primary' ? '14px 16px' : '11px 14px',
    borderRadius: 10,
    border: kind === 'primary'
      ? '1px solid rgba(239,68,68,0.4)'
      : '1px solid rgba(255,255,255,0.08)',
    background: kind === 'primary'
      ? 'rgba(239,68,68,0.18)'
      : kind === 'tertiary'
        ? 'transparent'
        : 'rgba(255,255,255,0.06)',
    color: kind === 'primary' ? '#fff' : 'rgba(255,255,255,0.85)',
    fontSize: kind === 'primary' ? 15 : 13,
    fontWeight: kind === 'primary' ? 700 : 500,
    fontFamily: 'Figtree, sans-serif',
    cursor: chatLoading ? 'default' : 'pointer',
    opacity: chatLoading ? 0.5 : 1,
    display: 'flex', alignItems: 'center', gap: 10,
    transition: 'background 0.15s',
  })

  function handleActionClick(action, fallbackLabel) {
    // Snooze / dismiss run locally - everything else becomes a chat message
    if (action?.type === 'snooze') {
      onSnooze?.(action.minutes || 10)
      return
    }
    if (action?.type === 'dismiss') {
      onDismiss?.()
      return
    }
    sendChat(fallbackLabel)
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      background: 'rgba(0,0,0,0.25)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 14, padding: 16,
      ...containerStyle,
    }}>
      {/* Initial assistant message - Huge Statement */}
      {initialMessage && chatMessages.length === 0 && (() => {
        const { main, bullets } = parseBullets(initialMessage)
        const items = []
        for (const b of bullets) items.push({ kind: 'bullet', label: b })
        for (const q of quickReplies) items.push({ kind: 'bullet', label: q })
        for (const a of initialActions) items.push({ kind: 'action', action: a })

        return (
          <>
            <div style={{
              fontSize: headlineSize, lineHeight: 1.18, fontWeight: 700,
              color: '#fff', letterSpacing: -0.4, marginBottom: 8,
              fontFamily: 'Figtree, sans-serif',
            }}>
              {main}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map((it, i) => {
                const label = it.kind === 'action'
                  ? (it.action.type === 'block' && it.action.app ? `Block ${it.action.app}` : it.action.label)
                  : it.label
                const kind = classifyItem(label, it.kind === 'action' ? it.action : null)
                return (
                  <button key={`${it.kind}-${i}`}
                    onClick={() => handleActionClick(it.kind === 'action' ? it.action : null, label)}
                    disabled={chatLoading}
                    style={btnStyle(kind)}>
                    {kind === 'primary' && <Lock size={15} color="#ef4444" />}
                    {label}
                  </button>
                )
              })}
            </div>
          </>
        )
      })()}

      {/* Chat messages */}
      {chatMessages.map((msg, i) => {
        const parsed = msg.role === 'assistant' ? parseBullets(msg.content) : null
        const displayContent = parsed ? parsed.main : msg.content
        const msgBullets = parsed ? parsed.bullets : []
        const isLast = i === chatMessages.length - 1
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Message bubble */}
            <div style={{
              display: 'flex', gap: 10, alignItems: 'flex-start',
              flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
            }}>
              {msg.role === 'assistant' && (
                <div style={{
                  width: 24, height: 24, borderRadius: 12, flexShrink: 0,
                  background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Shield size={12} color="white" />
                </div>
              )}
              <div style={{
                padding: '8px 12px', borderRadius: 10, maxWidth: '80%',
                background: msg.role === 'user' ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.08)',
                border: msg.role === 'user' ? '1px solid rgba(59,130,246,0.3)' : '1px solid rgba(255,255,255,0.08)',
                fontSize: 13, color: 'white', lineHeight: 1.5, fontFamily: 'Figtree, sans-serif',
              }}>
                {displayContent}
              </div>
            </div>

            {/* Bullet suggestions from latest assistant message */}
            {msg.role === 'assistant' && isLast && msgBullets.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 34 }}>
                {msgBullets.map((b, j) => (
                  <button key={j}
                    onClick={() => sendChat(b)}
                    disabled={chatLoading}
                    style={{
                      border: '1px solid rgba(255,255,255,0.15)', borderRadius: 99,
                      padding: '5px 11px', fontSize: 11, fontWeight: 500,
                      color: 'rgba(255,255,255,0.9)', background: 'rgba(255,255,255,0.06)',
                      cursor: chatLoading ? 'default' : 'pointer',
                      fontFamily: 'Figtree, sans-serif',
                      textAlign: 'left', lineHeight: 1.3,
                      opacity: chatLoading ? 0.5 : 1,
                    }}>{b}</button>
                ))}
              </div>
            )}

            {/* Tool action cards */}
            {msg.role === 'assistant' && msg.tool_actions?.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 34 }}>
                {msg.tool_actions.map((ta, j) => {
                  const tool = ta?.tool || ta?.name || ''
                  const Icon = tool === 'grant_mac_unblock' ? ShieldCheck : Ban
                  const iconColor = tool === 'grant_mac_unblock' ? '#22c55e' : '#ef4444'
                  return (
                    <div key={j} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px',
                      background: 'rgba(0,0,0,0.35)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 12,
                      fontFamily: 'Figtree, sans-serif',
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        background: `${iconColor}15`,
                        border: `1px solid ${iconColor}30`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Icon size={14} color={iconColor} strokeWidth={2.2} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.95)', lineHeight: 1.3 }}>
                          {describeToolAction(ta)}
                        </div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2, letterSpacing: 0.3 }}>
                          {tool === 'grant_mac_unblock' ? 'Temporary unblock' : 'Blocking list updated'}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {/* Loading indicator - Shield avatar + three pulsing dots, styled to match
           an incoming assistant bubble so it's obviously "Overlord is thinking". */}
      {chatLoading && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{
            width: 24, height: 24, borderRadius: 12, flexShrink: 0,
            background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Shield size={12} color="white" />
          </div>
          <div style={{
            padding: '10px 14px', borderRadius: 10,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{
                width: 6, height: 6, borderRadius: 3,
                background: 'rgba(255,255,255,0.75)',
                animation: `overlord-think-pulse 1.2s ease-in-out ${i * 0.18}s infinite`,
              }} />
            ))}
          </div>
          <style>{`
            @keyframes overlord-think-pulse {
              0%, 80%, 100% { opacity: 0.35; transform: scale(0.9); }
              40% { opacity: 1; transform: scale(1.1); }
            }
          `}</style>
        </div>
      )}

      <div ref={chatEndRef} />

      {/* Continue in full chat (after max exchanges) or input */}
      {userMessageCount >= maxExchanges && onContinueFull ? (
        <button onClick={onContinueFull} style={{
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
          padding: '8px 14px', fontSize: 12, fontWeight: 500,
          color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.05)',
          cursor: 'pointer', fontFamily: 'Figtree, sans-serif', textAlign: 'center',
          marginTop: 8,
        }}>
          Continue in full chat
        </button>
      ) : (
        <div style={{
          display: 'flex', gap: 8, paddingTop: 6,
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <input
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 10,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'white', fontSize: 13, outline: 'none',
              fontFamily: 'Figtree, sans-serif',
            }}
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendChat()}
            placeholder="Reply to Overlord..."
            disabled={chatLoading}
          />
          <button style={{
            padding: '10px 14px', borderRadius: 10,
            background: chatInput.trim() ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(59,130,246,0.3)',
            color: 'white', cursor: 'pointer',
            display: 'flex', alignItems: 'center',
            opacity: chatInput.trim() ? 1 : 0.4,
          }} onClick={() => sendChat()} disabled={chatLoading}>
            <Send size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
