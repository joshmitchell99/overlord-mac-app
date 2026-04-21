import React, { useState, useEffect } from 'react'
import { Shield, Send, AlertTriangle, Lock, Ban, Clock, Zap,
  Globe, Activity, BarChart3, Eye, CheckCircle2, Circle,
  Gauge, AppWindow, Moon, Tag, Layers,
  MessageCircle, Sliders, Grid3x3, Search, LayoutDashboard,
  TrendingUp, Sun, Sunset, CalendarDays, Flame, Timer } from 'lucide-react'
import { doc as fsDoc, getDoc } from 'firebase/firestore'
import { subscribeToDailyData, subscribeToDailyStats, todayKey, formatDuration } from '../services/usageDataService'
import { extractWebsite, isBrowser } from '../services/websiteExtractor'
import { db, auth } from '../services/firebaseService'

// ============================================================================
// MOCK DATA - Check-in Quick Chat variations
// ============================================================================

const MOCK_MESSAGES = [
  "Come on. 12 minutes on X when your rules say it's distracting. Cut it.",
  "You're drifting. Instagram AND YouTube in 20 min? Lock in for an hour.",
  "8 minutes on Reddit. This isn't a 3-min unblock - you're spiraling. Kill it.",
]

const MOCK_BULLETS = [
  "Block X for 1 hour",
  "Lock me in for 1 hour",
  "Lock me in for rest of day",
  "Mark X as distracting",
  "Ask me again in 10 minutes",
]

// Map bullets to visual intent: primary = lock-in/block, secondary = softer
const BULLET_KIND = {
  "Block X for 1 hour": 'primary',
  "Lock me in for 1 hour": 'primary',
  "Lock me in for rest of day": 'primary',
  "Mark X as distracting": 'secondary',
  "Ask me again in 10 minutes": 'tertiary',
}

const log = (label) => () => console.log('[mock-click]', label)

// Shared dimmed backdrop to show how each variation sits on the real overlay bg
function DimmedBackdrop({ children }) {
  return (
    <div style={{
      background: 'linear-gradient(180deg, rgba(10,10,14,0.98) 0%, rgba(18,18,24,0.98) 100%)',
      borderRadius: 14,
      padding: 24,
      fontFamily: 'Figtree, sans-serif',
    }}>
      {children}
    </div>
  )
}

// Shared message rotator so user can see all three sample messages
function MessagePicker({ index, setIndex }) {
  return (
    <div style={{
      display: 'flex', gap: 6, marginBottom: 16,
      padding: 4, borderRadius: 8,
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.06)',
      width: 'fit-content',
    }}>
      {MOCK_MESSAGES.map((_, i) => (
        <button key={i} onClick={() => setIndex(i)} style={{
          padding: '4px 10px', fontSize: 11, fontWeight: 600,
          border: 'none', borderRadius: 5, cursor: 'pointer',
          background: index === i ? 'rgba(255,255,255,0.12)' : 'transparent',
          color: index === i ? '#fff' : 'rgba(255,255,255,0.5)',
          fontFamily: 'Figtree, sans-serif',
        }}>Msg {i + 1}</button>
      ))}
    </div>
  )
}

// ============================================================================
// VARIANT 1: Huge statement - massive headline, fat action buttons
// ============================================================================

function HugeStatement() {
  const [idx, setIdx] = useState(0)
  const message = MOCK_MESSAGES[idx]
  return (
    <div>
      <MessagePicker index={idx} setIndex={setIdx} />
      <DimmedBackdrop>
        {/* Tiny overline instead of avatar framing */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 10, fontWeight: 700, letterSpacing: 2,
          color: '#f59e0b', marginBottom: 14,
        }}>
          <Shield size={12} />
          OVERLORD SAYS
        </div>

        {/* Massive message */}
        <div style={{
          fontSize: 34, lineHeight: 1.15, fontWeight: 700,
          color: '#fff', letterSpacing: -0.6,
          marginBottom: 24, fontFamily: 'Figtree, sans-serif',
        }}>
          {message}
        </div>

        {/* Stacked action buttons - primary dominant */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {MOCK_BULLETS.map((b) => {
            const kind = BULLET_KIND[b]
            const isPrimary = kind === 'primary'
            const isTertiary = kind === 'tertiary'
            return (
              <button key={b} onClick={log(b)} style={{
                width: '100%', textAlign: 'left',
                padding: isPrimary ? '16px 18px' : '12px 16px',
                borderRadius: 10,
                border: isPrimary
                  ? '1px solid rgba(239,68,68,0.4)'
                  : '1px solid rgba(255,255,255,0.08)',
                background: isPrimary
                  ? 'rgba(239,68,68,0.18)'
                  : isTertiary
                    ? 'transparent'
                    : 'rgba(255,255,255,0.06)',
                color: isPrimary ? '#fff' : 'rgba(255,255,255,0.85)',
                fontSize: isPrimary ? 16 : 14,
                fontWeight: isPrimary ? 700 : 500,
                fontFamily: 'Figtree, sans-serif',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                {isPrimary && <Lock size={16} color="#ef4444" />}
                {b}
              </button>
            )
          })}
        </div>

        {/* Reply input */}
        <div style={{
          display: 'flex', gap: 8, marginTop: 16,
          paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <input placeholder="Or talk back..." style={{
            flex: 1, padding: '10px 14px', borderRadius: 8,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#fff', fontSize: 13, outline: 'none',
            fontFamily: 'Figtree, sans-serif',
          }} />
          <button onClick={log('send')} style={{
            padding: '10px 14px', borderRadius: 8,
            background: 'rgba(59,130,246,0.25)',
            border: '1px solid rgba(59,130,246,0.3)',
            color: '#fff', cursor: 'pointer',
          }}><Send size={14} /></button>
        </div>
      </DimmedBackdrop>

      <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: 'Figtree, sans-serif' }}>
        <strong style={{ color: '#fff' }}>Tradeoffs:</strong> Headline dominates - message lands hard. No avatar noise. Primary actions obviously bigger. Can feel aggressive if user isn't in the mood.
      </div>
    </div>
  )
}

// ============================================================================
// VARIANT 2: Overlord Says - big bubble + oversized shield avatar
// ============================================================================

function OverlordSays() {
  const [idx, setIdx] = useState(0)
  const message = MOCK_MESSAGES[idx]
  return (
    <div>
      <MessagePicker index={idx} setIndex={setIdx} />
      <DimmedBackdrop>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {/* Oversized shield avatar */}
          <div style={{
            width: 64, height: 64, borderRadius: 32, flexShrink: 0,
            background: 'radial-gradient(circle at 30% 30%, #fbbf24, #f59e0b 60%, #d97706)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 6px 24px rgba(245,158,11,0.35), inset 0 2px 0 rgba(255,255,255,0.3)',
          }}>
            <Shield size={32} color="#fff" strokeWidth={2.5} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: 2,
              color: 'rgba(255,255,255,0.5)', marginBottom: 4,
            }}>
              OVERLORD
            </div>

            {/* Big bubble */}
            <div style={{
              padding: '16px 20px', borderRadius: 18,
              borderTopLeftRadius: 4,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.1)',
              fontSize: 24, lineHeight: 1.3, fontWeight: 600,
              color: '#fff', fontFamily: 'Figtree, sans-serif',
            }}>
              {message}
            </div>
          </div>
        </div>

        {/* Chunky pill bullets below */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 8,
          marginTop: 16, paddingLeft: 80,
        }}>
          {MOCK_BULLETS.map((b) => {
            const kind = BULLET_KIND[b]
            const isPrimary = kind === 'primary'
            return (
              <button key={b} onClick={log(b)} style={{
                padding: isPrimary ? '10px 16px' : '8px 14px',
                borderRadius: 99,
                border: isPrimary
                  ? '1.5px solid #ef4444'
                  : '1px solid rgba(255,255,255,0.15)',
                background: isPrimary
                  ? 'rgba(239,68,68,0.2)'
                  : 'rgba(255,255,255,0.06)',
                color: isPrimary ? '#fff' : 'rgba(255,255,255,0.85)',
                fontSize: isPrimary ? 14 : 12,
                fontWeight: isPrimary ? 700 : 500,
                cursor: 'pointer',
                fontFamily: 'Figtree, sans-serif',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                {isPrimary && <Lock size={12} />}
                {b}
              </button>
            )
          })}
        </div>

        {/* Reply input */}
        <div style={{
          display: 'flex', gap: 8, marginTop: 16, paddingLeft: 80,
        }}>
          <input placeholder="Reply..." style={{
            flex: 1, padding: '10px 14px', borderRadius: 10,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#fff', fontSize: 13, outline: 'none',
            fontFamily: 'Figtree, sans-serif',
          }} />
          <button onClick={log('send')} style={{
            padding: '10px 14px', borderRadius: 10,
            background: 'rgba(59,130,246,0.25)',
            border: '1px solid rgba(59,130,246,0.3)',
            color: '#fff', cursor: 'pointer',
          }}><Send size={14} /></button>
        </div>
      </DimmedBackdrop>

      <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: 'Figtree, sans-serif' }}>
        <strong style={{ color: '#fff' }}>Tradeoffs:</strong> Comic-book intervention vibe. Shield avatar gives personality. Bigger bubble = message feels important. Uses more vertical space.
      </div>
    </div>
  )
}

// ============================================================================
// VARIANT 3: Split halves - giant dark block + vertical action stack
// ============================================================================

function SplitHalves() {
  const [idx, setIdx] = useState(0)
  const message = MOCK_MESSAGES[idx]
  const actionIcons = {
    "Block X for 1 hour": Ban,
    "Lock me in for 1 hour": Lock,
    "Lock me in for rest of day": Lock,
    "Mark X as distracting": AlertTriangle,
    "Ask me again in 10 minutes": Clock,
  }
  return (
    <div>
      <MessagePicker index={idx} setIndex={setIdx} />
      <DimmedBackdrop>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.1fr 1fr',
          gap: 0,
          borderRadius: 14, overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          {/* Left: dramatic dark block with shield + message */}
          <div style={{
            background: 'linear-gradient(155deg, rgba(24,16,8,0.95), rgba(10,10,14,0.95))',
            padding: 24,
            display: 'flex', flexDirection: 'column',
            gap: 14, minHeight: 280,
            borderRight: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 24,
              background: 'radial-gradient(circle at 30% 30%, #fbbf24, #f59e0b 60%, #d97706)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(245,158,11,0.4)',
            }}>
              <Shield size={24} color="#fff" strokeWidth={2.5} />
            </div>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: 2.5,
              color: '#f59e0b',
            }}>OVERLORD</div>
            <div style={{
              fontSize: 22, lineHeight: 1.25, fontWeight: 700,
              color: '#fff', fontFamily: 'Figtree, sans-serif',
            }}>
              {message}
            </div>
          </div>

          {/* Right: action stack */}
          <div style={{
            background: 'rgba(0,0,0,0.3)',
            padding: 14,
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            {MOCK_BULLETS.map((b) => {
              const kind = BULLET_KIND[b]
              const isPrimary = kind === 'primary'
              const isTertiary = kind === 'tertiary'
              const Icon = actionIcons[b] || Zap
              return (
                <button key={b} onClick={log(b)} style={{
                  width: '100%', textAlign: 'left',
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: isPrimary
                    ? '1px solid rgba(239,68,68,0.35)'
                    : '1px solid rgba(255,255,255,0.08)',
                  background: isPrimary
                    ? 'rgba(239,68,68,0.15)'
                    : isTertiary
                      ? 'rgba(255,255,255,0.03)'
                      : 'rgba(255,255,255,0.06)',
                  color: isPrimary ? '#fff' : 'rgba(255,255,255,0.8)',
                  fontSize: 13,
                  fontWeight: isPrimary ? 700 : 500,
                  fontFamily: 'Figtree, sans-serif',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <Icon size={14} color={isPrimary ? '#ef4444' : 'rgba(255,255,255,0.5)'} />
                  {b}
                </button>
              )
            })}
            <div style={{
              marginTop: 'auto', paddingTop: 8,
              borderTop: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', gap: 6,
            }}>
              <input placeholder="Talk back..." style={{
                flex: 1, padding: '8px 10px', borderRadius: 6,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#fff', fontSize: 12, outline: 'none',
                fontFamily: 'Figtree, sans-serif',
              }} />
              <button onClick={log('send')} style={{
                padding: '8px 10px', borderRadius: 6,
                background: 'rgba(59,130,246,0.25)',
                border: '1px solid rgba(59,130,246,0.3)',
                color: '#fff', cursor: 'pointer',
              }}><Send size={12} /></button>
            </div>
          </div>
        </div>
      </DimmedBackdrop>

      <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: 'Figtree, sans-serif' }}>
        <strong style={{ color: '#fff' }}>Tradeoffs:</strong> Feels like a lock-screen prompt. Message and actions are visually separate so user can scan both at once. Needs horizontal room - cramped on narrow overlays.
      </div>
    </div>
  )
}

