import React from 'react'

export default function HowItWorksPanel() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', color: 'var(--foreground)', lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.02em' }}>
        How Overlord Works
      </h1>
      <p style={{ fontSize: 14, color: 'var(--muted-foreground)', marginBottom: 32 }}>
        Your accountability coach for staying focused on your Mac.
      </p>

      <Section title="The Big Picture">
        <p>
          Overlord runs in the background, watching which apps and websites you use. When you drift off task,
          it intervenes — with a gentle nudge, a full-screen block, or an AI-powered check-in. The goal isn't
          to shame you; it's to help you notice patterns and get back on track.
        </p>
      </Section>

      <Section title="Word Lists">
        <p>
          Every app and website you use falls into one of three buckets:
        </p>
        <List items={[
          <><Chip color="#EF4444">Blocked</Chip> — Hard-blocked. You can't use these without going through the unblock flow.</>,
          <><Chip color="#F59E0B">Distracting</Chip> — Allowed, but your distraction score ticks up while you're on them.</>,
          <><Chip color="#22C55E">Productive</Chip> — Your score decays while you're on these. Good work.</>,
        ]} />
        <p>
          You can edit these lists any time from the <strong>Blocking</strong> tab. Words support substring
          matching — "reddit" matches "reddit.com", "Reddit app", etc. Short words (3 chars or less) use
          word-boundary matching so "X" matches "Home / X" but not "inbox".
        </p>
      </Section>

      <Section title="The Distraction Score">
        <p>
          A number between 0 and 100. It climbs when you're on distracting apps and decays when you're on
          productive ones. When it hits the threshold (default 50), you get an AI check-in.
        </p>
        <CodeBlock>
          {`while on distracting app:  score += wordScore * rate * seconds
while on productive app:   score -= decayRate * seconds
every 30 seconds:          score -= passiveDecayRate * 30`}
        </CodeBlock>
        <p>
          Tune the rates from the <strong>Admin</strong> tab. Presets: Relaxed, Default, Strict, Aggressive.
        </p>
      </Section>

      <Section title="Blocking Overlays">
        <p>
          When you open a blocked app, a full-screen overlay appears immediately. It sits on top of
          everything — even fullscreen apps — using a native macOS panel at the shielding window level.
        </p>
        <p>
          To unblock, you choose a friction challenge:
        </p>
        <List items={[
          <><strong>Type N words</strong> — typing 20, 100, or 2000 random words. Higher = harder to bypass.</>,
          <><strong>Wait T seconds</strong> — countdown timer from 10 seconds to 24 hours.</>,
        ]} />
        <p>
          After completing a challenge, pick a duration (5 min, 1 hour, rest of day, etc.) and the app gets
          temporarily unblocked. The allowance is stored as an <code style={codeInline}>unblock_until</code>{' '}
          timestamp on the word entry in Firebase.
        </p>
      </Section>

      <Section title="Check-in Overlays">
        <p>
          When your distraction score crosses the threshold, Overlord calls a lightweight AI endpoint
          (<code style={codeInline}>/reassessment-checkin</code>) with your recent usage. The AI responds
          with a brief message and suggested actions like "Block Reddit" or "Snooze 10 min".
        </p>
        <p>
          This isn't a block — you can dismiss it. But it's a chance to notice what you've been doing and
          decide whether to refocus or keep going. You can also chat back with the AI in the mini-chat to
          negotiate.
        </p>
      </Section>

      <Section title="Focus Sessions">
        <p>
          Click the <strong>Focus</strong> pill in the top bar to start a timed session (15, 25, 45, 60, or
          90 minutes). You'll get a notification when it ends. During a focus session, your distraction
          score accumulates faster to keep you honest.
        </p>
      </Section>

      <Section title="The Chat">
        <p>
          The <strong>Chat</strong> tab connects to the same O-Agent the webapp and iOS app use. You can
          ask Overlord to change your word lists, create goals, schedule reminders, or just talk through
          what you're working on.
        </p>
        <p>
          Messages are stored in Firebase (<code style={codeInline}>users/&lt;email&gt;/Goals/master_chat/Messages</code>) and
          sync across every device. AI responses stream in real-time over WebSocket.
        </p>
      </Section>

      <Section title="Native vs JavaScript">
        <p>
          Overlord is an Electron app, but the parts that need deep macOS integration use small Swift
          helper binaries:
        </p>
        <List items={[
          <><code style={codeInline}>app-monitor</code> — polls the foreground app every 3 seconds, extracts
            window titles and browser URLs via the Accessibility API.</>,
          <><code style={codeInline}>overlay-host</code> — creates native <code style={codeInline}>NSPanel</code> windows
            at <code style={codeInline}>CGShieldingWindowLevel</code> that appear above fullscreen apps. Renders
            React content inside via <code style={codeInline}>WKWebView</code>.</>,
          <><code style={codeInline}>screen-capture</code> — takes screenshots via ScreenCaptureKit for NSFW
            detection and AI analysis.</>,
          <><code style={codeInline}>nsfw-scan</code> — runs Apple's SensitiveContentAnalysis framework on
            screenshots. If flagged, the score spikes to force a check-in.</>,
        ]} />
        <p>
          Everything else — the UI, state management, Firebase sync, scoring logic, chat — runs in regular
          React/JavaScript.
        </p>
      </Section>

      <Section title="Where Data Lives">
        <List items={[
          <><strong>Word lists + settings</strong> — Firebase Firestore at <code style={codeInline}>users/&lt;email&gt;/Settings/MacBlocking</code>.
            Synced across all your devices.</>,
          <><strong>Chat messages</strong> — Firestore at <code style={codeInline}>users/&lt;email&gt;/Goals/master_chat/Messages</code>.</>,
          <><strong>Score + history</strong> — local JSON file at <code style={codeInline}>~/Library/Application Support/overlord-mac-react/local-state.json</code>.
            Saved every 30 seconds.</>,
          <><strong>Mac instructions</strong> — Firestore personality doc. Short paragraph describing how
            Overlord should behave for you.</>,
        ]} />
      </Section>

      <Section title="Extreme Mode">
        <p>
          Enable from the Admin tab. Installs a LaunchAgent that automatically restarts Overlord if you
          force-quit it. Prevents the easiest bypass (just killing the app). Can't be disabled without
          going through the unblock flow.
        </p>
      </Section>

      <Section title="Keyboard Shortcuts (Debug)">
        <List items={[
          <><Kbd>Cmd</Kbd> + <Kbd>Shift</Kbd> + <Kbd>B</Kbd> — show blocking overlay with test data</>,
          <><Kbd>Cmd</Kbd> + <Kbd>Shift</Kbd> + <Kbd>C</Kbd> — trigger a real check-in</>,
          <><Kbd>Cmd</Kbd> + <Kbd>Shift</Kbd> + <Kbd>D</Kbd> — dismiss any overlay</>,
        ]} />
      </Section>

      <div style={{ height: 40 }} />
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, letterSpacing: '-0.01em' }}>{title}</h2>
      <div style={{ fontSize: 14, color: 'var(--foreground)', opacity: 0.88 }}>
        {children}
      </div>
    </section>
  )
}

