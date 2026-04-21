/**
 * Parses content containing ACTION_JSON and ACTION_ID markers.
 * Also checks metadata for action data (matches Flutter behavior).
 * Ported from webapp's actionParser.ts - converted to plain JS.
 */

// Final actions that render as full ActionWidgets.
const FINAL_ACTION_TYPES = new Set([
  'approve_goal', 'fail_goal', 'charge_user', 'charge', 'charged', 'charge_failed',
  'create_goal', 'delete_goal', 'edit_goal', 'unblock_screen', 'block_screen',
  'set_blocked_status', 'sync_screen_blocking', 'send_sms', 'send_email',
  'call_user', 'call_failed', 'call_completed', 'skip_goal', 'change_status',
  'revive_goal', 'edit_mac_triggers', 'combined_daily_recap', 'request_credential',
  'reveal_credential', 'request_domain_approval', 'request_credential_domain_binding',
  'apply_holiday', 'update_goal_schedule', 'cron_create', 'cron_delete', 'cron_update',
  'add_schedule_item', 'remove_schedule_item', 'update_schedule_item',
  'replace_schedule', 'display_schedule', 'troubleshoot', 'update_weasel_lock',
  'error', 'contact_human', 'test_action',
])

export function isFinalAction(actionType, actionData) {
  if (!FINAL_ACTION_TYPES.has(actionType)) return false
  if ((actionType === 'update_goal_schedule' || actionType === 'replace_schedule') && actionData) {
    const scheduleAction = actionData.schedule_action ||
      (actionData.flattened_decision && actionData.flattened_decision.schedule_action)
    if (scheduleAction === 'replace_auto') {
      let added = 0
      const resultStr = actionData.result
      if (typeof resultStr === 'string') {
        const match = resultStr.match(/"added":\s*(\d+)/)
        if (match) added = parseInt(match[1], 10)
      } else if (resultStr && typeof resultStr === 'object') {
        added = resultStr.added || 0
      }
      if (added === 0) return false
    }
  }
  return true
}