// ============================================================================
// VARIANT 4: Ticker/marquee banner + hex grid actions
// ============================================================================

function TickerMarquee() {
  const [idx, setIdx] = useState(0)
  const message = MOCK_MESSAGES[idx]
  return (
    <div>
      <MessagePicker index={idx} setIndex={setIdx} />
      <DimmedBackdrop>
        {/* Banner with angry red top border */}
        <div style={{
          borderTop: '3px solid #ef4444',
          background: 'linear-gradient(180deg, rgba(239,68,68,0.12) 0%, rgba(239,68,68,0.03) 100%)',
          padding: '16px 20px',
          borderRadius: '0 0 10px 10px',
          marginBottom: 16,
          position: 'relative',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 10, fontWeight: 800, letterSpacing: 2,
            color: '#ef4444', marginBottom: 8,
          }}>
            <AlertTriangle size={12} />
            OVERLORD ALERT
            <div style={{
              marginLeft: 'auto', fontSize: 9,
              color: 'rgba(239,68,68,0.6)', fontWeight: 600,
              letterSpacing: 1,
            }}>NOW</div>
          </div>
          <div style={{
            fontSize: 20, lineHeight: 1.3, fontWeight: 700,
            color: '#fff', fontFamily: 'Figtree, sans-serif',
          }}>
            {message}
          </div>
        </div>

        {/* Grid of heavy rounded buttons */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 8,
        }}>
          {MOCK_BULLETS.map((b, i) => {
            const kind = BULLET_KIND[b]
            const isPrimary = kind === 'primary'
            const isTertiary = kind === 'tertiary'
            // Make the last (5th) button span both columns
            const isLast = i === MOCK_BULLETS.length - 1
            return (
              <button key={b} onClick={log(b)} style={{
                gridColumn: isLast ? 'span 2' : 'auto',
                padding: '14px 16px',
                borderRadius: 12,
                border: isPrimary
                  ? '1.5px solid rgba(239,68,68,0.45)'
                  : '1px solid rgba(255,255,255,0.1)',
                background: isPrimary
                  ? 'linear-gradient(180deg, rgba(239,68,68,0.22), rgba(239,68,68,0.1))'
                  : isTertiary
                    ? 'rgba(255,255,255,0.03)'
                    : 'rgba(255,255,255,0.06)',
                color: isPrimary ? '#fff' : 'rgba(255,255,255,0.85)',
                fontSize: isPrimary ? 14 : 13,
                fontWeight: isPrimary ? 700 : 600,
                fontFamily: 'Figtree, sans-serif',
                cursor: 'pointer',
                textAlign: 'center',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: isPrimary ? '0 4px 12px rgba(239,68,68,0.15)' : 'none',
              }}>
                {isPrimary && <Lock size={13} />}
                {b}
              </button>
            )
          })}
        </div>

        {/* Reply input */}
        <div style={{
          display: 'flex', gap: 8, marginTop: 14,
        }}>
          <input placeholder="Reply to Overlord..." style={{
            flex: 1, padding: '10px 14px', borderRadius: 10,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#fff', fontSize: 13, outline: 'none',
            fontFamily: 'Figtree, sans-serif',
          }} />
          <button onClick={log('send')} style={{
            padding: '10px 14px', borderRadius: 10,
            background: 'rgba(59,130,246,0.25)',
            border: '1px solid rgba(59,130,246,0.3)',
            color: '#fff', cursor: 'pointer',
          }}><Send size={14} /></button>
        </div>
      </DimmedBackdrop>

      <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: 'Figtree, sans-serif' }}>
        <strong style={{ color: '#fff' }}>Tradeoffs:</strong> Red border + "ALERT" label screams urgency without being a hard block. Grid gives equal weight to primary lock-in actions. "NOW" timestamp adds pressure.
      </div>
    </div>
  )
}

// ============================================================================
// VARIANT 5: Neon/warning - dark bg, glowing red/orange caps display font
// ============================================================================

function NeonWarning() {
  const [idx, setIdx] = useState(0)
  const message = MOCK_MESSAGES[idx]
  return (
    <div>
      <MessagePicker index={idx} setIndex={setIdx} />
      <div style={{
        background: '#05050a',
        borderRadius: 14,
        padding: 28,
        fontFamily: 'Figtree, sans-serif',
        border: '1px solid rgba(239,68,68,0.25)',
        boxShadow: '0 0 40px rgba(239,68,68,0.12), inset 0 0 80px rgba(239,68,68,0.04)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Subtle glow corner */}
        <div style={{
          position: 'absolute', top: -60, right: -60, width: 200, height: 200,
          background: 'radial-gradient(circle, rgba(239,68,68,0.18), transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: -80, left: -80, width: 240, height: 240,
          background: 'radial-gradient(circle, rgba(245,158,11,0.12), transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Header with pulsing dot */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18,
          position: 'relative',
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: 4,
            background: '#ef4444',
            boxShadow: '0 0 12px #ef4444, 0 0 24px rgba(239,68,68,0.5)',
          }} />
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: 3,
            color: '#ef4444',
            textShadow: '0 0 12px rgba(239,68,68,0.6)',
          }}>
            OVERLORD // INTERVENTION
          </div>
        </div>

        {/* Message in capitalized display */}
        <div style={{
          fontSize: 26, lineHeight: 1.25, fontWeight: 700,
          color: '#fff',
          textTransform: 'uppercase',
          letterSpacing: -0.3,
          fontFamily: 'Figtree, sans-serif',
          marginBottom: 8,
          textShadow: '0 0 20px rgba(245,158,11,0.3)',
          position: 'relative',
        }}>
          {message}
        </div>

        {/* Divider */}
        <div style={{
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(239,68,68,0.4), transparent)',
          margin: '20px 0',
          position: 'relative',
        }} />

        {/* Glowing-border buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, position: 'relative' }}>
          {MOCK_BULLETS.map((b) => {
            const kind = BULLET_KIND[b]
            const isPrimary = kind === 'primary'
            const isTertiary = kind === 'tertiary'
            return (
              <button key={b} onClick={log(b)} style={{
                padding: isPrimary ? '11px 18px' : '9px 14px',
                borderRadius: 8,
                border: isPrimary
                  ? '1px solid rgba(239,68,68,0.6)'
                  : isTertiary
                    ? '1px solid rgba(255,255,255,0.1)'
                    : '1px solid rgba(245,158,11,0.35)',
                background: isPrimary
                  ? 'rgba(239,68,68,0.12)'
                  : isTertiary
                    ? 'transparent'
                    : 'rgba(245,158,11,0.08)',
                color: isPrimary ? '#fff' : isTertiary ? 'rgba(255,255,255,0.6)' : '#fbbf24',
                fontSize: isPrimary ? 13 : 12,
                fontWeight: isPrimary ? 700 : 600,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                cursor: 'pointer',
                fontFamily: 'Figtree, sans-serif',
                boxShadow: isPrimary
                  ? '0 0 12px rgba(239,68,68,0.35), inset 0 0 12px rgba(239,68,68,0.1)'
                  : kind === 'secondary'
                    ? '0 0 8px rgba(245,158,11,0.15)'
                    : 'none',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                {isPrimary && <Lock size={12} />}
                {b}
              </button>
            )
          })}
        </div>

        {/* Reply input with glow */}
        <div style={{
          display: 'flex', gap: 8, marginTop: 20,
          position: 'relative',
        }}>
          <input placeholder="REPLY..." style={{
            flex: 1, padding: '10px 14px', borderRadius: 8,
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid rgba(239,68,68,0.2)',
            color: '#fff', fontSize: 12, outline: 'none',
            letterSpacing: 1,
            fontFamily: 'Figtree, sans-serif',
          }} />
          <button onClick={log('send')} style={{
            padding: '10px 14px', borderRadius: 8,
            background: 'rgba(239,68,68,0.2)',
            border: '1px solid rgba(239,68,68,0.5)',
            color: '#fff', cursor: 'pointer',
            boxShadow: '0 0 10px rgba(239,68,68,0.3)',
          }}><Send size={14} /></button>
        </div>
      </div>

      <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: 'Figtree, sans-serif' }}>
        <strong style={{ color: '#fff' }}>Tradeoffs:</strong> Fire-alarm aesthetic - dramatic but could be tiring if seen often. CAPS + glows make it undeniably attention-grabbing. Risk: user resents it fast if fired for minor drift.
      </div>
    </div>
  )
}

// ============================================================================
// SECTION 2: "What Overlord Knows From Your Mac" - 5 variants
// ============================================================================
//
// Each variant shows ONLY Mac-specific signals (current app, current site,
// classifications, daily totals, focus score, apps used). No goals, no chat,
// no memory, no phone/email stuff.
// ----------------------------------------------------------------------------

// Shared hook: subscribes to Firestore DailyStats + DailyData and listens to
// the electron IPC current-app stream. Returns a normalized object every
// variant can read from.
function useMacSnapshot() {
  const [dailyStats, setDailyStats] = useState(null)
  const [dailyData, setDailyData] = useState(null)
  const [currentApp, setCurrentApp] = useState(null)

  useEffect(() => {
    const day = todayKey()
    const unsubStats = subscribeToDailyStats(day, setDailyStats)
    const unsubData = subscribeToDailyData(day, setDailyData)
    return () => {
      if (typeof unsubStats === 'function') unsubStats()
      if (typeof unsubData === 'function') unsubData()
    }
  }, [])

  useEffect(() => {
    if (!window.electronAPI?.onAppStatusUpdate) return
    const cleanup = window.electronAPI.onAppStatusUpdate((update) => {
      if (update && update.app) setCurrentApp(update)
    })
    return cleanup
  }, [])

  // Derive top apps list from the apps map.
  const topApps = (() => {
    const apps = dailyData?.apps
    if (!apps) return []
    return Object.entries(apps)
      .map(([name, entry]) => ({ name, seconds: entry?.totalSeconds || 0, domain: entry?.domain || null }))
      .filter(a => a.seconds > 0)
      .sort((a, b) => b.seconds - a.seconds)
  })()

  // Current app is best-effort. Fall back to the top app for today if IPC is quiet.
  const appName = currentApp?.app || topApps[0]?.name || null
  const windowTitle = currentApp?.title || currentApp?.windowTitle || null
  const currentUrl = currentApp?.url || null
  const extractedSite = (() => {
    if (!appName) return null
    if (windowTitle) {
      const site = extractWebsite(appName, windowTitle)
      if (site) return site
    }
    // Fall back to the top app's cached domain if we don't have a live title.
    if (topApps[0] && topApps[0].domain && appName === topApps[0].name) {
      return topApps[0].domain
    }
    return null
  })()
  const isCurrentBrowser = appName ? isBrowser(appName) : false

  // Naive classification for display purposes only. Mirrors common cases so
  // the mockup shows something meaningful before the real classifier runs.
  const classification = (() => {
    if (!appName) return 'unknown'
    const a = appName.toLowerCase()
    const s = (extractedSite || '').toLowerCase()
    const distractingApps = ['messages', 'discord', 'slack', 'telegram']
    const distractingSites = ['reddit', 'twitter', 'x.com', 'youtube', 'tiktok', 'instagram', 'facebook']
    const productiveApps = ['xcode', 'cursor', 'visual studio code', 'code', 'terminal', 'iterm', 'figma', 'notion']
    if (distractingSites.some(d => s.includes(d))) return 'distracting'
    if (distractingApps.some(d => a.includes(d))) return 'distracting'
    if (productiveApps.some(p => a.includes(p))) return 'productive'
    return 'neutral'
  })()

  return {
    dailyStats,
    dailyData,
    topApps,
    appName,
    windowTitle,
    currentUrl,
    extractedSite,
    isCurrentBrowser,
    classification,
  }
}

