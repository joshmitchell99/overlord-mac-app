import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { parseActionsFromContent, isFinalAction } from './actionParser'
import ActionCard from './ActionCard'
import IntermediateActionsGroup from './IntermediateActionsGroup'
import { auth } from '../services/firebaseService'

/**
 * Individual message bubble component.
 * Simplified from webapp's MessageBubble.tsx - no admin features, no image/video loaders,
 * no debug pipeline, no focus sessions. Just text + actions + markdown.
 */

function formatFullTimestamp(timestamp) {
  if (!timestamp) return ''
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()

  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  if (isToday) return timeStr
  if (isYesterday) return `Yesterday ${timeStr}`
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${timeStr}`
}

export default function MessageBubble({ message, isStreaming, onSendMessage }) {
  const isUser = message.role === 'user'
  const [isHovered, setIsHovered] = useState(false)
  const metadata = message.metadata || {}

  // For user messages with media, use metadata.comment
  let displayContent = message.content
  const imagePaths = metadata.imagePaths || []
  const imageUrls = metadata.imageUrls || []
  const videoUrl = metadata.videoUrl
  const videoPath = metadata.videoPath || metadata.video_path
  if (isUser && (imagePaths.length > 0 || imageUrls.length > 0 || videoUrl || videoPath)) {
    displayContent = (metadata.comment || '').trim()
  }

  // Check for system message
  const isSystemMessage = displayContent.includes('[SYSTEM MESSAGE]')
  if (isSystemMessage) {
    displayContent = displayContent
      .replace(/\[SYSTEM MESSAGE\] - /g, '')
      .replace(/\[SYSTEM MESSAGE\]/g, '')
      .trim()
  }

  // Parse content for actions
  const { segments } = parseActionsFromContent(displayContent, message.metadata)

  // Goal tag
  const goalName = metadata.goalName
  const formatGoalName = (name) => {
    if (name === 'master_chat') return 'Master Chat'
    if (name === 'create_goal_chat') return 'Goal Creator'
    return name.replace(/\n/g, ', ').trim()
  }
  const prettyGoalName = goalName ? formatGoalName(goalName) : ''
  const showGoalTag = prettyGoalName &&
    prettyGoalName !== 'Master Chat' &&
    prettyGoalName !== 'Goal Creator' &&
    prettyGoalName !== 'tutorial_chat' &&
    prettyGoalName !== 'Tutorial Chat'

  // Notification reminders - render as compact system message
  if (metadata.type === 'notification_reminder') {
    return (
      <div style={{ width: '100%', padding: '6px 0' }}>
        <div style={{ maxWidth: '768px', marginLeft: 'auto', marginRight: 'auto', paddingLeft: '20px', paddingRight: '20px' }}>
          <div
            style={{ fontSize: '12px', padding: '8px 12px', borderRadius: '8px', backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}
          >
            Reminder check-in
          </div>
        </div>
      </div>
    )
  }

  // Mac onboarding kickoff - render as a branded pill instead of the raw system prompt.
  // Admins can click it to see the hidden system prompt that was sent.
  if (metadata.type === 'mac_onboarding') {
    const userEmail = auth?.currentUser?.email || ''
    const isAdmin = userEmail.endsWith('@forfeit.app') || userEmail.endsWith('@overlord.app')
    return (
      <MacOnboardingPill
        content={message.content}
        timestamp={message.timestamp}
        isAdmin={isAdmin}
        formatFullTimestamp={formatFullTimestamp}
      />
    )
  }

  // Collect intermediate vs final actions
  const allIntermediate = []
  segments.forEach((segment) => {
    if (segment.type === 'action' && segment.action) {
      const actionName = (segment.action.data?.action) || segment.action.type
      if (!isFinalAction(actionName, segment.action.data)) {
        allIntermediate.push(segment.action)
      }
    }
  })

  return (
    <div style={{ width: '100%', padding: '6px 0', position: 'relative' }}>
      <div style={{ maxWidth: '768px', marginLeft: 'auto', marginRight: 'auto', paddingLeft: '20px', paddingRight: '20px' }}>
        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div style={{ position: 'relative' }}>
            {/* Goal tag */}
            {showGoalTag && !isSystemMessage && (
              <div
                style={{ marginBottom: '8px', padding: '4px 8px', borderRadius: '8px', width: 'fit-content', backgroundColor: 'var(--muted)', border: '1px solid var(--border)' }}
              >
                <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--muted-foreground)' }}>
                  {prettyGoalName.length > 25 ? prettyGoalName.slice(0, 25) + '...' : prettyGoalName}
                </span>
              </div>
            )}

            {/* Intermediate actions - timeline view */}
            {allIntermediate.length > 0 && (
              <IntermediateActionsGroup actions={allIntermediate} />
            )}

            {/* Render segments */}
            {segments.map((segment, index) => {
              if (segment.type === 'text') {
                if (!segment.content.trim()) return null

                if (isSystemMessage) {
                  return (
                    <div
                      key={index}
                      style={{ fontSize: '12px', padding: '8px 12px', borderRadius: '8px', backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}
                    >
                      {segment.content}
                    </div>
                  )
                }

                if (isUser) {
                  return (
                    <div key={index} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <div
                        style={{
                          padding: '8px 12px',
                          width: 'fit-content',
                          fontSize: '14px',
                          backgroundColor: 'var(--user-message-bg)',
                          color: 'var(--user-message-text)',
                          border: '1px solid var(--user-message-border)',
                          borderTopLeftRadius: '12px',
                          borderTopRightRadius: '12px',
                          borderBottomRightRadius: '8px',
                          borderBottomLeftRadius: '12px',
                          whiteSpace: 'pre-wrap',
                          maxWidth: '80%',
                        }}
                      >
                        {segment.content}
                      </div>
                    </div>
                  )
                }

                return (
                  <div
                    key={index}
                    className={`max-w-none ${isStreaming ? 'streaming-prose' : ''}`}
                    style={{
                      color: 'var(--foreground)',
                      fontSize: '14px',
                      lineHeight: '1.6',
                    }}
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => <p style={{ margin: '0.5em 0' }}>{children}</p>,
                        ul: ({ children }) => <ul style={{ margin: '0.5em 0', paddingLeft: '1.5em', listStyle: 'disc' }}>{children}</ul>,
                        ol: ({ children }) => <ol style={{ margin: '0.5em 0', paddingLeft: '1.5em', listStyle: 'decimal' }}>{children}</ol>,
                        li: ({ children }) => <li style={{ margin: '0.25em 0' }}>{children}</li>,
                        strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
                        code: ({ children, className }) => {
                          const isBlock = className?.includes('language-')
                          if (isBlock) {
                            return (
                              <pre style={{
                                background: 'var(--muted)',
                                borderRadius: '8px',
                                padding: '12px',
                                overflow: 'auto',
                                margin: '0.5em 0',
                                fontSize: '13px',
                              }}>
                                <code style={{ fontFamily: "Monaco, 'Courier New', monospace" }}>{children}</code>
                              </pre>
                            )
                          }
                          return (
                            <code style={{
                              fontSize: '0.85em',
                              padding: '0.15em 0.4em',
                              borderRadius: '4px',
                              background: 'var(--muted)',
                              fontFamily: "Monaco, 'Courier New', monospace",
                            }}>{children}</code>
                          )
                        },
                        a: ({ children, href, ...props }) => (
                          <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#3B82F6', textDecoration: 'none' }} {...props}>{children}</a>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote style={{
                            borderLeft: '3px solid var(--border)',
                            paddingLeft: '12px',
                            color: 'var(--muted-foreground)',
                            margin: '0.5em 0',
                          }}>{children}</blockquote>
                        ),
                      }}
                    >
                      {segment.content}
                    </ReactMarkdown>
                  </div>
                )
              }

              if (segment.type === 'action' && segment.action) {
                const actionName = (segment.action.data?.action) || segment.action.type
                if (isFinalAction(actionName, segment.action.data)) {
                  return (
                    <div key={index} style={{ marginTop: '4px' }}>
                      <ActionCard action={segment.action} />
                    </div>
                  )
                }
                return null // Intermediate actions handled above
              }

              return null
            })}

            {/* Hover timestamp */}
            {message.timestamp && (
              <div
                style={{
                  marginTop: '4px',
                  textAlign: 'left',
                  transition: 'opacity 0.2s',
                  opacity: isHovered ? 1 : 0,
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    display: 'inline-block',
                    color: 'var(--muted-foreground)',
                    backgroundColor: 'var(--muted)',
                  }}
                >
                  {formatFullTimestamp(message.timestamp)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Mac onboarding pill + admin prompt modal ---

function MacOnboardingPill({ content, timestamp, isAdmin, formatFullTimestamp }) {
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      <div style={{ width: '100%', padding: '6px 0' }}>
        <div style={{ maxWidth: '768px', marginLeft: 'auto', marginRight: 'auto', paddingLeft: '20px', paddingRight: '20px', display: 'flex', justifyContent: 'flex-end' }}>
          <div
            onClick={isAdmin ? () => setShowModal(true) : undefined}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 12,
              background: 'linear-gradient(135deg, #3B82F6, #6366F1)',
              color: '#fff', fontSize: 13, fontWeight: 600,
              boxShadow: '0 4px 12px rgba(59,130,246,0.25)',
              maxWidth: '80%',
              cursor: isAdmin ? 'pointer' : 'default',
              transition: 'transform 0.1s, box-shadow 0.1s',
            }}
            onMouseEnter={(e) => {
              if (!isAdmin) return
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(59,130,246,0.35)'
            }}
            onMouseLeave={(e) => {
              if (!isAdmin) return
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(59,130,246,0.25)'
            }}
            title={isAdmin ? 'Click to view hidden system prompt' : undefined}
          >
            <div style={{
              width: 24, height: 24, borderRadius: 6,
              background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14,
            }}>
              {'\u{1F5A5}'}
            </div>
            <div>
              <div>Start Mac Onboarding</div>
              <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.9, marginTop: 2 }}>
                Let's set up your Mac blocking preferences
                {isAdmin && <span style={{ marginLeft: 6, opacity: 0.7 }}>- click to view</span>}
              </div>
            </div>
          </div>
        </div>
        {timestamp && (
          <div style={{ maxWidth: '768px', marginLeft: 'auto', marginRight: 'auto', paddingLeft: '20px', paddingRight: '20px', textAlign: 'right', marginTop: 4 }}>
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 4,
              color: 'var(--muted-foreground)', backgroundColor: 'var(--muted)',
            }}>
              {formatFullTimestamp(timestamp)}
            </span>
          </div>
        )}
      </div>

      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 680, width: '100%', maxHeight: '80vh',
              background: 'var(--bg-primary)',
              borderRadius: 12,
              border: '1px solid var(--border)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px',
              borderBottom: '1px solid var(--border)',
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Hidden system prompt
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  Admin-only - the actual text sent to the AI
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  border: 'none', background: 'var(--muted)',
                  width: 28, height: 28, borderRadius: 6, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-secondary)', fontSize: 14,
                }}
              >
                ✕
              </button>
            </div>
            <pre style={{
              margin: 0,
              padding: 18,
              overflow: 'auto',
              fontFamily: "'SF Mono', 'Menlo', monospace",
              fontSize: 12,
              lineHeight: 1.6,
              color: 'var(--text-primary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {content}
            </pre>
            <div style={{
              padding: '10px 18px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
            }}>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(content).catch(() => {})
                }}
                className="btn btn-ghost"
                style={{ fontSize: 12 }}
              >
                Copy
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="btn"
                style={{ fontSize: 12 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