function List({ items }) {
  return (
    <ul style={{ listStyle: 'disc', paddingLeft: 22, margin: '8px 0' }}>
      {items.map((item, i) => (
        <li key={i} style={{ marginBottom: 6 }}>{item}</li>
      ))}
    </ul>
  )
}

function Chip({ color, children }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 8px',
      borderRadius: 99,
      fontSize: 11,
      fontWeight: 600,
      background: color,
      color: '#fff',
      marginRight: 4,
    }}>{children}</span>
  )
}

function Kbd({ children }) {
  return (
    <kbd style={{
      display: 'inline-block',
      padding: '1px 6px',
      borderRadius: 4,
      border: '1px solid var(--border)',
      background: 'var(--muted)',
      fontFamily: "'SF Mono', Menlo, monospace",
      fontSize: 11,
      fontWeight: 500,
      color: 'var(--foreground)',
    }}>{children}</kbd>
  )
}

function CodeBlock({ children }) {
  return (
    <pre style={{
      background: 'var(--muted)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: 12,
      fontSize: 12,
      fontFamily: "'SF Mono', Menlo, monospace",
      overflow: 'auto',
      margin: '8px 0',
      color: 'var(--foreground)',
    }}>
      <code>{children}</code>
    </pre>
  )
}

const codeInline = {
  padding: '1px 5px',
  borderRadius: 4,
  background: 'var(--muted)',
  fontFamily: "'SF Mono', Menlo, monospace",
  fontSize: 12,
}
