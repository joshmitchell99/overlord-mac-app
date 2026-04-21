import React from 'react'
import {
  Check, X, Zap, Target, CheckCircle, XCircle, CreditCard,
  Unlock, MessageSquare, Clock, Lock, Phone, PhoneMissed,
  PhoneOff, SkipForward, RefreshCw, Lightbulb, Ban, Recycle,
  Pencil, AlertCircle, Brain, Info, CircleDollarSign, CircleOff,
  KeyRound, Eye, ShieldAlert, Palmtree, CalendarRange, Mail,
  AlarmClock, Bell, Timer, Wrench, Bug, LockOpen, Hourglass,
  ShieldPlus, TextCursorInput, TimerReset, Trash2, DollarSign,
  Calendar, Repeat, User, Users,
} from 'lucide-react'

/**
 * Action card matching the webapp's ActionWidget.tsx design.
 * Uses the same layout: outer container with 16px radius, header with icon circle,
 * goal name subtitle, reason section, and detail chips.
 */

// Human-readable labels for action types
const ACTION_LABELS = {
  approve_goal: 'Goal Approved',
  fail_goal: 'Goal Failed',
  charge_user: 'Charge Applied',
  charge: 'Charge Applied',
  charged: 'Charged',
  charge_failed: 'Charge Failed',
  create_goal: 'Goal Created',
  delete_goal: 'Goal Deleted',
  edit_goal: 'Goal Edited',
  unblock_screen: 'Temporary Unblock',
  block_screen: 'Screen Blocked',
  set_blocked_status: 'Blocking Updated',
  sync_screen_blocking: 'Blocking Synced',
  send_sms: 'SMS Sent',
  send_email: 'Email Sent',
  call_user: 'Call Placed',
  call_failed: 'Call Failed',
  call_completed: 'Call Completed',
  skip_goal: 'Goal Skipped',
  change_status: 'Status Changed',
  revive_goal: 'Goal Revived',
  edit_mac_triggers: 'Triggers Updated',
  combined_daily_recap: 'Daily Recap',
  request_credential: 'Credential Requested',
  reveal_credential: 'Credential Revealed',
  request_domain_approval: 'Domain Approval',
  request_credential_domain_binding: 'Credential Binding',
  apply_holiday: 'Holiday Applied',
  update_goal_schedule: 'Schedule Updated',
  cron_create: 'Schedule Created',
  cron_delete: 'Schedule Deleted',
  cron_update: 'Schedule Updated',
  add_schedule_item: 'Schedule Item Added',
  remove_schedule_item: 'Schedule Item Removed',
  update_schedule_item: 'Schedule Item Updated',
  replace_schedule: 'Schedule Replaced',
  display_schedule: 'Schedule',
  troubleshoot: 'Troubleshooting',
  update_weasel_lock: 'Weasel Lock Updated',
  error: 'Error',
  contact_human: 'Human Support Requested',
  refund_charge: 'Charge Refunded',
  reverse_failure: 'Failure Reversed',
}

