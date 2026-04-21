import React, { useEffect, useState } from 'react'
import { auth, db, listenToPersonality } from '../services/firebaseService'
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore'
import MessageList from './MessageList'
import ChatInput from './ChatInput'
import MacOnboardingCard from './MacOnboardingCard'
import { useWebSocket } from './useWebSocket'

/**
 * Main chat view component for the Mac Electron app.
 * Simplified from webapp's ChatView.tsx - no model selector, no theme toggle,
 * no upgrade modal, no anonymous user handling.
 * Combines Firestore listener + WebSocket streaming.
 */

export default function ChatView() {
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [setupComplete, setSetupComplete] = useState(null) // null = unknown (still loading)
  const [skipOnboarding, setSkipOnboarding] = useState(false)

  const {
    streamingMessage,
    isThinking,
    thinkingText,
    isWaitingForResponse,
    isAgentRunning,
    isResponseComplete,
    isProcessingAction,
    toolActivities,
    sendMessage,
    isConnected,
    hasQueuedMessage,
    cancelQueuedMessage,
    clearStreaming,
  } = useWebSocket()

  const userEmail = auth.currentUser?.email

  // Listen to Firestore messages
  useEffect(() => {
    if (!userEmail) {
      setIsLoading(false)
      return
    }

    const messagesRef = collection(db, 'users', userEmail, 'Goals', 'master_chat', 'Messages')
    const q = query(messagesRef, orderBy('timestamp', 'desc'), limit(50))

    const unsub = onSnapshot(q, (snapshot) => {
      const msgs = []
      snapshot.forEach((doc) => {
        const data = doc.data()
        if (data.visible_to_user === false) return
        msgs.push({ id: doc.id, ...data })
      })
      // Reverse so oldest first
      msgs.reverse()
      setMessages(msgs)
      setIsLoading(false)
    })

    return () => unsub()
  }, [userEmail])

  // Listen to macInstructionsSetupComplete flag
  useEffect(() => {
    if (!userEmail) return
    const unsub = listenToPersonality(userEmail, (personality) => {
      setSetupComplete(!!personality?.macInstructionsSetupComplete)
    })
    return () => unsub()
  }, [userEmail])

  const isWaitingForAI = (!isResponseComplete && !!streamingMessage) || isThinking || isWaitingForResponse
  const canQueue = isWaitingForAI && !hasQueuedMessage

  // Escape key stops the current response
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isWaitingForAI) {
        clearStreaming()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isWaitingForAI, clearStreaming])

  const hasMessages = messages.length > 0
  // Show onboarding card whenever setup isn't complete and the user hasn't skipped.
  // Matches the Mac app's behavior of showing the setup prompt regardless of
  // prior chat history.
  const showOnboarding = setupComplete === false && !skipOnboarding

  const chatInput = (
    <ChatInput
      onSend={sendMessage}
      isWaitingForResponse={isWaitingForAI}
      hasQueuedMessage={hasQueuedMessage}
      onCancelQueued={cancelQueuedMessage}
      canQueue={canQueue}
      onStop={clearStreaming}
    />
  )

  if (showOnboarding) {
    return (
      <div className="flex-1 flex flex-col h-full relative">
        <MacOnboardingCard
          onSendMessage={sendMessage}
          onSkip={() => setSkipOnboarding(true)}
        />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full relative">
      <MessageList
        messages={messages}
        isLoading={isLoading}
        streamingMessage={streamingMessage}
        isThinking={isThinking}
        thinkingText={thinkingText}
        isWaitingForResponse={isWaitingForResponse}
        isAgentRunning={isAgentRunning}
        isResponseComplete={isResponseComplete}
        isProcessingAction={isProcessingAction}
        toolActivities={toolActivities}
        onSendMessage={sendMessage}
        chatInput={!hasMessages ? chatInput : undefined}
      />

      {/* Input - Fixed at bottom (only when there are messages) */}
      {hasMessages && chatInput}
    </div>
  )
}
