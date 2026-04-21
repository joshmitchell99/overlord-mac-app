import React from 'react'
import ChatView from '../chat/ChatView'

export default function ChatPane() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <ChatView />
    </div>
  )
}