function ClassificationBadge({ kind }) {
  const map = {
    productive: { bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.4)', color: '#22c55e', label: 'productive' },
    distracting: { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)', color: '#ef4444', label: 'distracting' },
    neutral: { bg: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.4)', color: 'var(--text-secondary)', label: 'neutral' },
    unknown: { bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.3)', color: 'var(--text-tertiary)', label: 'unknown' },
    blocked: { bg: 'rgba(239,68,68,0.2)', border: 'rgba(239,68,68,0.5)', color: '#ef4444', label: 'blocked' },
  }
  const s = map[kind] || map.unknown
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 6,
      background: s.bg,
      border: `1px solid ${s.border}`,
      color: s.color,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      fontFamily: 'Figtree, sans-serif',
    }}>{s.label}</span>
  )
}

function MacTradeoffs({ text }) {
  return (
    <div style={{
      marginTop: 10,
      padding: '8px 12px',
      borderRadius: 8,
      background: 'var(--bg-primary)',
      fontSize: 12,
      color: 'var(--text-secondary)',
      fontFamily: 'Figtree, sans-serif',
      border: '1px solid var(--border)',
    }}>
      <strong style={{ color: 'var(--text-primary)' }}>Tradeoffs:</strong> {text}
    </div>
  )
}

function MacCardShell({ variant, title, children }) {
  return (
    <div>
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 16,
        fontFamily: 'Figtree, sans-serif',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
        }}>
          <span style={{
            fontSize: 10, fontWeight: 800, letterSpacing: 1.5,
            color: 'var(--text-tertiary)', textTransform: 'uppercase',
          }}>{variant}</span>
          <span style={{
            width: 4, height: 4, borderRadius: 2, background: 'var(--text-tertiary)',
          }} />
          <span style={{
            fontSize: 13, fontWeight: 700, color: 'var(--text-primary)',
          }}>{title}</span>
        </div>
        {children}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Variant 1: Monitor window - a faux screen frame showing what Overlord "sees"
// ----------------------------------------------------------------------------
function MacVariantMonitor({ snap }) {
  const { appName, extractedSite, classification, isCurrentBrowser } = snap
  const focus = Math.round(snap.dailyStats?.focusScore || 0)
  const productive = snap.dailyStats?.productiveTimeSeconds || 0

  return (
    <MacCardShell variant="Variant 1" title="Monitor window">
      {/* Fake monitor bezel */}
      <div style={{
        background: '#0a0a0e',
        borderRadius: 12,
        padding: 14,
        border: '1px solid var(--border)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)',
      }}>
        {/* Traffic lights */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: 5, background: '#ef4444' }} />
          <span style={{ width: 10, height: 10, borderRadius: 5, background: '#f59e0b' }} />
          <span style={{ width: 10, height: 10, borderRadius: 5, background: '#22c55e' }} />
          <span style={{
            marginLeft: 'auto', fontSize: 10, color: 'rgba(255,255,255,0.4)',
            fontFamily: "'SF Mono', monospace", letterSpacing: 1,
          }}>LIVE</span>
        </div>

        {/* "Screen" content */}
        <div style={{
          background: 'linear-gradient(180deg, rgba(99,102,241,0.12), rgba(99,102,241,0.03))',
          borderRadius: 8,
          padding: 16,
          minHeight: 140,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Eye size={14} color="rgba(255,255,255,0.6)" />
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 2,
              color: 'rgba(255,255,255,0.55)',
            }}>CURRENTLY SEEING</span>
          </div>

          <div style={{
            fontSize: 26, fontWeight: 700, color: '#fff', lineHeight: 1.2,
          }}>
            {appName || 'No activity'}
            {extractedSite && (
              <>
                <span style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}> / </span>
                <span>{extractedSite}</span>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <ClassificationBadge kind={classification} />
            {isCurrentBrowser && (
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase',
                padding: '2px 8px', borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.15)',
              }}>browser</span>
            )}
          </div>

          <div style={{
            marginTop: 'auto', paddingTop: 8,
            borderTop: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', gap: 16,
            fontSize: 11, color: 'rgba(255,255,255,0.55)',
          }}>
            <span>Focus {focus}%</span>
            <span>Productive {formatDuration(productive)}</span>
          </div>
        </div>
      </div>
      <MacTradeoffs text="Feels voyeuristic in a purposeful way - user immediately gets that Overlord is literally watching. Heavy frame, takes real estate. Looks best when an app/site is active." />
    </MacCardShell>
  )
}

// ----------------------------------------------------------------------------
// Variant 2: Checklist / status lights
// ----------------------------------------------------------------------------
function MacVariantChecklist({ snap }) {
  const { appName, windowTitle, extractedSite, isCurrentBrowser, classification, topApps } = snap
  const focus = Math.round(snap.dailyStats?.focusScore || 0)

  const rows = [
    { label: 'Active app', ok: !!appName, value: appName || 'none' },
    { label: 'Window title', ok: !!windowTitle, value: windowTitle || 'not captured' },
    { label: 'Browser URL', ok: isCurrentBrowser, value: isCurrentBrowser ? (snap.currentUrl || 'visible') : 'not a browser' },
    { label: 'Extracted site', ok: !!extractedSite, value: extractedSite || 'n/a' },
    { label: 'Classification', ok: true, value: classification },
    { label: 'Apps today', ok: topApps.length > 0, value: `${topApps.length} tracked` },
    { label: 'Focus score', ok: focus > 0, value: `${focus}%` },
  ]

  return (
    <MacCardShell variant="Variant 2" title="Checklist / status lights">
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 0,
        borderRadius: 8, overflow: 'hidden',
        border: '1px solid var(--border)',
      }}>
        {rows.map((r, i) => (
          <div key={r.label} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px',
            background: i % 2 === 0 ? 'var(--bg-primary)' : 'transparent',
            borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            {r.ok
              ? <CheckCircle2 size={14} color="#22c55e" />
              : <Circle size={14} color="var(--text-tertiary)" />}
            <span style={{
              fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
              minWidth: 120,
            }}>{r.label}</span>
            <span style={{
              fontSize: 12, color: 'var(--text-secondary)',
              fontFamily: "'SF Mono', 'Menlo', monospace",
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              flex: 1,
            }}>{r.value}</span>
          </div>
        ))}
      </div>
      <div style={{
        marginTop: 10, fontSize: 11, color: 'var(--text-tertiary)',
      }}>
        Used to decide when to check in with you.
      </div>
      <MacTradeoffs text="Transparent and auditable - user sees exactly which signals are present vs missing. Feels more like a dashboard than a conversation. Less emotionally engaging." />
    </MacCardShell>
  )
}

// ----------------------------------------------------------------------------
// Variant 3: Narrative paragraph
// ----------------------------------------------------------------------------
function MacVariantNarrative({ snap }) {
  const { appName, extractedSite, classification, topApps } = snap
  const productive = snap.dailyStats?.productiveTimeSeconds || 0
  const active = snap.dailyStats?.activeTimeSeconds || 0
  const focus = Math.round(snap.dailyStats?.focusScore || 0)
  const appCount = topApps.length
  const topTwoProductive = topApps
    .filter(a => /code|cursor|terminal|figma|notion|xcode/i.test(a.name))
    .slice(0, 2)
    .map(a => a.name)
  const topDistracting = topApps
    .filter(a => /messages|discord|slack/i.test(a.name) || /reddit|twitter|youtube|tiktok/i.test(a.domain || ''))
    .slice(0, 1)[0]

  return (
    <MacCardShell variant="Variant 3" title="Narrative paragraph">
      <div style={{
        background: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 16,
        fontSize: 15,
        lineHeight: 1.6,
        color: 'var(--text-primary)',
      }}>
        Overlord has seen you use <strong>{appCount}</strong> app{appCount === 1 ? '' : 's'} today.
        You've been active for <strong>{formatDuration(active)}</strong>, with <strong>{formatDuration(productive)}</strong> of that classified as productive
        {topTwoProductive.length > 0 && <> (mostly <strong>{topTwoProductive.join(', ')}</strong>)</>}.
        Your focus score is <strong>{focus}%</strong>.
        {topDistracting && (
          <> It also logged <strong>{formatDuration(topDistracting.seconds)}</strong> on <strong>{topDistracting.name}</strong>.</>
        )}
        {appName && (
          <> Right now you're in <strong>{appName}</strong>
            {extractedSite && <> on <strong>{extractedSite}</strong></>}
            , which it considers <strong style={{
              color: classification === 'distracting' ? '#ef4444'
                : classification === 'productive' ? '#22c55e'
                : 'var(--text-primary)',
            }}>{classification}</strong>.
          </>
        )}
      </div>
      <div style={{
        marginTop: 10, fontSize: 11, color: 'var(--text-tertiary)',
        fontStyle: 'italic',
      }}>
        Overlord uses this to decide when to check in with you.
      </div>
      <MacTradeoffs text="Feels human and easy to skim. Great for onboarding or a user who wants a casual summary. Harder to pattern-match at a glance vs. a table or checklist." />
    </MacCardShell>
  )
}

// ----------------------------------------------------------------------------
// Variant 4: Raw JSON view - developer-style collapsed sections
// ----------------------------------------------------------------------------
function MacVariantJSON({ snap }) {
  const { appName, windowTitle, currentUrl, extractedSite, classification, isCurrentBrowser, topApps } = snap
  const stats = snap.dailyStats || {}

  const blocks = [
    {
      key: 'current_context',
      body: {
        app: appName || null,
        window_title: windowTitle || null,
        is_browser: isCurrentBrowser,
        url: currentUrl || null,
        extracted_site: extractedSite || null,
        classified_as: classification,
      },
    },
    {
      key: 'mac_daily_stats',
      body: {
        focus_score: Math.round(stats.focusScore || 0),
        active_seconds: stats.activeTimeSeconds || 0,
        productive_seconds: stats.productiveTimeSeconds || 0,
        afk_seconds: stats.afkTimeSeconds || 0,
      },
    },
    {
      key: 'mac_usage_today',
      body: topApps.slice(0, 8).reduce((acc, a) => {
        acc[a.name] = { total_seconds: a.seconds }
        return acc
      }, {}),
    },
  ]

  return (
    <MacCardShell variant="Variant 4" title="Raw JSON view">
      <div style={{
        background: '#0a0a0e',
        borderRadius: 8,
        padding: 14,
        fontFamily: "'SF Mono', 'Menlo', monospace",
        fontSize: 11,
        lineHeight: 1.55,
        color: '#d4d4d8',
        maxHeight: 360,
        overflow: 'auto',
        border: '1px solid var(--border)',
      }}>
        {blocks.map((b, i) => (
          <div key={b.key} style={{ marginBottom: i < blocks.length - 1 ? 14 : 0 }}>
            <div style={{
              color: '#a78bfa', fontWeight: 700, marginBottom: 4,
              letterSpacing: 0.5,
            }}>
              // {b.key}
            </div>
            <pre style={{
              margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              color: '#e4e4e7',
            }}>{JSON.stringify(b.body, null, 2)}</pre>
          </div>
        ))}
      </div>
      <div style={{
        marginTop: 10, fontSize: 11, color: 'var(--text-tertiary)',
        fontFamily: "'SF Mono', monospace",
      }}>
        // injected into the AI prompt on every message
      </div>
      <MacTradeoffs text="Engineer-friendly and transparent. Users who build their own rules get a mental model of what the LLM sees. Overwhelming for non-technical users." />
    </MacCardShell>
  )
}