function getActionTitle(actionName, data, status) {
  const isRejected = status === 'rejected'
  const isExecuted = status === 'executed' || status === 'approved'

  switch (actionName) {
    case 'create_goal':
      if (isRejected) return 'Goal Creation Failed'
      return isExecuted ? 'Goal Created' : 'Create Goal'
    case 'approve_goal':
      return isRejected ? 'Goal Approval Rejected' : isExecuted ? 'Goal Approved' : 'Approve Goal'
    case 'fail_goal':
      return isRejected ? 'Goal Fail Rejected' : isExecuted ? 'Goal Failed' : 'Fail Goal'
    case 'delete_goal':
      return isRejected ? 'Goal Deletion Rejected' : isExecuted ? 'Goal Deleted' : 'Delete Goal'
    case 'edit_goal':
    case 'edit_mac_triggers':
      return isRejected ? 'Goal Edit Rejected' : isExecuted ? 'Goal Edited' : 'Edit Goal'
    case 'revive_goal':
      return isRejected ? 'Goal Revival Rejected' : isExecuted ? 'Goal Revived' : 'Revive Goal'
    case 'charge_user':
    case 'charge':
    case 'charged': {
      if (isRejected) return 'User Charge Rejected'
      if (isExecuted) {
        const rawAmount = data.amount || data.charge_amount
        if (rawAmount !== undefined) {
          const amount = typeof rawAmount === 'number' ? rawAmount : parseFloat(String(rawAmount))
          const formatted = amount === Math.floor(amount) ? amount.toString() : amount.toFixed(2)
          return `Charged $${formatted}`
        }
        return 'User Charged'
      }
      return 'Charge User'
    }
    case 'charge_failed': {
      const rawAttempted = data.amount || data.charge_amount
      const failReason = data.failure_reason
      if (rawAttempted !== undefined) {
        const amt = typeof rawAttempted === 'number' ? rawAttempted : parseFloat(String(rawAttempted))
        const fmtAmt = amt === Math.floor(amt) ? amt.toString() : amt.toFixed(2)
        if (failReason) return `Charge Failed: $${fmtAmt}`
        return `Charge Failed: $${fmtAmt}`
      }
      return 'Charge Failed'
    }
    case 'unblock_screen':
      return isRejected ? 'Unblock Rejected' : isExecuted ? 'Temporary Unblock' : 'Unblock Screen'
    case 'block_screen':
      return isRejected ? 'Screen Block Rejected' : isExecuted ? 'Screen Blocked' : 'Block Screen'
    case 'set_blocked_status': {
      const blocked = data.blocked === true || String(data.message || '').includes('is now blocked')
      if (isRejected) return 'Status Change Rejected'
      return blocked ? 'Screen Blocked' : 'Screen Unblocked'
    }
    case 'send_sms':
      if (isRejected) return 'SMS Not Sent'
      return isExecuted ? 'SMS Sent' : 'Send SMS'
    case 'send_email':
      if (isRejected) return 'Email Not Sent'
      return isExecuted ? 'Email Sent' : 'Send Email'
    case 'contact_human':
      return 'Human Support Requested'
    default: {
      const fallback = ACTION_LABELS[actionName]
      if (fallback) return isRejected ? `${fallback} Rejected` : fallback
      const formatted = actionName
        .split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
      return isRejected ? `${formatted} Rejected` : formatted
    }
  }
}

function getActionIcon(actionName, data) {
  const iconProps = { size: 16, strokeWidth: 1.8 }
  switch (actionName) {
    case 'create_goal': return <Target {...iconProps} />
    case 'approve_goal': return <CheckCircle {...iconProps} />
    case 'fail_goal': return <XCircle {...iconProps} />
    case 'delete_goal': return <Trash2 {...iconProps} />
    case 'edit_goal':
    case 'edit_mac_triggers': return <Pencil {...iconProps} />
    case 'charge_user':
    case 'charge':
    case 'charged': return <CircleDollarSign {...iconProps} />
    case 'charge_failed': return <CircleOff {...iconProps} />
    case 'unblock_screen': return <Unlock {...iconProps} />
    case 'block_screen': return <Ban {...iconProps} />
    case 'set_blocked_status': {
      const blocked = data.blocked === true || String(data.message || '').includes('is now blocked')
      return blocked ? <Lock {...iconProps} /> : <Unlock {...iconProps} />
    }
    case 'sync_screen_blocking': return <RefreshCw {...iconProps} />
    case 'troubleshoot': return <Wrench {...iconProps} />
    case 'send_sms': return <MessageSquare {...iconProps} />
    case 'send_email': return <Mail {...iconProps} />
    case 'contact_human': return <Bug {...iconProps} />
    case 'call_user': return <Phone {...iconProps} />
    case 'call_failed': return <PhoneMissed {...iconProps} />
    case 'call_completed': return <PhoneOff {...iconProps} />
    case 'skip_goal': return <SkipForward {...iconProps} />
    case 'apply_holiday': return <Palmtree {...iconProps} />
    case 'change_status': return <RefreshCw {...iconProps} />
    case 'revive_goal': return <Recycle {...iconProps} />
    case 'error': return <AlertCircle {...iconProps} />
    case 'add_memory': return <Brain {...iconProps} />
    case 'improvements_suggestion':
    case 'goal_suggestions':
    case 'goal_optimizer': return <Lightbulb {...iconProps} />
    case 'request_credential': return <KeyRound {...iconProps} />
    case 'reveal_credential': return <Eye {...iconProps} />
    case 'request_domain_approval': return <ShieldAlert {...iconProps} />
    case 'add_schedule_item':
    case 'update_schedule_item': {
      const it = data.item_type
      if (it === 'alarm') return <AlarmClock {...iconProps} />
      if (it === 'notification') return <Bell {...iconProps} />
      if (it === 'call') return <Phone {...iconProps} />
      if (it === 'agent_task') return <Zap {...iconProps} />
      return <Timer {...iconProps} />
    }
    case 'remove_schedule_item': return <Trash2 {...iconProps} />
    case 'display_schedule':
    case 'replace_schedule':
    case 'cron_create':
    case 'cron_update': return <Timer {...iconProps} />
    case 'cron_delete': return <Trash2 {...iconProps} />
    case 'update_weasel_lock': {
      const la = data.lock_action || ''
      if (la === 'disabled') return <LockOpen {...iconProps} />
      if (la === 'timer_extended') return <TimerReset {...iconProps} />
      if (la === 'strengthened') return <ShieldPlus {...iconProps} />
      return <Lock {...iconProps} />
    }
    case 'refund_charge': return <CircleDollarSign {...iconProps} />
    case 'reverse_failure': return <Recycle {...iconProps} />
    default: return <Zap {...iconProps} />
  }
}

