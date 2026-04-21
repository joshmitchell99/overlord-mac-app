/**
 * Service singletons - wired together and exported for use by React components.
 *
 * WordListService -> classifies apps
 * ScoreService -> tracks distraction score, fires threshold callbacks
 * DecisionEngine -> ties it all together, processes app updates
 */

import { WordListService } from './wordListService';
import { ScoreService } from './scoreService';
import { DecisionEngine } from './decisionEngine';
import { GlobalScoreService } from './globalScoreService';
// AllowanceService is no longer used - temporary unblocks are stored as
// unblock_until on word entries in Firebase, matching the Swift app.
import { persistence } from './persistenceService';
import { screenCapture } from './screenCaptureService';
import { pomodoro } from './pomodoroService';
import { extremeMode } from './extremeModeService';
import { remoteLogger } from './remoteLogger';
import { nsfw } from './nsfwService';
import { auth } from './firebaseService';
import { getServerHttpBase } from './serverUrl';

// --- Cooldown tracking for check-in overlay ---
const CHECKIN_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
let lastCheckinTime = 0;
let checkinInFlight = false; // true while a server call or overlay is active

// --- Singleton instances ---

const wordList = new WordListService();

const globalScore = new GlobalScoreService({
  wordList,
  getMacInstructions: () => window.__overlordPersonality?.macInstructions || '',
});

