import React, { useState } from 'react'
import { Monitor } from 'lucide-react'

/**
 * Mac onboarding setup card - shown in the chat when macInstructionsSetupComplete
 * is false. On "Start Setup" click, sends a hidden system-style user message that
 * kicks off the AI-led Mac blocking setup conversation.
 *
 * Mirrors MainView.swift's MacOnboardingConfig in the Swift app.
 */

// Short, conversational onboarding flow. The AI asks at most 3 questions total
// and then writes the config. Keep the opener tight, follow up based on context.
const MAC_ONBOARDING_SYSTEM_MESSAGE = `[SYSTEM] The user has just connected their Mac app for the first time. Run a short, conversational setup - max 3 AI turns before you write the config. Be casual and punchy. Do NOT dump a big list of questions.

IMPORTANT: If the user has prior onboarding messages in their history, treat this as a RESTART. Do not continue or reference the previous attempt. Start fresh with TURN 1 exactly as written. Ignore any macInstructions, mac list entries, or answers from previous onboarding sessions - the user wants to redo this from scratch.

CRITICAL CONCEPT - Blocking model:
- "Blocked" items are fully blocked. The user cannot open them without an unblock request. These are the only items with unblock rules.
- "Distracting" items are NOT blocked. They only trigger a gentle nudge / check-in when the user's distraction score gets too high. They never require unblocking.
- "Productive" items are always allowed.
Do NOT tell the user that distracting apps will be blocked or need unblocking. Only blocked items have unblock rules.

TURN 1 (opener, exact wording):
"Welcome to Overlord! Let's get you set up. Three quick things: (1) what do you mostly use your Mac for, (2) what distracts you, and (3) anything you want me to block?"

TURN 2 (unblock behavior, adapt to their previous answer):
Ask how they want UNBLOCK requests handled when they try to open one of their blocked items (reference an actual item they named in TURN 1, e.g. "when you try to open Reddit"). If they didn't name anything to block, skip this question and go straight to TURN 3.

Use roughly this format (replace "BBC News" with their actual blocked item). Start with a warm, conversational lead-in sentence before listing the options:

"Alright, now if you want to unblock BBC News later on, do you want any of these to apply?

- Type out 10 random words (just to add a bit of friction)
- Add a delay (e.g. wait 2 min before it opens)
- Only available at certain times (e.g. 12-1pm and after 6pm)
- Submit a photo (e.g. a meal, your desk, whatever proves context)
- Give a good reason - justify why you need it
- No friction, just open it when you ask

Or describe your own - what feels right?"

Keep it concise and bullet-style. Let them describe it freely, but offer ONE method - don't tell them they can combine multiple methods (combining isn't supported).

TURN 3 (schedule):
Ask if monitoring/blocking is always on, or just work hours / weekdays. Keep it one sentence.

TURN 4a (TOOL CALLS ONLY - this is critical):
Reply with ONLY tool calls. Do NOT write any user-facing text in this turn. No summary, no "Setting things up...", no bullet list - zero prose. Tool calls and text MUST NOT appear together in the same response.

Make these tool calls in order:
1. request_tools(["edit_mac_list", "update_user_settings", "complete_mac_onboarding"])
2. edit_mac_list for each list (blocked, distracting, productive) - one call per list containing all the entries for that list
3. update_user_settings(document="personality", field="macInstructions", value=<concise paragraph summarizing their preferences>)
4. complete_mac_onboarding() - this flips macOnboardingCompleted on OverlordSettings and dismisses the onboarding overlay

TURN 4b (TEXT ONLY - after tool results come back):
Once all the tool calls from TURN 4a have returned results, respond with a short summary + how-it-works rundown as text only. No tool calls in this turn. Use this exact format:

"All set! Here's what I configured:
> **Blocked:** <items>
> **Distracting:** <items>
> **Productive:** <items>
> **Schedule:** <summary>
> **Unblock rules:** <summary>

Onboarding completed!
1. You use your Mac. A score ticks up whenever you're on something distracting or unknown.
2. When the score gets high enough, I trigger a check-in. You tell me if apps/websites were productive, distracting, or should be blocked.
3. I learn from each one, so these check-ins happen less and less over time.
4. If something is blocked, you can chat with me to get it unblocked. You can always tell me to be stricter.
5. Want an NSFW filter too? Toggle it in Settings. I'll block your screen if any NSFW images/videos show up.

You can tweak any of this in the Blocking panel whenever you want."

Rules:
- Keep every message short. 1-3 sentences max unless summarizing.
- Never re-ask what they already told you.
- Infer productive allowlist from their job (e.g. dev -> VS Code, Terminal, GitHub, Chrome for dev sites).
- Don't ask about "overall strictness" as a separate question - the unblock-behavior answer covers that.
- CRITICAL: Never mix tool calls and user-facing text in the same response. Tools in one turn, text in the next.`

export default function MacOnboardingCard({ onSendMessage, onSkip }) {
  const [isStarting, setIsStarting] = useState(false)

  async function handleStart() {
    if (isStarting) return
    setIsStarting(true)
    try {
      await onSendMessage(MAC_ONBOARDING_SYSTEM_MESSAGE, {
        type: 'mac_onboarding',
      })
      // Hide the card and show the chat view so the user can see the AI's response.
      // The setupComplete flag flips true at the end of the conversation when the
      // AI calls update_user_settings - at that point the card would stay hidden
      // anyway. If the user resets and comes back, the card shows again.
      if (onSkip) onSkip()
    } catch (err) {
      console.error('[MacOnboardingCard] Failed to start setup:', err)
    } finally {
      setIsStarting(false)
    }
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <div style={styles.iconWrapper}>
          <Monitor size={28} color="#fff" strokeWidth={2} />
        </div>
        <div style={styles.title}>Set up Mac blocking</div>
        <div style={styles.description}>
          Overlord will chat with you for a minute to learn your work, the apps
          that distract you, and how strict you want blocking to be.
        </div>
        <div style={styles.actions}>
          <button
            style={{
              ...styles.startBtn,
              opacity: isStarting ? 0.7 : 1,
              cursor: isStarting ? 'default' : 'pointer',
            }}
            onClick={handleStart}
            disabled={isStarting}
          >
            {isStarting ? 'Starting...' : 'Start Setup'}
          </button>
          {onSkip && (
            <button style={styles.skipBtn} onClick={onSkip} disabled={isStarting}>
              Skip for now
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    padding: 24,
    fontFamily: "'Figtree', -apple-system, sans-serif",
  },
  card: {
    maxWidth: 420,
    width: '100%',
    padding: 32,
    borderRadius: 16,
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: 16,
  },
  iconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 16,
    background: 'linear-gradient(135deg, #3B82F6, #6366F1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 6px 16px rgba(59,130,246,0.3)',
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginTop: 4,
  },
  description: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
    maxWidth: 320,
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    alignItems: 'center',
    marginTop: 8,
    width: '100%',
  },
  startBtn: {
    padding: '10px 32px',
    borderRadius: 10,
    border: 'none',
    background: '#3B82F6',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'Figtree', sans-serif",
    transition: 'opacity 0.15s',
    minWidth: 180,
  },
  skipBtn: {
    padding: '6px 16px',
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color: 'var(--text-tertiary)',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: "'Figtree', sans-serif",
  },
}