// ----------------------------------------------------------------------------
// Variant 5: Icon grid - compact cards, one per signal
// ----------------------------------------------------------------------------
function MacVariantIconGrid({ snap }) {
  const { appName, extractedSite, classification, topApps, isCurrentBrowser } = snap
  const stats = snap.dailyStats || {}
  const topApp = topApps[0]

  const tiles = [
    {
      icon: AppWindow,
      label: 'Current app',
      value: appName || 'none',
      caption: isCurrentBrowser ? 'browser' : 'native',
    },
    {
      icon: Globe,
      label: 'Current site',
      value: extractedSite || '-',
      caption: extractedSite ? 'extracted from title' : 'no site',
    },
    {
      icon: Tag,
      label: 'Classified',
      value: classification,
      caption: 'based on app + site',
    },
    {
      icon: Gauge,
      label: 'Focus score',
      value: `${Math.round(stats.focusScore || 0)}%`,
      caption: 'today',
    },
    {
      icon: Activity,
      label: 'Active',
      value: formatDuration(stats.activeTimeSeconds || 0),
      caption: 'time tracked today',
    },
    {
      icon: BarChart3,
      label: 'Productive',
      value: formatDuration(stats.productiveTimeSeconds || 0),
      caption: 'focused work',
    },
    {
      icon: Moon,
      label: 'AFK',
      value: formatDuration(stats.afkTimeSeconds || 0),
      caption: 'away from keyboard',
    },
    {
      icon: Layers,
      label: 'Top app',
      value: topApp ? topApp.name : '-',
      caption: topApp ? formatDuration(topApp.seconds) : 'none yet',
    },
  ]

  return (
    <MacCardShell variant="Variant 5" title="Icon grid">
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 8,
      }}>
        {tiles.map((t) => {
          const Icon = t.icon
          return (
            <div key={t.label} style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 12,
              display: 'flex', flexDirection: 'column', gap: 4,
              minHeight: 96,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon size={13} color="var(--text-tertiary)" />
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                  color: 'var(--text-tertiary)', textTransform: 'uppercase',
                }}>{t.label}</span>
              </div>
              <div style={{
                fontSize: 16, fontWeight: 700,
                color: 'var(--text-primary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{t.value}</div>
              <div style={{
                fontSize: 10, color: 'var(--text-tertiary)', marginTop: 'auto',
              }}>{t.caption}</div>
            </div>
          )
        })}
      </div>
      <MacTradeoffs text="Scannable and neutral. Nothing dominates, so a user can glance at any signal. Downside: no narrative - everything feels equally important when some signals matter more." />
    </MacCardShell>
  )
}

function MacKnowledgeSection() {
  const snap = useMacSnapshot()
  return (
    <div style={{ marginTop: 40 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{
          fontSize: 22, fontWeight: 700, marginBottom: 4,
          color: 'var(--text-primary)',
        }}>
          What Overlord Knows From Your Mac (5 variants)
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Five takes on a widget that shows ONLY Mac activity signals:
          current app + site, classification, focus score, active/productive
          time, top apps today. Uses live Firestore data.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <MacVariantMonitor snap={snap} />
        <MacVariantChecklist snap={snap} />
        <MacVariantNarrative snap={snap} />
        <MacVariantJSON snap={snap} />
        <MacVariantIconGrid snap={snap} />
      </div>
    </div>
  )
}

// ============================================================================
// MAIN
// ============================================================================

const VARIANTS = [
  { key: 'huge', label: '1. Huge Statement', Component: HugeStatement },
  { key: 'overlord', label: '2. Overlord Says', Component: OverlordSays },
  { key: 'split', label: '3. Split Halves', Component: SplitHalves },
  { key: 'ticker', label: '4. Ticker Banner', Component: TickerMarquee },
  { key: 'neon', label: '5. Neon Warning', Component: NeonWarning },
]

export default function UIMockup() {
  const [variant, setVariant] = useState('huge')
  const Active = VARIANTS.find(v => v.key === variant).Component

  return (
    <div style={{ color: 'var(--text-primary)', fontFamily: 'Figtree, sans-serif' }}>
      <div style={{ maxWidth: 760 }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
            Check-in Quick Chat - Variations
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Five "more in-your-face" takes on the Quick Chat section from the
            reassessment check-in overlay. Pick a sample message inside each variant
            to see how it reads. Clicks log to the console - no actions fire.
          </div>
        </div>

        <div style={{
          display: 'flex', gap: 4, padding: 4, borderRadius: 10,
          background: 'var(--bg-tertiary)', marginBottom: 20, flexWrap: 'wrap',
        }}>
          {VARIANTS.map(v => (
            <button key={v.key} onClick={() => setVariant(v.key)} style={{
              flex: 1, padding: '8px 12px', fontSize: 12, fontWeight: 600,
              border: 'none', borderRadius: 6, cursor: 'pointer',
              background: variant === v.key ? 'var(--background)' : 'transparent',
              color: variant === v.key ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: variant === v.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              whiteSpace: 'nowrap', fontFamily: 'Figtree, sans-serif',
            }}>{v.label}</button>
          ))}
        </div>

        <div style={{ padding: 20, borderRadius: 12, background: 'var(--background)', border: '1px solid var(--border)' }}>
          <Active />
        </div>

        <MacKnowledgeSection />

        <MacUsagePlayground />

        <MacUsageAsk />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Interactive playground for the get_user_data("mac_usage", ...) tool.
//
// Mirrors the server-side tool in server/o_agent/tools/read_tools.py:_get_mac_usage_data
// reading the same Firestore paths in the same preference order:
//   1. users/{email}/Integrations/MacUsage/Sessions/{date}
//   2. users/{email}/Integrations/MacUsage/AppEvents/{date}
//   3. users/{email}/Integrations/MacUsage/DailyData/{date}  (fallback)
// plus DailyStats/{date} for the daily summary line (when no time filter).
//
// Produces the same plain-text output the O-Agent receives. Educates the user
// about what Overlord can actually see and lets them experiment with inputs.
// ---------------------------------------------------------------------------

function MacUsagePlayground() {
  const todayStr = () => new Date().toLocaleDateString('en-CA')
  const daysAgoStr = (n) => {
    const d = new Date()
    d.setDate(d.getDate() - n)
    return d.toLocaleDateString('en-CA')
  }

  // 5 example messages a user might send to Overlord, each translating into a
  // specific get_user_data("mac_usage", ...) call. The "call" column is what
  // the LLM would decide based on the message + today's date.
  const examples = React.useMemo(() => [
    {
      message: 'What apps have I used today?',
      call: { start_date: todayStr(), end_date: '', start_time: '', end_time: '' },
      note: 'Default - just today, all hours.',
    },
    {
      message: 'What did I do this morning?',
      call: { start_date: todayStr(), end_date: '', start_time: '06:00', end_time: '12:00' },
      note: 'Today, 6am to noon. Time window requires Sessions/AppEvents.',
    },
    {
      message: 'Was I productive this week?',
      call: { start_date: daysAgoStr(6), end_date: todayStr(), start_time: '', end_time: '' },
      note: '7 days. Daily stats + app totals per day.',
    },
    {
      message: 'How much time on social media yesterday?',
      call: { start_date: daysAgoStr(1), end_date: daysAgoStr(1), start_time: '', end_time: '' },
      note: 'Just yesterday. Agent would then grep the result for social apps.',
    },
    {
      message: 'What was I doing late last night?',
      call: { start_date: daysAgoStr(1), end_date: daysAgoStr(1), start_time: '22:00', end_time: '23:59' },
      note: 'Yesterday 10pm-midnight. Tests late-night time windows.',
    },
  ], [])

  const [startDate, setStartDate] = React.useState(todayStr())
  const [endDate, setEndDate] = React.useState('')
  const [startTime, setStartTime] = React.useState('')
  const [endTime, setEndTime] = React.useState('')
  const [output, setOutput] = React.useState('')
  const [running, setRunning] = React.useState(false)
  const [activeMsg, setActiveMsg] = React.useState(null)

  const callPreview = (() => {
    const parts = [`data_type="mac_usage"`, `start_date="${startDate || ''}"`]
    if (endDate) parts.push(`end_date="${endDate}"`)
    if (startTime) parts.push(`start_time="${startTime}"`)
    if (endTime) parts.push(`end_time="${endTime}"`)
    return `get_user_data(${parts.join(', ')})`
  })()

  function pickExample(ex) {
    setStartDate(ex.call.start_date)
    setEndDate(ex.call.end_date)
    setStartTime(ex.call.start_time)
    setEndTime(ex.call.end_time)
    setActiveMsg(ex.message)
    // Defer run so state settles.
    setTimeout(() => runQuery(ex.call), 0)
  }

  async function runQuery(override) {
    const p = override || { start_date: startDate, end_date: endDate, start_time: startTime, end_time: endTime }
    const email = auth.currentUser?.email
    if (!email) { setOutput('Not signed in.'); return }
    if (!p.start_date) { setOutput('start_date required.'); return }

    setRunning(true)
    try {
      const dates = expandDates(p.start_date, p.end_date || p.start_date)
      if (dates.error) { setOutput(dates.error); return }
      const hasTime = !!(p.start_time || p.end_time)
      const parts = []
      for (const ds of dates.list) {
        parts.push(await fetchOneDay(email, ds, p.start_time, p.end_time, hasTime))
      }
      setOutput(parts.join('\n\n'))
    } catch (err) {
      setOutput(`Error: ${err.message || err}`)
    } finally {
      setRunning(false)
    }
  }

  React.useEffect(() => {
    runQuery()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{
      marginTop: 24, padding: 20, borderRadius: 12,
      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'FigtreeBold, Figtree, sans-serif', color: 'var(--text-primary)' }}>
        get_user_data playground
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, marginBottom: 14, fontFamily: 'Figtree, sans-serif' }}>
        Live tool the O-Agent calls when it needs to look at your Mac. Pick an example or tweak inputs; the output is the exact text the agent would receive.
      </div>

      {/* Example chips */}
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-tertiary)', marginBottom: 6, fontFamily: 'Figtree, sans-serif' }}>
        Try a user message
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {examples.map((ex) => {
          const isActive = activeMsg === ex.message
          return (
            <button
              key={ex.message}
              onClick={() => pickExample(ex)}
              style={{
                padding: '8px 12px', borderRadius: 16,
                border: `1px solid ${isActive ? 'var(--text-primary)' : 'var(--border)'}`,
                background: isActive ? 'var(--text-primary)' : 'var(--bg-primary)',
                color: isActive ? 'var(--bg-primary)' : 'var(--text-primary)',
                fontSize: 12, cursor: 'pointer', fontFamily: 'Figtree, sans-serif',
              }}
            >
              "{ex.message}"
            </button>
          )
        })}
      </div>

      {/* Manual inputs */}
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-tertiary)', marginBottom: 6, fontFamily: 'Figtree, sans-serif' }}>
        Or craft a call
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) auto', gap: 8, marginBottom: 12 }}>
        <LabeledInput label="start_date" value={startDate} onChange={setStartDate} placeholder="YYYY-MM-DD" type="date" />
        <LabeledInput label="end_date" value={endDate} onChange={setEndDate} placeholder="optional" type="date" />
        <LabeledInput label="start_time" value={startTime} onChange={setStartTime} placeholder="HH:MM" type="time" />
        <LabeledInput label="end_time" value={endTime} onChange={setEndTime} placeholder="HH:MM" type="time" />
        <button
          onClick={() => runQuery()}
          disabled={running}
          style={{
            alignSelf: 'end', padding: '8px 14px', borderRadius: 8,
            background: 'var(--text-primary)', color: 'var(--bg-primary)',
            border: 'none', fontSize: 12, fontWeight: 600, cursor: running ? 'default' : 'pointer',
            fontFamily: 'Figtree, sans-serif', opacity: running ? 0.5 : 1,
          }}
        >
          {running ? 'Running...' : 'Run'}
        </button>
      </div>

      {/* Call preview */}
      <div style={{
        padding: 10, borderRadius: 6, background: 'var(--bg-primary)',
        border: '1px solid var(--border)', marginBottom: 10,
        fontFamily: "'SF Mono', Menlo, monospace", fontSize: 12, color: 'var(--text-secondary)',
        overflowX: 'auto', whiteSpace: 'nowrap',
      }}>
        {callPreview}
      </div>

      {/* Output */}
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-tertiary)', marginBottom: 6, fontFamily: 'Figtree, sans-serif' }}>
        What Overlord receives
      </div>
      <pre style={{
        margin: 0, padding: 12, borderRadius: 8,
        background: 'var(--bg-primary)', border: '1px solid var(--border)',
        fontFamily: "'SF Mono', Menlo, monospace", fontSize: 12,
        color: 'var(--text-primary)', whiteSpace: 'pre-wrap', maxHeight: 360, overflow: 'auto',
      }}>{output || (running ? 'Loading...' : 'No output yet. Pick an example or click Run.')}</pre>
    </div>
  )
}