export function parseActionsFromContent(raw, metadata) {
  // Check metadata for action first (matches Flutter behavior)
  if (metadata && metadata.action && typeof metadata.action === 'string') {
    const action = metadata.action
    const decision = metadata.decision || undefined

    let actionData = { ...(decision || {}) }

    if (action === 'combined_daily_recap') {
      actionData = {
        ...actionData,
        total_goals: metadata.total_goals,
        successful_goals: metadata.successful_goals,
        failed_goals: metadata.failed_goals,
        recap_date: metadata.recap_date,
        goals: metadata.goals,
      }
    }

    if (action === 'send_sms' && decision && decision.parameters) {
      const params = decision.parameters
      const recipients = params.recipients
      if (recipients && recipients.length > 0) {
        const firstRecipient = recipients[0]
        actionData = {
          ...actionData,
          message: firstRecipient.message,
          contact_name: firstRecipient.contact_name,
          phone_number: firstRecipient.phone_number,
        }
      }
    }

    let performAction
    if (decision && decision.perform_action !== undefined) {
      performAction = decision.perform_action === true
    } else if (metadata.performed !== undefined) {
      performAction = metadata.performed === true
    } else if (action === 'unblock_screen' && decision && decision.unblock_duration !== undefined) {
      performAction = decision.unblock_duration > 0
    } else {
      performAction = true
    }

    const status = performAction ? 'executed' : 'rejected'

    const actionSegment = {
      type: 'action',
      content: JSON.stringify(actionData),
      action: {
        type: action,
        status: status,
        data: actionData,
        display_text: undefined,
      },
    }

    const segments = []
    if (action === 'approve_goal' && raw.trim() && !raw.includes('[[ACTION_JSON:')) {
      segments.push(actionSegment)
      segments.push({ type: 'text', content: raw })
    } else {
      segments.push(actionSegment)
    }

    return { segments }
  }

  const parsedActions = []
  let searchIndex = 0

  while (searchIndex < raw.length) {
    const actionJsonStart = raw.indexOf('[[ACTION_JSON:', searchIndex)
    const actionIdStart = raw.indexOf('[[ACTION_ID:', searchIndex)

    let nextActionStart = -1
    let actionType = ''

    if (actionJsonStart !== -1 && (actionIdStart === -1 || actionJsonStart < actionIdStart)) {
      nextActionStart = actionJsonStart
      actionType = 'ACTION_JSON'
    } else if (actionIdStart !== -1) {
      nextActionStart = actionIdStart
      actionType = 'ACTION_ID'
    }

    if (nextActionStart === -1) break

    if (actionType === 'ACTION_JSON') {
      const jsonStart = nextActionStart + '[[ACTION_JSON:'.length
      let braceCount = 0
      let jsonEnd = -1
      let inString = false
      let escaped = false

      for (let i = jsonStart; i < raw.length; i++) {
        const char = raw[i]
        if (escaped) { escaped = false; continue }
        if (char === '\\') { escaped = true; continue }
        if (char === '"') { inString = !inString; continue }
        if (!inString) {
          if (char === '{') braceCount++
          else if (char === '}') {
            braceCount--
            if (braceCount === 0 && i + 2 < raw.length && raw.substring(i + 1, i + 3) === ']]') {
              jsonEnd = i + 3
              break
            }
          }
        }
      }

      if (jsonEnd !== -1) {
        parsedActions.push({
          type: 'ACTION_JSON',
          start: nextActionStart,
          end: jsonEnd,
          payload: raw.substring(jsonStart, jsonEnd - 2),
        })
        searchIndex = jsonEnd
      } else {
        searchIndex = nextActionStart + 1
      }
    } else if (actionType === 'ACTION_ID') {
      const closeIndex = raw.indexOf(']]', nextActionStart)
      if (closeIndex !== -1) {
        const payload = raw.substring(nextActionStart + '[[ACTION_ID:'.length, closeIndex)
        parsedActions.push({
          type: 'ACTION_ID',
          start: nextActionStart,
          end: closeIndex + 2,
          payload,
        })
        searchIndex = closeIndex + 2
      } else {
        searchIndex = nextActionStart + 1
      }
    }
  }

  const segments = []
  let lastMatchEnd = 0

  for (const action of parsedActions) {
    if (action.start > lastMatchEnd) {
      const textBefore = raw.substring(lastMatchEnd, action.start)
      if (textBefore.trim().length > 0) {
        const processedText = textBefore.replace(/(?<!\n)\n(?!\n)/g, '\n\n')
        segments.push({ type: 'text', content: processedText })
      }
    }

    if (action.type === 'ACTION_JSON') {
      try {
        const actionData = JSON.parse(action.payload)
        const actionType = actionData.action || 'generic'
        const performAction = actionData.perform_action ?? true
        const status = performAction === false ? 'rejected' : 'executed'

        segments.push({
          type: 'action',
          content: action.payload,
          action: {
            type: actionType,
            status: status,
            data: actionData,
            display_text: actionData.display_text,
          },
        })
      } catch (error) {
        console.error('Failed to parse ACTION_JSON:', error)
        segments.push({
          type: 'text',
          content: `[Invalid action: ${action.payload.substring(0, 50)}...]`,
        })
      }
    } else if (action.type === 'ACTION_ID') {
      segments.push({
        type: 'text',
        content: `[Action reference: ${action.payload}]`,
      })
    }

    lastMatchEnd = action.end
  }

  if (lastMatchEnd < raw.length) {
    let textAfter = raw.substring(lastMatchEnd)
    textAfter = textAfter.replace(/^\s*\[\s*\]\s*/, '')
    if (textAfter.trim().length > 0) {
      const processedText = textAfter.replace(/(?<!\n)\n(?!\n)/g, '\n\n')
      segments.push({ type: 'text', content: processedText })
    }
  }

  if (segments.length === 0) {
    segments.push({ type: 'text', content: raw })
  }

  return { segments }
}