const score = new ScoreService({
  onThresholdReached: async () => {
    // Mutual exclusion with block/countdown overlays. Skip entirely without
    // claiming the cooldown - next threshold hit will retry once the block
    // lifecycle is fully done. Uses the authoritative electron-main state.
    try {
      const currentType = await window.electronAPI?.getCurrentOverlayType?.();
      if (currentType === 'blocking' || currentType === 'countdown') {
        console.log(`[services] Check-in skipped - ${currentType} overlay is active`);
        return;
      }
    } catch { /* IPC unavailable in dev/test - fall through */ }

    // Enforce cooldown - don't trigger another check-in within 5 minutes
    const now = Date.now();
    if (now - lastCheckinTime < CHECKIN_COOLDOWN_MS) {
      console.log('[services] Check-in skipped - cooldown active');
      return;
    }
    // Guard against parallel fires while the server call / overlay is loading
    if (checkinInFlight) {
      console.log('[services] Check-in skipped - already in flight');
      return;
    }

    // Claim the cooldown and in-flight slot SYNCHRONOUSLY so polling re-records
    // that happen during the server fetch don't re-trigger this handler.
    lastCheckinTime = now;
    checkinInFlight = true;

    // Capture summaries BEFORE resetting - we need this data for the overlay.
    const appSummary = engine.getAppSummary();
    const todaySummary = engine.getTodaySummary();
    const appsSince = engine.getUnknownSeen();
    const appsToday = engine.getTodaySeen();
    const recentApps = engine.getRecentApps();
    const currentApp = recentApps[0]?.app || 'Unknown';
    // Build lowercase-keyed map of existing classifications so the overlay
    // can hide "Productive/Distracting/Block" pills for already-classified apps.
    const existingClassifications = {};
    for (const w of wordList.getWords()) {
      existingClassifications[w.word.toLowerCase()] = w.list;
    }

    // Reset the score + deduped unknown-seen list so the next check-in
    // starts from a clean slate (matches Swift's completeReassessment).
    score.reset('checkin_triggered');
    engine.resetUnknowns();
    const macInstructions = window.__overlordPersonality?.macInstructions || '';
    const currentTime = new Date().toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    // Stable per-checkin id so the initial assistant message + follow-up
    // /reassessment-chat turns land in the same session doc on the server.
    const sessionId = `chk_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    // Call the server endpoint asynchronously
    (async () => {
      let idToken = null;
      try {
        const user = auth.currentUser;
        if (!user) {
          console.warn('[services] No authenticated user - skipping check-in API call');
          // Release the lock so another tick can try again later
          lastCheckinTime = 0;
          return;
        }

        idToken = await user.getIdToken(true);

        const serverBase = await getServerHttpBase();
        const response = await fetch(`${serverBase}/reassessment-checkin`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            usage: appSummary,
            mac_instructions: macInstructions,
            current_app: currentApp,
            current_time: currentTime,
            today_summary: todaySummary,
            session_id: sessionId,
          }),
        });

        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }

        const serverResponse = await response.json();

        // If [NO RESPONSE] or empty, user is productive - score already reset, release cooldown
        if (
          !serverResponse.response ||
          serverResponse.response === '[NO RESPONSE]' ||
          serverResponse.response.trim() === ''
        ) {
          console.log('[services] Server said no check-in needed');
          // Release the cooldown since we aren't showing anything
          lastCheckinTime = 0;
          return;
        }

        // Show the overlay with the server's AI response and actions.
        // Cap pollLog at the last 300 entries (~15 min of 3s-cadence data).
        // pollLog can grow to 300k samples and the full array blows past
        // WKWebView's URL hash limit, silently truncating the JSON and
        // nuking overlordResponse/actions that come later in the payload.
        const pollLogSnapshot = score.pollLog.slice(-300);
        const thresholdSnapshot = score.threshold;
        const nsfwStatus = nsfw.lastResult || 'clean';

        if (window.electronAPI && window.electronAPI.showCheckinOverlay) {
          console.log('[services CHECKIN success] response=', JSON.stringify(serverResponse.response), 'actions=', (serverResponse.actions || []).length);
          window.electronAPI.showCheckinOverlay({
            appSummary,
            todaySummary,
            appsSince,
            appsToday,
            existingClassifications,
            overlordResponse: serverResponse.response,
            actions: serverResponse.actions || [],
            pollLog: pollLogSnapshot,
            threshold: thresholdSnapshot,
            nsfwStatus,
            authToken: idToken,
            serverBase,
            sessionId,
          });
        }
      } catch (err) {
        console.error('[services] Check-in API error:', err);

        // Fallback - show overlay with generic message
        const fallbackPollLog = score.pollLog.slice(-300);
        const fallbackThreshold = score.threshold;
        const fallbackNsfw = nsfw.lastResult || 'clean';
        const fallbackServerBase = await getServerHttpBase();

        if (window.electronAPI && window.electronAPI.showCheckinOverlay) {
          console.log('[services CHECKIN fallback] using "I noticed..." fallback, err=', err?.message);
          window.electronAPI.showCheckinOverlay({
            appSummary,
            todaySummary,
            appsSince,
            appsToday,
            existingClassifications,
            overlordResponse: 'I noticed some potentially distracting activity. Want to refocus?',
            actions: [
              { type: 'snooze', label: 'Snooze for 10 min', minutes: 10 },
              { type: 'dismiss', label: "I'm fine, dismiss" },
            ],
            pollLog: fallbackPollLog,
            threshold: fallbackThreshold,
            nsfwStatus: fallbackNsfw,
            authToken: idToken,
            serverBase: fallbackServerBase,
          });
        }
      } finally {
        checkinInFlight = false;
      }
    })();
  },
  onScoreUpdate: (currentScore, threshold) => {
    // Broadcast to floating score bar window via Electron IPC
    if (window.electronAPI && window.electronAPI.sendScoreBarUpdate) {
      window.electronAPI.sendScoreBarUpdate({ score: currentScore, threshold });
    }
  },
});

const engine = new DecisionEngine({
  wordListService: wordList,
  scoreService: score,
  onUnknownApp: (appName) => globalScore.observeUnknown(appName),
  getGlobalScore: (appName) => globalScore.getCached(appName),
  // No more allowanceService - unblocks are on word entries via unblock_until
  onBlock: async (blockData) => {
    if (!window.electronAPI?.showBlockingOverlay) {
      console.warn('[onBlock] ABORT - electronAPI.showBlockingOverlay unavailable. app=', blockData.appName);
      // Without this, _overlayShownAt would stay set forever (no native panel
      // ever dismisses). Clear it so future matches can re-try.
      engine.markOverlayDismissed();
      return;
    }
    console.log('[onBlock] calling showBlockingOverlay for', blockData.appName);
    // Pass auth token + email so the overlay (separate WKWebView) can load chat
    let authToken = null;
    const user = auth.currentUser;
    console.log('[onBlock] auth.currentUser:', user?.email || 'null');
    if (user) {
      try {
        authToken = await user.getIdToken();
        console.log('[onBlock] got token, length:', authToken?.length || 0);
      } catch (e) {
        console.error('[onBlock] getIdToken failed:', e);
      }
    }
    const blockServerBase = await getServerHttpBase();
    const payload = {
      type: 'blocked',
      appName: blockData.appName,
      windowTitle: blockData.windowTitle,
      url: blockData.url,
      reasoning: blockData.reasoning,
      matchedWord: blockData.matchedWord,
      schedule: blockData.schedule || null,
      userEmail: user?.email || null,
      authToken,
      macInstructions: window.__overlordPersonality?.macInstructions || '',
      appSummary: engine.getAppSummary(),
      todaySummary: engine.getTodaySummary(),
      serverBase: blockServerBase,
    };
    console.log('[onBlock] showing overlay with userEmail:', payload.userEmail, 'hasToken:', !!payload.authToken);
    // Await the result so we can detect mutex rejection (e.g. checkin up).
    // The engine has already set _overlayShownAt before calling us - if the
    // show is rejected we need to revert that flag so the next poll can retry.
    const accepted = await window.electronAPI.showBlockingOverlay(payload);
    if (accepted === false) {
      console.log('[onBlock] show rejected - reverting engine flag so next poll can retry');
      engine.markOverlayDismissed();
    }
  },
  onCheckin: (checkinData) => {
    // Alternative entry point - primary check-in triggers
    // come from ScoreService.onThresholdReached above
    if (window.electronAPI && window.electronAPI.showCheckinOverlay) {
      console.log('[services CHECKIN engine.onCheckin] overlordResponse len=', (checkinData?.overlordResponse || '').length);
      window.electronAPI.showCheckinOverlay(checkinData);
    }
  },
  onEarlyCompliance: () => {
    // User navigated away from the blocked target while the countdown panel
    // was up - tell electron-main to dismiss it if it's still showing.
    // No-op during the block-panel phase (the IPC checks the overlay type).
    window.electronAPI?.dismissCountdownIfActive?.();
  },
});

// Wrap engine.processAppUpdate to also send poll log entries to the floating score bar
const _originalProcessAppUpdate = engine.processAppUpdate.bind(engine);
engine.processAppUpdate = function(appInfo) {
  const scoreBefore = score.currentScore;
  _originalProcessAppUpdate(appInfo);
  const scoreAfter = score.currentScore;

  // Annotate the latest recent app entry with delta + total for the Live Feed UI
  const recentApps = engine.getRecentApps();
  const latest = recentApps[0];
  if (latest) {
    latest.scoreDelta = scoreAfter - scoreBefore;
    latest.totalScore = scoreAfter;
  }

  if (window.electronAPI && window.electronAPI.sendScoreBarUpdate && latest) {
    window.electronAPI.sendScoreBarUpdate({
      score: scoreAfter,
      threshold: score.threshold,
      entry: {
        ts: latest.timestamp || Date.now(),
        app: latest.app || appInfo.app || 'Unknown',
        list: latest.classification || 'unknown',
        delta: scoreAfter - scoreBefore,
        total: scoreAfter,
      },
    });
  }
};

// Wire NSFW detection - spike score when flagged to force a check-in.
// Routed through score.spike() so the pollLog entry is tagged and the
// score graph tooltip can explain the jump.
nsfw.onFlagged = () => {
  score.spike(30, 'nsfw');
};

// Hook NSFW scanning into the screen capture pipeline. startScanning wraps
// screenCapture.onCapture so every captured frame gets run through Apple's
// SensitiveContentAnalysis via the nsfw-scan native binary. No-op until
// screen recording is actually enabled (no captures => no scans).
nsfw.startScanning(screenCapture);

// Manual trigger for debug shortcut - opens the blocking overlay with real auth
export function triggerBlocking() {
  engine.clearActiveBlock() // force re-fire
  engine._onBlock({
    appName: 'Reddit',
    windowTitle: 'r/programming',
    url: 'https://reddit.com',
    matchedWord: 'reddit',
    reasoning: 'Reddit is on your blocked list.',
  })
}

// Manual trigger for debug shortcut - calls the real check-in flow
// Bypasses cooldown. Uses real pollLog and real server.
export function triggerCheckin() {
  console.log('[triggerCheckin] invoked');
  lastCheckinTime = 0; // reset cooldown
  const wasSnoozed = score.snoozedUntil;
  score.snoozedUntil = null;

  // Directly call the server + show overlay (bypass cooldown, always show)
  const appSummary = engine.getAppSummary() || '- No app data yet';
  const todaySummary = engine.getTodaySummary() || '- No app data yet';
  const appsSince = engine.getUnknownSeen();
  const appsToday = engine.getTodaySeen();
  const recentApps = engine.getRecentApps();
  const currentApp = recentApps[0]?.app || 'Unknown';
  const existingClassifications = {};
  for (const w of wordList.getWords()) {
    existingClassifications[w.word.toLowerCase()] = w.list;
  }
  const macInstructions = window.__overlordPersonality?.macInstructions || '';
  const currentTime = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  });

  const sessionId = `chk_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  (async () => {
    let overlordResponse = '';
    let actions = [];
    let idToken = null;

    try {
      const user = auth.currentUser;
      if (user) {
        idToken = await user.getIdToken(true);
        const serverBase = await getServerHttpBase();
        const response = await fetch(`${serverBase}/reassessment-checkin`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ usage: appSummary, mac_instructions: macInstructions, current_app: currentApp, current_time: currentTime, today_summary: todaySummary, session_id: sessionId }),
        });
        if (response.ok) {
          const data = await response.json();
          if (data.response && data.response !== '[NO RESPONSE]') {
            overlordResponse = data.response;
            actions = data.actions || [];
          } else {
            overlordResponse = '[Debug] Server said no check-in needed, but showing anyway.';
          }
        }
      } else {
        overlordResponse = '[Debug] Not signed in - showing fallback check-in.';
      }
    } catch (err) {
      console.error('[triggerCheckin] Server error:', err);
      overlordResponse = '[Debug] Server error: ' + err.message;
    }

    if (!overlordResponse) {
      overlordResponse = 'Showing check-in for debug purposes.';
    }

    if (actions.length === 0) {
      actions = [
        { type: 'snooze', label: 'Snooze for 10 min', minutes: 10 },
        { type: 'dismiss', label: 'Dismiss' },
      ];
    }

    const triggerServerBase = await getServerHttpBase();
    if (window.electronAPI && window.electronAPI.showCheckinOverlay) {
      console.log('[services CHECKIN triggerCheckin] overlordResponse=', JSON.stringify(overlordResponse), 'actions=', actions.length);
      window.electronAPI.showCheckinOverlay({
        appSummary,
        todaySummary,
        appsSince,
        appsToday,
        existingClassifications,
        overlordResponse,
        actions,
        pollLog: score.pollLog.slice(-300),
        threshold: score.threshold,
        nsfwStatus: nsfw.lastResult || 'clean',
        authToken: idToken,
        serverBase: triggerServerBase,
        sessionId,
      });
    }
  })();

  score.snoozedUntil = wasSnoozed;
}

export { wordList, score, engine, persistence, screenCapture, pomodoro, extremeMode, remoteLogger, nsfw };

import { startUploader } from './macUsageUploader'
// Start the Mac-parity daily usage uploader once auth is ready
startUploader()

import * as subscription from './subscriptionService'
// Kick off the Firestore subscription listener. It waits for auth internally.
subscription.startListening()
export { subscription }