function DetailChip({ label, value }) {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '6px 10px',
      borderRadius: '6px',
      border: '1px solid var(--border)',
      background: 'transparent',
      fontSize: '12px',
      gap: '4px',
    }}>
      <span style={{ opacity: 0.6 }}>{label}:</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  )
}

// Keys to hide from the details display
const HIDDEN_KEYS = new Set([
  'action', 'action_id', 'perform_action', 'goal_id', 'real_goal_id',
  'goal_name', 'status', 'message', 'actions', 'decisions_summary',
  'should_perform', 'action_thinking', 'action_summary', 'icon_name',
  'icon_codepoint', 'parameters', 'result', 'success',
  'flattened_decision', 'decision_data', 'goal_info', 'args', 'display_text',
  'unblock_used', 'reblock_used', 'unblock_end_time', 'unblock_start_time',
  'recipients_count', 'failed_sends', 'successful_sends', 'recipients',
  'send_results', 'contact_name', 'phone_number',
  'sms_actually_sent', 'sms_failure_reason',
  'email_actually_sent', 'email_failure_reason',
  'mac_triggers', 'dates_of_approval', 'date_range', 'affected_goals',
  'skipped_automation', 'total_dates_approved', 'refund_count',
  'reason', 'rejection_reason', 'failure_reason', 'amount', 'changes',
  'goal_description', 'goal_type', 'goal_schedule', 'target_date',
  'specific_days', 'is_infinite', 'punishment_amount', 'sms_enabled',
  'screen_blocking', 'goal_category', 'firebase_created', 'blocked_exceptions',
  'limit_type', 'allowed_minutes', 'allowed_opens', 'minutes_per_open',
  'start_time', 'end_time', 'blocking_days', 'unblock_exceptions',
  'setup_instructions', 'frequency', 'start_date', 'end_date', 'active_days',
  'explanation', 'auto_created_for_source',
  'schedule_action', 'item_type', 'item_label', 'item_time', 'item_enabled', 'item_id',
  'lock_action', 'lock_key', 'lock_type', 'display_name',
  'new_unlock_date', 'change', 'note', 'timer_unlock_date', 'timer_duration_days',
  'random_text_length', 'delay_seconds', 'time_range_window', 'time_range_days',
  'test_type', 'currency_symbol', 'blocked', 'issue_type', 'diagnostic_message',
  'charge_amount',
])

function formatStatusText(status) {
  const map = {
    needsToSubmit: 'Needs to Submit',
    doesntNeedToSubmit: 'No Need to Submit',
    shouldSubmit: 'Should Submit',
    approved: 'Approved',
    submitted: 'Submitted',
    failed: 'Failed',
    unverified: 'Unverified',
    expired: 'Expired',
    skipped: 'Skipped',
    conditional: 'Conditional Goal',
    pending: 'Pending Review',
  }
  return map[status] || status.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
}