function LabeledInput({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{
        fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5,
        color: 'var(--text-tertiary)', fontFamily: 'Figtree, sans-serif',
      }}>{label}</span>
      <input
        value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type={type}
        style={{
          padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)',
          background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 12,
          fontFamily: "'SF Mono', Menlo, monospace",
        }}
      />
    </label>
  )
}

// ---------- pure helpers below (no React) ----------

function fmtSecs(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${sec}s`
}

function expandDates(start, end) {
  const startD = new Date(`${start}T00:00:00`)
  const endD = new Date(`${end}T00:00:00`)
  if (isNaN(startD) || isNaN(endD)) return { error: 'Invalid date format.' }
  if (endD < startD) return { error: 'end_date before start_date.' }
  const diffDays = Math.floor((endD - startD) / (1000 * 60 * 60 * 24)) + 1
  if (diffDays > 14) return { error: 'Max range is 14 days.' }
  const list = []
  for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
    list.push(d.toLocaleDateString('en-CA'))
  }
  return { list }
}

async function fetchOneDay(email, date, startTime, endTime, hasTime) {
  const lines = []
  const windowLabel = hasTime ? ` (${startTime || '00:00'}-${endTime || '23:59'})` : ''
  lines.push(`--- ${date}${windowLabel} ---`)

  const basePath = ['users', email, 'Integrations', 'MacUsage']

  // DailyStats (only when no time filter)
  if (!hasTime) {
    try {
      const snap = await getDoc(fsDoc(db, ...basePath, 'DailyStats', date))
      if (snap.exists()) {
        const sd = snap.data()
        lines.push(
          `Daily Stats:\n  Focus Score: ${sd.focusScore || 0}%  |  Active: ${fmtSecs(sd.activeTimeSeconds)}  |  Productive: ${fmtSecs(sd.productiveTimeSeconds)}  |  AFK: ${fmtSecs(sd.afkTimeSeconds)}`
        )
      }
    } catch (_) { /* silent */ }
  }

  // 1. Try Sessions
  let matched = false
  try {
    const snap = await getDoc(fsDoc(db, ...basePath, 'Sessions', date))
    if (snap.exists()) {
      let sessions = snap.data()?.sessions || []
      if (startTime) sessions = sessions.filter(s => (s.start || '') >= startTime)
      if (endTime) sessions = sessions.filter(s => (s.start || '') <= endTime)
      if (sessions.length) {
        const byApp = {}
        for (const s of sessions) {
          const k = s.app || 'Unknown'
          byApp[k] = (byApp[k] || 0) + (s.duration || 0)
        }
        const sorted = Object.entries(byApp).sort((a, b) => b[1] - a[1])
        lines.push('App active time (from Sessions):')
        for (const [app, secs] of sorted) lines.push(`  ${app}: ${fmtSecs(secs)}`)
      } else {
        lines.push('  No Mac app sessions in this time window.')
      }
      matched = true
    }
  } catch (_) { /* try next */ }

  // 2. AppEvents fallback
  if (!matched) {
    try {
      const snap = await getDoc(fsDoc(db, ...basePath, 'AppEvents', date))
      if (snap.exists()) {
        let events = snap.data()?.events || []
        if (startTime) events = events.filter(e => (e.timeString || '') >= startTime)
        if (endTime) events = events.filter(e => (e.timeString || '') <= endTime)
        if (events.length) {
          lines.push(`App events: ${events.length} events (raw, duration computation not implemented in playground)`)
        } else {
          lines.push('  No Mac app events in this time window.')
        }
        matched = true
      }
    } catch (_) { /* try next */ }
  }

  // 3. DailyData fallback (this is what the React app writes)
  if (!matched) {
    try {
      const snap = await getDoc(fsDoc(db, ...basePath, 'DailyData', date))
      if (snap.exists()) {
        const apps = snap.data()?.apps || {}
        if (Object.keys(apps).length) {
          lines.push('App usage (total time, from DailyData):')
          const sorted = Object.entries(apps).sort((a, b) => (b[1]?.totalSeconds || 0) - (a[1]?.totalSeconds || 0))
          for (const [name, entry] of sorted) {
            const secs = entry?.totalSeconds || 0
            const dom = entry?.domain
            const label = dom ? `${name} (${dom})` : name
            lines.push(`  ${label}: ${fmtSecs(secs)}`)
          }
          if (hasTime) lines.push('  (Note: DailyData has no timestamps - time filter was ignored)')
        }
        matched = true
      }
    } catch (_) { /* ignore */ }
  }

  if (lines.length === 1) lines.push('  No Mac usage data.')
  return lines.join('\n')
}

// ============================================================================
// MAC USAGE ASK - 5 user-facing variants with tabs
// ============================================================================
//
// Presentation layer on top of the same Firestore paths as MacUsagePlayground,
// but rendered visually rather than as plain text. See fetchStructuredMacUsage
// for the shared data access layer.
// ============================================================================

// ---------- Structured fetcher (shared by all 5 variants) ----------

async function fetchStructuredMacUsage(email, params) {
  // params: { start_date, end_date?, start_time?, end_time? }
  const startDate = params.start_date
  const endDate = params.end_date || params.start_date
  const startTime = params.start_time || ''
  const endTime = params.end_time || ''
  const hasTime = !!(startTime || endTime)

  const expand = expandDates(startDate, endDate)
  if (expand.error) return { error: expand.error, days: [] }

  const basePath = ['users', email, 'Integrations', 'MacUsage']
  const days = []

  for (const date of expand.list) {
    const day = { date, stats: null, apps: [], source: 'none' }

    // DailyStats (only when no time filter)
    if (!hasTime) {
      try {
        const snap = await getDoc(fsDoc(db, ...basePath, 'DailyStats', date))
        if (snap.exists()) {
          const sd = snap.data()
          day.stats = {
            focusScore: sd.focusScore || 0,
            activeSeconds: sd.activeTimeSeconds || 0,
            productiveSeconds: sd.productiveTimeSeconds || 0,
            afkSeconds: sd.afkTimeSeconds || 0,
          }
        }
      } catch (_) { /* silent */ }
    }

    // 1. Sessions
    let matched = false
    try {
      const snap = await getDoc(fsDoc(db, ...basePath, 'Sessions', date))
      if (snap.exists()) {
        let sessions = snap.data()?.sessions || []
        if (startTime) sessions = sessions.filter(s => (s.start || '') >= startTime)
        if (endTime) sessions = sessions.filter(s => (s.start || '') <= endTime)
        if (sessions.length) {
          const byApp = {}
          for (const s of sessions) {
            const k = s.app || 'Unknown'
            byApp[k] = (byApp[k] || 0) + (s.duration || 0)
          }
          day.apps = Object.entries(byApp)
            .map(([name, totalSeconds]) => ({ name, totalSeconds }))
            .sort((a, b) => b.totalSeconds - a.totalSeconds)
          day.source = 'Sessions'
          day.sessions = sessions
        } else {
          day.source = 'Sessions'
          day.sessions = []
        }
        matched = true
      }
    } catch (_) { /* try next */ }

    // 2. AppEvents
    if (!matched) {
      try {
        const snap = await getDoc(fsDoc(db, ...basePath, 'AppEvents', date))
        if (snap.exists()) {
          let events = snap.data()?.events || []
          if (startTime) events = events.filter(e => (e.timeString || '') >= startTime)
          if (endTime) events = events.filter(e => (e.timeString || '') <= endTime)
          // Best effort: count events per app as a rough proxy - no duration computation here.
          const byApp = {}
          for (const e of events) {
            const k = e.app || 'Unknown'
            byApp[k] = (byApp[k] || 0) + 1
          }
          day.apps = Object.entries(byApp)
            .map(([name, count]) => ({ name, totalSeconds: count }))
            .sort((a, b) => b.totalSeconds - a.totalSeconds)
          day.source = 'AppEvents'
          matched = true
        }
      } catch (_) { /* try next */ }
    }

    // 3. DailyData
    if (!matched) {
      try {
        const snap = await getDoc(fsDoc(db, ...basePath, 'DailyData', date))
        if (snap.exists()) {
          const apps = snap.data()?.apps || {}
          day.apps = Object.entries(apps)
            .map(([name, entry]) => ({
              name,
              domain: entry?.domain,
              totalSeconds: entry?.totalSeconds || 0,
            }))
            .sort((a, b) => b.totalSeconds - a.totalSeconds)
          day.source = 'DailyData'
          matched = true
        }
      } catch (_) { /* ignore */ }
    }

    days.push(day)
  }

  return { days }
}

// ---------- Shared primitives ----------

function TabStrip({ tabs, active, onChange }) {
  return (
    <div style={{
      display: 'flex', gap: 4, borderBottom: '1px solid var(--border)',
      marginBottom: 18, fontFamily: 'Figtree, sans-serif',
    }}>
      {tabs.map(t => {
        const isActive = active === t.key
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            style={{
              padding: '10px 14px',
              border: 'none',
              background: 'transparent',
              color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
              fontWeight: isActive ? 700 : 500,
              fontSize: 13,
              cursor: 'pointer',
              position: 'relative',
              fontFamily: 'Figtree, sans-serif',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {t.icon ? <t.icon size={14} /> : null}
              {t.label}
            </span>
            {isActive && (
              <span style={{
                position: 'absolute', left: 8, right: 8, bottom: -1, height: 2,
                background: 'var(--text-primary)', borderRadius: 2,
              }} />
            )}
          </button>
        )
      })}
    </div>
  )
}

function KPITile({ label, value, caption, color }) {
  return (
    <div style={{
      flex: 1, minWidth: 110,
      padding: '14px 16px',
      borderRadius: 10,
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      fontFamily: 'Figtree, sans-serif',
    }}>
      <div style={{
        fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6,
        color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 600,
      }}>{label}</div>
      <div style={{
        fontSize: 24, fontWeight: 700, color: color || 'var(--text-primary)',
        fontFamily: 'Figtree, sans-serif',
      }}>{value}</div>
      {caption ? (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
          {caption}
        </div>
      ) : null}
    </div>
  )
}

function AppBar({ name, duration, maxSeconds, color }) {
  const pct = maxSeconds > 0 ? Math.max(3, Math.min(100, (duration / maxSeconds) * 100)) : 3
  const accent = color || 'var(--text-primary)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontFamily: 'Figtree, sans-serif' }}>
      <div style={{
        width: 130, fontSize: 13, color: 'var(--text-primary)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{name}</div>
      <div style={{
        flex: 1, height: 8, borderRadius: 4, background: 'var(--bg-tertiary)',
        overflow: 'hidden', position: 'relative',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%', background: accent,
          borderRadius: 4, transition: 'width 0.3s ease',
        }} />
      </div>
      <div style={{
        fontSize: 12, color: 'var(--text-secondary)',
        fontFamily: "'SF Mono', Menlo, monospace",
        minWidth: 58, textAlign: 'right',
      }}>{formatDuration(duration)}</div>
    </div>
  )
}

// ---------- Helpers scoped to this section ----------

const askTodayStr = () => new Date().toLocaleDateString('en-CA')
const askDaysAgoStr = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA')
}

function useStructuredMacUsage(params) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(null)

  // Serialize params to a stable string for dep array.
  const paramsKey = JSON.stringify(params)

  React.useEffect(() => {
    let cancelled = false
    const email = auth.currentUser?.email
    if (!email) {
      setData(null); setError('no-auth'); setLoading(false)
      return
    }
    if (!params?.start_date) return
    setLoading(true)
    setError(null)
    fetchStructuredMacUsage(email, params).then(res => {
      if (cancelled) return
      if (res.error) { setError(res.error); setData(null) }
      else setData(res)
      setLoading(false)
    }).catch(err => {
      if (cancelled) return
      setError(err.message || String(err)); setLoading(false)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey])

  return { data, loading, error }
}

function NoAuthMessage() {
  return (
    <div style={{
      padding: 20, borderRadius: 10,
      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      color: 'var(--text-secondary)', fontSize: 13, fontFamily: 'Figtree, sans-serif',
      textAlign: 'center',
    }}>
      Sign in to see your Mac activity.
    </div>
  )
}

function EmptyDayMessage({ text }) {
  return (
    <div style={{
      padding: 14, borderRadius: 8,
      background: 'var(--bg-secondary)', border: '1px dashed var(--border)',
      color: 'var(--text-tertiary)', fontSize: 12, fontFamily: 'Figtree, sans-serif',
      textAlign: 'center',
    }}>
      {text || 'No activity recorded for this day yet.'}
    </div>
  )
}

// ---------- Variant 1: Chat with Overlord ----------

const CHAT_PRESETS = [
  { id: 'today', label: 'What did I do today?', params: () => ({ start_date: askTodayStr() }) },
  { id: 'yesterday', label: 'Where did time go yesterday?', params: () => ({ start_date: askDaysAgoStr(1), end_date: askDaysAgoStr(1) }) },
  { id: 'morning', label: 'What did I do this morning?', params: () => ({ start_date: askTodayStr(), start_time: '06:00', end_time: '12:00' }) },
  { id: 'week', label: 'How was this week?', params: () => ({ start_date: askDaysAgoStr(6), end_date: askTodayStr() }) },
  { id: 'focus', label: 'Was I focused today?', params: () => ({ start_date: askTodayStr() }) },
]

const CANNED_RESPONSES = [
  'Here is what I can see. Your top apps are shown below.',
  'Let me dig into the data for that window.',
  'Pulling up the numbers now.',
  'Interesting question - here is what your Mac shows.',
]

function ChatVariant() {
  const email = auth.currentUser?.email
  const [messages, setMessages] = React.useState([])
  const [currentParams, setCurrentParams] = React.useState(null)
  const [typing, setTyping] = React.useState(false)
  const [inputText, setInputText] = React.useState('')
  const { data, loading } = useStructuredMacUsage(currentParams)

  if (!email) return <NoAuthMessage />

  function sendPreset(preset) {
    const params = preset.params()
    setMessages(m => [...m, { role: 'user', text: preset.label }])
    setCurrentParams(params)
    setTyping(true)
    setTimeout(() => {
      setMessages(m => [...m, { role: 'overlord', params, kind: 'data' }])
      setTyping(false)
    }, 400)
  }

  function sendFree() {
    const text = inputText.trim()
    if (!text) return
    const canned = CANNED_RESPONSES[Math.floor(Math.random() * CANNED_RESPONSES.length)]
    setMessages(m => [...m, { role: 'user', text }])
    setInputText('')
    // Default to today for free-form questions.
    const params = { start_date: askTodayStr() }
    setCurrentParams(params)
    setTyping(true)
    setTimeout(() => {
      setMessages(m => [...m, { role: 'overlord', params, kind: 'data', prelude: canned }])
      setTyping(false)
    }, 400)
  }

  return (
    <div style={{ fontFamily: 'Figtree, sans-serif' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {CHAT_PRESETS.map(p => (
          <button key={p.id} onClick={() => sendPreset(p)} style={{
            padding: '8px 12px', borderRadius: 16,
            border: '1px solid var(--border)',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontSize: 12, cursor: 'pointer', fontFamily: 'Figtree, sans-serif',
          }}>{p.label}</button>
        ))}
      </div>

      <div style={{
        minHeight: 220, padding: 16, borderRadius: 10,
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {messages.length === 0 && (
          <div style={{
            color: 'var(--text-tertiary)', fontSize: 13,
            textAlign: 'center', padding: 20,
          }}>
            Tap a question above to start the conversation.
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatBubble key={i} msg={msg} latestData={i === messages.length - 1 ? data : null} loading={loading && i === messages.length - 1} />
        ))}
        {typing && (
          <div style={{ alignSelf: 'flex-start', color: 'var(--text-tertiary)', fontSize: 12, fontStyle: 'italic' }}>
            Overlord is thinking...
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') sendFree() }}
          placeholder="Say something else..."
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 20,
            border: '1px solid var(--border)',
            background: 'var(--bg-primary)', color: 'var(--text-primary)',
            fontSize: 13, fontFamily: 'Figtree, sans-serif', outline: 'none',
          }}
        />
        <button onClick={sendFree} style={{
          padding: '10px 16px', borderRadius: 20,
          background: 'var(--text-primary)', color: 'var(--bg-primary)',
          border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'Figtree, sans-serif',
        }}>Send</button>
      </div>
    </div>
  )
}

function ChatBubble({ msg, latestData, loading }) {
  if (msg.role === 'user') {
    return (
      <div style={{ alignSelf: 'flex-end', maxWidth: '78%' }}>
        <div style={{
          padding: '8px 14px', borderRadius: 16, borderBottomRightRadius: 4,
          background: 'var(--text-primary)', color: 'var(--bg-primary)',
          fontSize: 13, fontFamily: 'Figtree, sans-serif',
        }}>{msg.text}</div>
      </div>
    )
  }
  // overlord
  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '88%' }}>
      <div style={{
        padding: '12px 14px', borderRadius: 16, borderBottomLeftRadius: 4,
        background: 'var(--bg-primary)', border: '1px solid var(--border)',
        color: 'var(--text-primary)', fontSize: 13, fontFamily: 'Figtree, sans-serif',
      }}>
        {loading || !latestData ? (
          <div style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
            Pulling your data...
          </div>
        ) : (
          <ChatAnswer data={latestData} prelude={msg.prelude} />
        )}
      </div>
    </div>
  )
}

function ChatAnswer({ data, prelude }) {
  const days = data?.days || []
  if (days.length === 0) return <div>No data yet.</div>
  // Sum across days
  const appMap = {}
  let totalActive = 0
  let totalProductive = 0
  let focusSum = 0
  let focusCount = 0
  for (const d of days) {
    for (const a of d.apps) {
      appMap[a.name] = (appMap[a.name] || 0) + (a.totalSeconds || 0)
    }
    if (d.stats) {
      totalActive += d.stats.activeSeconds || 0
      totalProductive += d.stats.productiveSeconds || 0
      if (d.stats.focusScore != null) { focusSum += d.stats.focusScore; focusCount += 1 }
    }
  }
  const topApps = Object.entries(appMap)
    .map(([name, totalSeconds]) => ({ name, totalSeconds }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds)
    .slice(0, 5)
  const max = topApps[0]?.totalSeconds || 0
  const avgFocus = focusCount > 0 ? Math.round(focusSum / focusCount) : null

  let headline = ''
  if (days.length === 1) {
    if (totalActive > 0) {
      headline = `Active ${formatDuration(totalActive)}, productive ${formatDuration(totalProductive)}${avgFocus != null ? `, focus ${avgFocus}/100` : ''}.`
    } else if (topApps.length > 0) {
      headline = `Top app was ${topApps[0].name} at ${formatDuration(topApps[0].totalSeconds)}.`
    } else {
      headline = 'No activity recorded for this window yet.'
    }
  } else {
    headline = `Across ${days.length} days - active ${formatDuration(totalActive)}${avgFocus != null ? `, avg focus ${avgFocus}/100` : ''}.`
  }

  return (
    <div>
      {prelude ? (
        <div style={{ color: 'var(--text-secondary)', marginBottom: 6, fontSize: 12 }}>{prelude}</div>
      ) : null}
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{headline}</div>
      {topApps.length > 0 ? (
        <div style={{ marginTop: 6 }}>
          {topApps.map(a => (
            <AppBar key={a.name} name={a.name} duration={a.totalSeconds} maxSeconds={max} />
          ))}
        </div>
      ) : (
        <EmptyDayMessage />
      )}
    </div>
  )
}

// ---------- Variant 2: Timeline Slider ----------

const TIMELINE_DAYS = [
  { id: 'today', label: 'Today', params: () => ({ start_date: askTodayStr() }) },
  { id: 'yesterday', label: 'Yesterday', params: () => ({ start_date: askDaysAgoStr(1), end_date: askDaysAgoStr(1) }) },
]

function TimelineVariant() {
  const email = auth.currentUser?.email
  const [dayId, setDayId] = React.useState('today')
  const [customDate, setCustomDate] = React.useState('')
  const [startHalfHour, setStartHalfHour] = React.useState(16) // 8:00
  const [endHalfHour, setEndHalfHour] = React.useState(36) // 18:00

  // Build params for the selected day only (no time filter - we filter client-side for the bar).
  const paramsDay = React.useMemo(() => {
    if (dayId === 'custom' && customDate) return { start_date: customDate, end_date: customDate }
    const preset = TIMELINE_DAYS.find(d => d.id === dayId)
    return preset ? preset.params() : { start_date: askTodayStr() }
  }, [dayId, customDate])

  const { data, loading } = useStructuredMacUsage(paramsDay)
  if (!email) return <NoAuthMessage />

  const startSec = startHalfHour * 1800
  const endSec = endHalfHour * 1800
  const startHHMM = halfHourToHHMM(startHalfHour)
  const endHHMM = halfHourToHHMM(endHalfHour)

  const day = data?.days?.[0]
  const hasSessions = day?.source === 'Sessions' && Array.isArray(day.sessions)

  // Filter sessions into window, compute apps in window.
  let appsInWindow = []
  let sessionsInWindow = []
  if (hasSessions) {
    sessionsInWindow = (day.sessions || []).filter(s => {
      const start = hhmmToSec(s.start || '00:00')
      return start >= startSec && start <= endSec
    })
    const byApp = {}
    for (const s of sessionsInWindow) {
      byApp[s.app || 'Unknown'] = (byApp[s.app || 'Unknown'] || 0) + (s.duration || 0)
    }
    appsInWindow = Object.entries(byApp)
      .map(([name, totalSeconds]) => ({ name, totalSeconds }))
      .sort((a, b) => b.totalSeconds - a.totalSeconds)
  } else if (day) {
    // Fall back to all apps for the day - no timestamps available.
    appsInWindow = day.apps.slice(0, 10)
  }

  const max = appsInWindow[0]?.totalSeconds || 0

  return (
    <div style={{ fontFamily: 'Figtree, sans-serif' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        {TIMELINE_DAYS.map(d => (
          <button key={d.id} onClick={() => setDayId(d.id)} style={dayButtonStyle(dayId === d.id)}>
            {d.label}
          </button>
        ))}
        <button onClick={() => setDayId('custom')} style={dayButtonStyle(dayId === 'custom')}>Pick a date</button>
        {dayId === 'custom' && (
          <input
            type="date" value={customDate} onChange={e => setCustomDate(e.target.value)}
            style={{
              padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 12,
              fontFamily: 'Figtree, sans-serif',
            }}
          />
        )}
      </div>

      <div style={{
        padding: 16, borderRadius: 10,
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8, fontWeight: 600,
        }}>
          <span>Window</span>
          <span style={{ fontFamily: "'SF Mono', Menlo, monospace", color: 'var(--text-primary)' }}>
            {startHHMM} - {endHHMM}
          </span>
        </div>

        {/* Dual range sliders */}
        <div style={{ position: 'relative', height: 36, marginBottom: 6 }}>
          <input
            type="range" min={0} max={48} step={1} value={startHalfHour}
            onChange={e => {
              const v = Math.min(Number(e.target.value), endHalfHour - 1)
              setStartHalfHour(v)
            }}
            style={timelineSliderStyle}
          />
          <input
            type="range" min={0} max={48} step={1} value={endHalfHour}
            onChange={e => {
              const v = Math.max(Number(e.target.value), startHalfHour + 1)
              setEndHalfHour(v)
            }}
            style={timelineSliderStyle}
          />
        </div>

        {/* Hour tick labels */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: 9, color: 'var(--text-tertiary)',
          fontFamily: "'SF Mono', Menlo, monospace",
        }}>
          {[0, 6, 12, 18, 24].map(h => <span key={h}>{String(h).padStart(2, '0')}:00</span>)}
        </div>

        {/* Timeline strip */}
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Active in window
          </div>
          {loading ? (
            <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Loading...</div>
          ) : hasSessions ? (
            <TimelineStrip sessions={sessionsInWindow} startSec={startSec} endSec={endSec} />
          ) : day ? (
            <div style={{
              padding: 10, borderRadius: 6, fontSize: 12,
              background: 'var(--bg-primary)', border: '1px dashed var(--border)',
              color: 'var(--text-tertiary)',
            }}>
              Only total time available - no timestamps in today's data.
            </div>
          ) : (
            <EmptyDayMessage />
          )}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Top apps {hasSessions ? 'in window' : 'for day'}
        </div>
        {appsInWindow.length === 0 ? (
          <EmptyDayMessage />
        ) : (
          appsInWindow.slice(0, 6).map(a => (
            <AppBar key={a.name} name={a.name} duration={a.totalSeconds} maxSeconds={max} />
          ))
        )}
      </div>
    </div>
  )
}

function TimelineStrip({ sessions, startSec, endSec }) {
  const range = Math.max(1, endSec - startSec)
  // Give each app a consistent color picked from a simple palette.
  const palette = ['#4F8EF7', '#F76D6D', '#F7B84F', '#7ED957', '#B885F7', '#EC66C4']
  const colorFor = (app) => {
    let hash = 0
    for (let i = 0; i < (app || '').length; i++) hash = (hash * 31 + app.charCodeAt(i)) | 0
    return palette[Math.abs(hash) % palette.length]
  }
  if (sessions.length === 0) {
    return (
      <div style={{
        height: 28, borderRadius: 6,
        background: 'var(--bg-primary)', border: '1px dashed var(--border)',
        color: 'var(--text-tertiary)', fontSize: 11,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        No sessions in this window.
      </div>
    )
  }
  return (
    <div style={{
      position: 'relative', height: 28, borderRadius: 6, overflow: 'hidden',
      background: 'var(--bg-primary)', border: '1px solid var(--border)',
    }}>
      {sessions.map((s, i) => {
        const start = hhmmToSec(s.start || '00:00')
        const duration = s.duration || 0
        const left = Math.max(0, ((start - startSec) / range) * 100)
        const width = Math.max(0.3, (duration / range) * 100)
        return (
          <div key={i} title={`${s.app}: ${s.start} (${formatDuration(duration)})`} style={{
            position: 'absolute', left: `${left}%`, top: 2, bottom: 2,
            width: `${width}%`, background: colorFor(s.app),
            borderRadius: 2, opacity: 0.85,
          }} />
        )
      })}
    </div>
  )
}

function dayButtonStyle(active) {
  return {
    padding: '8px 14px', borderRadius: 16,
    border: `1px solid ${active ? 'var(--text-primary)' : 'var(--border)'}`,
    background: active ? 'var(--text-primary)' : 'var(--bg-primary)',
    color: active ? 'var(--bg-primary)' : 'var(--text-primary)',
    fontSize: 12, cursor: 'pointer', fontFamily: 'Figtree, sans-serif',
  }
}

const timelineSliderStyle = {
  position: 'absolute', left: 0, right: 0, top: 0,
  width: '100%', height: 36, appearance: 'none',
  background: 'transparent', pointerEvents: 'auto',
}

function halfHourToHHMM(n) {
  const h = Math.floor(n / 2)
  const m = (n % 2) * 30
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function hhmmToSec(hhmm) {
  const [h, m] = (hhmm || '00:00').split(':').map(Number)
  return (h || 0) * 3600 + (m || 0) * 60
}

// ---------- Variant 3: Question Cards ----------

function CardsVariant() {
  const email = auth.currentUser?.email
  const [expanded, setExpanded] = React.useState(null)

  const paramsToday = React.useMemo(() => ({ start_date: askTodayStr() }), [])
  const paramsYesterday = React.useMemo(() => ({ start_date: askDaysAgoStr(1), end_date: askDaysAgoStr(1) }), [])
  const paramsWeek = React.useMemo(() => ({ start_date: askDaysAgoStr(6), end_date: askTodayStr() }), [])

  const today = useStructuredMacUsage(paramsToday)
  const yesterday = useStructuredMacUsage(paramsYesterday)
  const week = useStructuredMacUsage(paramsWeek)

  if (!email) return <NoAuthMessage />

  const cards = [
    { id: 'focus', icon: Gauge, title: 'How productive today?', subtitle: 'Focus score gauge' },
    { id: 'top', icon: BarChart3, title: 'Top time sinks', subtitle: 'Top 5 apps today' },
    { id: 'split', icon: Sun, title: 'Morning vs afternoon', subtitle: 'AM / PM split' },
    { id: 'delta', icon: TrendingUp, title: 'Today vs yesterday', subtitle: 'Deltas and trends' },
    { id: 'longest', icon: Timer, title: 'Longest apps', subtitle: 'Sorted duration list' },
    { id: 'week', icon: Flame, title: 'This week', subtitle: '7-day focus heatmap' },
  ]

  return (
    <div style={{ fontFamily: 'Figtree, sans-serif' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10,
      }}>
        {cards.map(c => (
          <QuestionCard
            key={c.id}
            card={c}
            expanded={expanded === c.id}
            onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
            today={today}
            yesterday={yesterday}
            week={week}
          />
        ))}
      </div>
    </div>
  )
}

function QuestionCard({ card, expanded, onToggle, today, yesterday, week }) {
  const Icon = card.icon
  return (
    <div
      style={{
        padding: 14, borderRadius: 10,
        background: 'var(--bg-secondary)', border: `1px solid ${expanded ? 'var(--text-primary)' : 'var(--border)'}`,
        cursor: 'pointer', transition: 'border 0.2s ease',
        gridColumn: expanded ? '1 / -1' : 'auto',
      }}
      onClick={onToggle}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8,
          background: 'var(--bg-tertiary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-primary)',
        }}>
          <Icon size={18} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{card.title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{card.subtitle}</div>
        </div>
      </div>
      <div style={{
        maxHeight: expanded ? 2000 : 0, overflow: 'hidden',
        transition: 'max-height 0.35s ease',
      }}>
        <div style={{ marginTop: expanded ? 14 : 0 }}>
          {expanded && <CardContent id={card.id} today={today} yesterday={yesterday} week={week} />}
        </div>
      </div>
    </div>
  )
}

function CardContent({ id, today, yesterday, week }) {
  if (id === 'focus') {
    const stats = today.data?.days?.[0]?.stats
    if (!stats) return <EmptyDayMessage />
    const score = stats.focusScore || 0
    return (
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <FocusGauge score={score} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Focus score is a weighted measure of active vs distracted time.
          </div>
          <KPITile label="Productive" value={formatDuration(stats.productiveSeconds)} caption={`of ${formatDuration(stats.activeSeconds)} active`} />
        </div>
      </div>
    )
  }
  if (id === 'top') {
    const apps = today.data?.days?.[0]?.apps || []
    if (apps.length === 0) return <EmptyDayMessage />
    const top = apps.slice(0, 5)
    const max = top[0]?.totalSeconds || 0
    return <div>{top.map(a => <AppBar key={a.name} name={a.name} duration={a.totalSeconds} maxSeconds={max} />)}</div>
  }
  if (id === 'split') {
    // Need sessions to split AM/PM precisely. Fall back to DailyData (which gives total, not split).
    const day = today.data?.days?.[0]
    if (!day) return <EmptyDayMessage />
    if (day.source === 'Sessions' && Array.isArray(day.sessions)) {
      let am = 0, pm = 0
      for (const s of day.sessions) {
        const h = Number((s.start || '00:00').split(':')[0] || 0)
        if (h < 12) am += s.duration || 0
        else pm += s.duration || 0
      }
      const max = Math.max(am, pm, 1)
      return (
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, padding: 14, borderRadius: 10, background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: 'var(--text-tertiary)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>
              <Sun size={12} /> Morning
            </div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{formatDuration(am)}</div>
            <div style={{ height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, marginTop: 8, overflow: 'hidden' }}>
              <div style={{ width: `${(am / max) * 100}%`, height: '100%', background: 'var(--text-primary)' }} />
            </div>
          </div>
          <div style={{ flex: 1, padding: 14, borderRadius: 10, background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: 'var(--text-tertiary)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>
              <Sunset size={12} /> Afternoon
            </div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{formatDuration(pm)}</div>
            <div style={{ height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, marginTop: 8, overflow: 'hidden' }}>
              <div style={{ width: `${(pm / max) * 100}%`, height: '100%', background: 'var(--text-primary)' }} />
            </div>
          </div>
        </div>
      )
    }
    return (
      <div style={{
        padding: 10, borderRadius: 6, fontSize: 12,
        background: 'var(--bg-primary)', border: '1px dashed var(--border)',
        color: 'var(--text-tertiary)',
      }}>
        AM/PM split needs session timestamps. Only total time is available today.
      </div>
    )
  }
  if (id === 'delta') {
    const t = today.data?.days?.[0]?.stats
    const y = yesterday.data?.days?.[0]?.stats
    if (!t || !y) return <EmptyDayMessage text="Need today and yesterday's stats for comparison." />
    const dActive = (t.activeSeconds || 0) - (y.activeSeconds || 0)
    const dProd = (t.productiveSeconds || 0) - (y.productiveSeconds || 0)
    const dFocus = (t.focusScore || 0) - (y.focusScore || 0)
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <DeltaTile label="Active" value={dActive} formatter={formatDuration} />
        <DeltaTile label="Productive" value={dProd} formatter={formatDuration} />
        <DeltaTile label="Focus" value={dFocus} formatter={(v) => `${v > 0 ? '+' : ''}${v}`} suffix="/100" />
      </div>
    )
  }
  if (id === 'longest') {
    const apps = today.data?.days?.[0]?.apps || []
    if (apps.length === 0) return <EmptyDayMessage />
    return (
      <div>
        {apps.slice(0, 10).map((a, i) => (
          <div key={a.name} style={{
            display: 'flex', padding: '8px 0', borderBottom: '1px solid var(--border)',
            fontFamily: 'Figtree, sans-serif', fontSize: 13,
          }}>
            <span style={{ width: 28, color: 'var(--text-tertiary)', fontFamily: "'SF Mono', Menlo, monospace" }}>{i + 1}.</span>
            <span style={{ flex: 1, color: 'var(--text-primary)' }}>{a.name}</span>
            <span style={{ color: 'var(--text-secondary)', fontFamily: "'SF Mono', Menlo, monospace" }}>{formatDuration(a.totalSeconds)}</span>
          </div>
        ))}
      </div>
    )
  }
  if (id === 'week') {
    const days = week.data?.days || []
    if (days.length === 0) return <EmptyDayMessage />
    const max = Math.max(...days.map(d => d.stats?.focusScore || 0), 1)
    return (
      <div>
        <div style={{ display: 'flex', gap: 6 }}>
          {days.map(d => {
            const score = d.stats?.focusScore || 0
            const alpha = Math.max(0.08, score / max)
            return (
              <div key={d.date} title={`${d.date}: focus ${score}/100`} style={{
                flex: 1, height: 48, borderRadius: 6,
                background: `rgba(79, 142, 247, ${alpha})`,
                border: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Figtree, sans-serif',
              }}>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{d.date.slice(5)}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{score}</div>
              </div>
            )
          })}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
          Darker = higher focus score.
        </div>
      </div>
    )
  }
  return null
}

function FocusGauge({ score }) {
  const size = 96
  const stroke = 10
  const radius = (size - stroke) / 2
  const circ = 2 * Math.PI * radius
  const dash = (score / 100) * circ
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="var(--bg-tertiary)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="var(--text-primary)" strokeWidth={stroke} fill="none"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', fontFamily: 'Figtree, sans-serif',
      }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{score}</div>
        <div style={{ fontSize: 9, color: 'var(--text-tertiary)', letterSpacing: 0.6 }}>/100</div>
      </div>
    </div>
  )
}

function DeltaTile({ label, value, formatter, suffix }) {
  const up = value > 0
  const down = value < 0
  const color = up ? '#7ED957' : down ? '#F76D6D' : 'var(--text-secondary)'
  const formatted = formatter ? formatter(Math.abs(value)) : String(Math.abs(value))
  const sign = up ? '+' : down ? '-' : ''
  return (
    <div style={{
      flex: 1, minWidth: 100, padding: 12, borderRadius: 8,
      background: 'var(--bg-primary)', border: '1px solid var(--border)',
      fontFamily: 'Figtree, sans-serif',
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 4 }}>
        {sign}{formatted}{suffix || ''}
      </div>
    </div>
  )
}

// ---------- Variant 4: Ask anything ----------

const ASK_SUGGESTIONS = [
  'Show yesterday',
  'What did I do this morning',
  'This week summary',
  'Last 3 days',
]

function AskAnythingVariant() {
  const email = auth.currentUser?.email
  const [text, setText] = React.useState('')
  const [submitted, setSubmitted] = React.useState(null)

  if (!email) return <NoAuthMessage />

  function submit(q) {
    const parsed = parseAskQuery(q)
    setSubmitted({ query: q, params: parsed })
  }

  return (
    <div style={{ fontFamily: 'Figtree, sans-serif' }}>
      <div style={{
        display: 'flex', gap: 8, alignItems: 'center',
        padding: '12px 14px', borderRadius: 28,
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      }}>
        <Search size={18} color="var(--text-tertiary)" />
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { submit(text); } }}
          placeholder="Ask about your Mac activity..."
          style={{
            flex: 1, border: 'none', outline: 'none',
            background: 'transparent', color: 'var(--text-primary)',
            fontSize: 14, fontFamily: 'Figtree, sans-serif',
          }}
        />
        <button onClick={() => submit(text)} style={{
          padding: '8px 16px', borderRadius: 20,
          background: 'var(--text-primary)', color: 'var(--bg-primary)',
          border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'Figtree, sans-serif',
        }}>Ask</button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {ASK_SUGGESTIONS.map(s => (
          <button key={s} onClick={() => { setText(s); submit(s) }} style={{
            padding: '6px 12px', borderRadius: 14,
            border: '1px solid var(--border)',
            background: 'var(--bg-primary)', color: 'var(--text-primary)',
            fontSize: 12, cursor: 'pointer', fontFamily: 'Figtree, sans-serif',
          }}>{s}</button>
        ))}
      </div>

      {submitted && <AskAnswer submitted={submitted} />}
    </div>
  )
}

function AskAnswer({ submitted }) {
  const { params } = submitted
  const { data, loading } = useStructuredMacUsage(params)
  const paramSummary = summariseParams(params)
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 10px', borderRadius: 12,
        background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
        fontSize: 11, fontFamily: 'Figtree, sans-serif', marginBottom: 12,
      }}>
        {paramSummary}
      </div>
      <div style={{
        padding: 18, borderRadius: 12,
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      }}>
        {loading ? (
          <div style={{ color: 'var(--text-tertiary)' }}>Loading...</div>
        ) : (
          <AskAnswerCard data={data} />
        )}
      </div>
    </div>
  )
}

function AskAnswerCard({ data }) {
  const days = data?.days || []
  if (days.length === 0) return <EmptyDayMessage />
  const appMap = {}
  let totalActive = 0, totalProductive = 0, focusSum = 0, focusCount = 0
  for (const d of days) {
    for (const a of d.apps) appMap[a.name] = (appMap[a.name] || 0) + (a.totalSeconds || 0)
    if (d.stats) {
      totalActive += d.stats.activeSeconds || 0
      totalProductive += d.stats.productiveSeconds || 0
      if (d.stats.focusScore != null) { focusSum += d.stats.focusScore; focusCount += 1 }
    }
  }
  const top = Object.entries(appMap).map(([name, s]) => ({ name, totalSeconds: s }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds).slice(0, 5)
  const max = top[0]?.totalSeconds || 0
  const avgFocus = focusCount > 0 ? Math.round(focusSum / focusCount) : null

  let headline
  if (days.length === 1) {
    headline = totalActive > 0
      ? `Active ${formatDuration(totalActive)}, productive ${formatDuration(totalProductive)}${avgFocus != null ? `, focus ${avgFocus}/100` : ''}.`
      : top.length > 0 ? `Top app was ${top[0].name} at ${formatDuration(top[0].totalSeconds)}.`
        : 'No activity recorded.'
  } else {
    headline = `${days.length} days - active ${formatDuration(totalActive)}${avgFocus != null ? `, avg focus ${avgFocus}/100` : ''}.`
  }

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
        {headline}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <KPITile label="Active" value={formatDuration(totalActive)} />
        <KPITile label="Productive" value={formatDuration(totalProductive)} />
        {avgFocus != null && <KPITile label="Focus" value={`${avgFocus}/100`} />}
      </div>
      {top.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Top apps
          </div>
          {top.map(a => <AppBar key={a.name} name={a.name} duration={a.totalSeconds} maxSeconds={max} />)}
        </div>
      )}
    </div>
  )
}

function parseAskQuery(q) {
  const lower = (q || '').toLowerCase()
  const todayS = askTodayStr()
  let start_date = todayS
  let end_date
  let start_time = ''
  let end_time = ''

  if (lower.includes('yesterday')) {
    start_date = askDaysAgoStr(1)
    end_date = askDaysAgoStr(1)
  } else if (lower.includes('this week') || lower.includes('week')) {
    start_date = askDaysAgoStr(6)
    end_date = todayS
  }
  const lastN = lower.match(/last\s+(\d+)\s+days?/)
  if (lastN) {
    const n = Math.max(1, Math.min(14, Number(lastN[1])))
    start_date = askDaysAgoStr(n - 1)
    end_date = todayS
  }

  if (lower.includes('morning')) { start_time = '06:00'; end_time = '12:00' }
  else if (lower.includes('afternoon')) { start_time = '12:00'; end_time = '18:00' }
  else if (lower.includes('evening') || lower.includes('night')) { start_time = '18:00'; end_time = '23:59' }

  const fromTo = lower.match(/from\s+(\d{1,2}):?(\d{2})?\s*(am|pm)?\s+(?:to|-|until)\s+(\d{1,2}):?(\d{2})?\s*(am|pm)?/)
  if (fromTo) {
    start_time = normaliseHour(fromTo[1], fromTo[2], fromTo[3])
    end_time = normaliseHour(fromTo[4], fromTo[5], fromTo[6])
  }

  return { start_date, end_date, start_time, end_time }
}

function normaliseHour(h, m, ampm) {
  let hh = Number(h)
  const mm = Number(m || 0)
  if (ampm === 'pm' && hh < 12) hh += 12
  if (ampm === 'am' && hh === 12) hh = 0
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function summariseParams(p) {
  const dates = p.end_date && p.end_date !== p.start_date
    ? `${p.start_date} to ${p.end_date}`
    : p.start_date
  const window = (p.start_time || p.end_time)
    ? `${p.start_time || '00:00'} to ${p.end_time || '23:59'}`
    : 'none'
  return `dates: ${dates} | window: ${window}`
}

// ---------- Variant 5: Overlord's Summary ----------

const SUMMARY_PRESETS = [
  { id: 'today', label: 'Today', params: () => ({ start_date: askTodayStr() }) },
  { id: 'yesterday', label: 'Yesterday', params: () => ({ start_date: askDaysAgoStr(1), end_date: askDaysAgoStr(1) }) },
  { id: 'week', label: 'This week', params: () => ({ start_date: askDaysAgoStr(6), end_date: askTodayStr() }) },
  { id: 'custom', label: 'Custom', params: null },
]

function SummaryVariant() {
  const email = auth.currentUser?.email
  const [presetId, setPresetId] = React.useState('today')
  const [customStart, setCustomStart] = React.useState(askTodayStr())
  const [customEnd, setCustomEnd] = React.useState(askTodayStr())

  const params = React.useMemo(() => {
    if (presetId === 'custom') return { start_date: customStart, end_date: customEnd }
    const p = SUMMARY_PRESETS.find(x => x.id === presetId)
    return p?.params ? p.params() : { start_date: askTodayStr() }
  }, [presetId, customStart, customEnd])

  const { data, loading } = useStructuredMacUsage(params)
  if (!email) return <NoAuthMessage />

  const days = data?.days || []
  const appMap = {}
  let totalActive = 0, totalProductive = 0, totalAfk = 0, focusSum = 0, focusCount = 0
  for (const d of days) {
    for (const a of d.apps) appMap[a.name] = (appMap[a.name] || 0) + (a.totalSeconds || 0)
    if (d.stats) {
      totalActive += d.stats.activeSeconds || 0
      totalProductive += d.stats.productiveSeconds || 0
      totalAfk += d.stats.afkSeconds || 0
      if (d.stats.focusScore != null) { focusSum += d.stats.focusScore; focusCount += 1 }
    }
  }
  const topApps = Object.entries(appMap).map(([name, s]) => ({ name, totalSeconds: s }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds).slice(0, 8)
  const max = topApps[0]?.totalSeconds || 0
  const avgFocus = focusCount > 0 ? Math.round(focusSum / focusCount) : null

  const presetLabel = SUMMARY_PRESETS.find(x => x.id === presetId)?.label || 'Today'
  const headline = days.length === 0
    ? `${presetLabel} has no activity yet.`
    : totalActive > 0
      ? `${presetLabel} you have been productive ${formatDuration(totalProductive)} out of ${formatDuration(totalActive)} active${avgFocus != null ? `, focus score ${avgFocus}/100` : ''}.`
      : topApps[0]
        ? `${presetLabel} your top app is ${topApps[0].name} at ${formatDuration(topApps[0].totalSeconds)}.`
        : `${presetLabel} has no activity yet.`

  return (
    <div style={{ fontFamily: 'Figtree, sans-serif' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 1,
        display: 'flex', gap: 4, padding: 4, borderRadius: 10,
        background: 'var(--bg-tertiary)', marginBottom: 16, flexWrap: 'wrap',
      }}>
        {SUMMARY_PRESETS.map(p => (
          <button key={p.id} onClick={() => setPresetId(p.id)} style={{
            flex: 1, padding: '8px 12px', fontSize: 12, fontWeight: 600,
            border: 'none', borderRadius: 6, cursor: 'pointer',
            background: presetId === p.id ? 'var(--background)' : 'transparent',
            color: presetId === p.id ? 'var(--text-primary)' : 'var(--text-secondary)',
            boxShadow: presetId === p.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            whiteSpace: 'nowrap', fontFamily: 'Figtree, sans-serif',
          }}>{p.label}</button>
        ))}
      </div>

      {presetId === 'custom' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} style={summaryDateInput} />
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={summaryDateInput} />
        </div>
      )}

      <div style={{
        padding: 20, borderRadius: 14,
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      }}>
        <div style={{
          fontSize: 22, fontWeight: 700, color: 'var(--text-primary)',
          letterSpacing: -0.3, lineHeight: 1.3, marginBottom: 18,
        }}>
          {loading ? 'Loading your summary...' : headline}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
          <KPITile label="Active" value={formatDuration(totalActive)} caption={days.length > 1 ? `across ${days.length} days` : undefined} />
          <KPITile label="Productive" value={formatDuration(totalProductive)} />
          <KPITile label="Focus" value={avgFocus != null ? `${avgFocus}/100` : 'n/a'} />
          <KPITile label="AFK" value={formatDuration(totalAfk)} />
        </div>

        <div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Top apps
          </div>
          {topApps.length === 0 ? (
            <EmptyDayMessage />
          ) : (
            topApps.map(a => <AppBar key={a.name} name={a.name} duration={a.totalSeconds} maxSeconds={max} />)
          )}
        </div>
      </div>
    </div>
  )
}

const summaryDateInput = {
  padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13,
  fontFamily: 'Figtree, sans-serif',
}

// ---------- MacUsageAsk root ----------

function MacUsageAsk() {
  const [tab, setTab] = React.useState('chat')

  const tabs = [
    { key: 'chat', label: 'Chat', icon: MessageCircle },
    { key: 'timeline', label: 'Timeline', icon: Sliders },
    { key: 'cards', label: 'Cards', icon: Grid3x3 },
    { key: 'ask', label: 'Ask', icon: Search },
    { key: 'summary', label: 'Summary', icon: LayoutDashboard },
  ]

  return (
    <div style={{
      marginTop: 24, padding: 20, borderRadius: 12,
      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      fontFamily: 'Figtree, sans-serif',
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
        Ask Overlord about your Mac
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, marginBottom: 14 }}>
        Five user-facing takes on the same data - same Firestore paths as the developer playground above, but rendered visually.
      </div>

      <TabStrip tabs={tabs} active={tab} onChange={setTab} />

      <div>
        {tab === 'chat' && <ChatVariant />}
        {tab === 'timeline' && <TimelineVariant />}
        {tab === 'cards' && <CardsVariant />}
        {tab === 'ask' && <AskAnythingVariant />}
        {tab === 'summary' && <SummaryVariant />}
      </div>
    </div>
  )
}
