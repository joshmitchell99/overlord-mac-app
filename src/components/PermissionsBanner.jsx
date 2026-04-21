import React, { useState, useEffect } from 'react'
import { AlertTriangle, X } from 'lucide-react'

/**
 * Warning banner shown at the top of panels when permissions aren't granted.
 * Checks accessibility + screen recording permissions on mount and every 5s.
 * Clicking the banner opens the relevant System Settings pane.
 */
export default function PermissionsBanner() {
  const [permissions, setPermissions] = useState(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!window.electronAPI?.getPermissions) return
    const check = async () => {
      const p = await window.electronAPI.getPermissions()
      setPermissions(p)
    }
    check()
    const interval = setInterval(check, 5000)
    return () => clearInterval(interval)
  }, [])

  if (!permissions || dismissed) return null

  const missingAccessibility = !permissions.accessibility
  const missingScreenRecording = permissions.screenRecording !== 'granted'

  if (!missingAccessibility && !missingScreenRecording) return null

  let title, description, requestType
  if (missingAccessibility && missingScreenRecording) {
    title = 'Permissions needed'
    description = 'Overlord needs Accessibility and Screen Recording permissions to detect what you are doing. Click here to enable them in System Settings.'
    requestType = 'accessibility'
  } else if (missingAccessibility) {
    title = 'Accessibility permission needed'
    description = 'Overlord needs Accessibility access to read browser URLs and window titles. Without this, blocking websites won\'t work. Click here to enable it.'
    requestType = 'accessibility'
  } else {
    title = 'Screen Recording permission needed'
    description = 'Overlord needs Screen Recording access to monitor what apps you are using. Click here to enable it in System Settings.'
    requestType = 'screen-recording'
  }

  const handleClick = () => {
    if (window.electronAPI?.requestPermission) {
      window.electronAPI.requestPermission(requestType)
    }
  }

  return (
    <div
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: 16,
        marginBottom: 20,
        borderRadius: 12,
        background: 'rgba(245, 158, 11, 0.12)',
        border: '1px solid rgba(245, 158, 11, 0.35)',
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(245, 158, 11, 0.18)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(245, 158, 11, 0.12)' }}
    >
      <AlertTriangle size={18} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }} />

      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4 }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
          {description}
        </div>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); setDismissed(true) }}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--muted-foreground)',
          cursor: 'pointer',
          padding: 4,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
        }}
        title="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  )
}