export default function ActionCard({ action }) {
  if (!action || !action.data) return null

  const data = action.data
  const actionName = data.action || action.type || 'unknown'
  const isExecuted = action.status === 'executed' || action.status === 'approved'
  const isRejected = action.status === 'rejected'

  const title = getActionTitle(actionName, data, action.status)
  const icon = getActionIcon(actionName, data)

  const goalName = data.goal_name || data.goalName || ''
  const reason = data.reason || data.rejection_reason || ''
  const description = data.goal_description || data.description || ''

  // Gather detail chips data
  const chips = []
  if (data.frequency) chips.push({ label: 'Frequency', value: data.frequency })
  if (data.new_status) chips.push({ label: 'Status', value: formatStatusText(data.new_status) })
  if (data.start_date) chips.push({ label: 'Start', value: data.start_date })
  if (data.end_date) chips.push({ label: 'End', value: data.is_infinite ? 'Ongoing' : data.end_date })
  if (data.unblock_duration) {
    const secs = parseInt(String(data.unblock_duration), 10)
    if (!isNaN(secs)) {
      const mins = Math.floor(secs / 60)
      const remSecs = secs % 60
      const val = mins > 0
        ? `${mins} min${mins !== 1 ? 's' : ''}${remSecs > 0 ? ` ${remSecs}s` : ''}`
        : `${secs}s`
      chips.push({ label: 'Duration', value: val })
    }
  }

  // Visible params for details section
  const visibleParams = Object.entries(data).filter(
    ([key, value]) =>
      !HIDDEN_KEYS.has(key) &&
      value !== null &&
      value !== undefined &&
      String(value).trim() !== ''
  )

  // Filter out long values or objects
  const filteredParams = visibleParams.filter(([, value]) => {
    if (typeof value === 'object') return false
    if (String(value).length > 200) return false
    return true
  })

  return (
    <div
      style={{
        margin: '8px 0',
        borderRadius: '16px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          background: 'var(--background)',
          border: isRejected
            ? '1px solid rgba(239, 68, 68, 0.4)'
            : '1px solid var(--border)',
          borderRadius: '16px',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            {/* Icon circle */}
            <div
              style={{
                flexShrink: 0,
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                border: '1.5px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isRejected ? '#FF3B30' : 'var(--foreground)',
                marginTop: '1px',
              }}
            >
              {icon}
            </div>

            {/* Title + goal name */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span
                style={{
                  fontWeight: 600,
                  fontSize: '14px',
                  color: isRejected ? '#FF3B30' : 'var(--foreground)',
                }}
              >
                {title}
              </span>
              {goalName && goalName !== 'master_chat' && goalName !== 'new_goal' && !/^goal_[a-z0-9]+$/i.test(goalName) && (
                <span
                  style={{
                    fontSize: '12px',
                    color: 'var(--muted-foreground)',
                  }}
                >
                  {goalName}
                </span>
              )}
            </div>
          </div>

          {/* Status badge - only show for rejected */}
          {isRejected && (
            <XCircle size={16} style={{ flexShrink: 0, color: '#FF3B30', marginTop: '2px' }} />
          )}
        </div>

        {/* Description (for create_goal) */}
        {description && (
          <div style={{ padding: '0 14px 10px' }}>
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'transparent',
                fontSize: '13px',
                fontStyle: 'italic',
                color: 'var(--foreground)',
              }}
            >
              "{description}"
            </div>
          </div>
        )}

        {/* Reason section */}
        {reason && (
          <div style={{ padding: '0 14px 10px' }}>
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                border: isRejected
                  ? '1px solid rgba(239, 68, 68, 0.3)'
                  : '1px solid var(--border)',
                background: isRejected
                  ? 'rgba(239, 68, 68, 0.05)'
                  : 'transparent',
                fontSize: '13px',
              }}
            >
              <span style={{ opacity: 0.6 }}>Reason: </span>
              <span style={{ fontWeight: 600, color: isRejected ? '#FF3B30' : 'var(--foreground)' }}>
                {reason}
              </span>
            </div>
          </div>
        )}

        {/* Detail chips */}
        {chips.length > 0 && (
          <div style={{ padding: '0 14px 10px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {chips.map((chip, i) => (
              <DetailChip key={i} label={chip.label} value={chip.value} />
            ))}
          </div>
        )}

        {/* Details section - visible params */}
        {filteredParams.length > 0 && actionName !== 'contact_human' && (
          <div style={{ padding: '0 14px 12px' }}>
            <div
              style={{
                paddingTop: '10px',
                borderTop: '1px solid var(--border)',
              }}
            >
              <div style={{ fontSize: '12px', opacity: 0.6, marginBottom: '8px' }}>Details</div>
              {filteredParams.map(([key, value]) => {
                let displayKey = key
                  .split('_')
                  .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(' ')

                if (key === 'charge_message') displayKey = 'Charged Amount'

                let displayValue = String(value)
                if (key === 'new_status') displayValue = formatStatusText(displayValue)

                return (
                  <div
                    key={key}
                    style={{
                      marginBottom: '6px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                    }}
                  >
                    <Info size={14} style={{ opacity: 0.6, flexShrink: 0, marginTop: '1px' }} />
                    <span style={{ wordBreak: 'break-all', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                      <span style={{ fontWeight: 600 }}>{displayKey}:</span>{' '}
                      {displayValue}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
