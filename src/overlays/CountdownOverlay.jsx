import React, { useEffect, useMemo, useState } from 'react'

function parseData() {
  try {
    const hashParts = window.location.hash.split('?')
    if (hashParts[1]) {
      const params = new URLSearchParams(hashParts[1])
      const raw = params.get('data')
      if (raw) return JSON.parse(decodeURIComponent(raw))
    }
  } catch (e) {
    console.warn('[CountdownOverlay] Failed to parse URL data:', e)
  }
  return {}
}

export default function CountdownOverlay() {
  const data = useMemo(parseData, [])
  const mode = data.mode === 'granted' ? 'granted' : 'dismiss'
  const totalSeconds = Number(data.seconds) || (mode === 'granted' ? 10 : 3)
  const appName = data.appName || 'the app'

  const [remaining, setRemaining] = useState(totalSeconds)

  useEffect(() => {
    document.body.style.background = 'transparent'
    document.documentElement.style.background = 'transparent'
    document.body.style.margin = '0'
    document.body.style.overflow = 'hidden'
  }, [])

  useEffect(() => {
    if (remaining <= 0) {
      if (window.nativeOverlay?.dismiss) window.nativeOverlay.dismiss()
      return
    }
    const t = setTimeout(() => setRemaining(r => r - 1), 1000)
    return () => clearTimeout(t)
  }, [remaining])

  const progress = (totalSeconds - remaining) / totalSeconds
  const isDismiss = mode === 'dismiss'
  // Both modes ramp up visibly as time runs out. Dismiss starts a touch
  // lighter than granted so the user can still read what's underneath, but
  // ends up clearly opaque by the final second.
  const bgOpacity = isDismiss
    ? 0.35 + progress * 0.45  // 0.35 -> 0.80
    : 0.45 + progress * 0.45  // 0.45 -> 0.90

  const label = isDismiss ? `Close ${appName} now` : 'Unblock granted'
  const subLabel = isDismiss
    ? 'Overlay will re-appear if you stay'
    : `Returning to ${appName}...`

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: `rgba(20,20,20,${bgOpacity})`,
        transition: 'background 1s linear',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        fontFamily: "'Figtree', -apple-system, BlinkMacSystemFont, sans-serif",
        color: '#fff',
        textShadow: '0 2px 8px rgba(0,0,0,0.5)',
        // Belt-and-braces: even if the panel's ignoresMouseEvents somehow
        // flipped off, nothing in here should swallow clicks.
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      <div style={{ fontSize: 120, fontWeight: 700, lineHeight: 1 }}>{remaining}s</div>
      <div style={{ fontSize: 22, fontWeight: 600, opacity: 0.95, marginTop: 8 }}>{label}</div>
      <div style={{ fontSize: 14, opacity: 0.7 }}>{subLabel}</div>
    </div>
  )
}
