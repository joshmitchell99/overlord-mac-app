import { useState, useEffect, useRef } from 'react'
import { auth } from '../services/firebaseService'
import {
  Brain,
  Search,
  MessageSquare,
  History,
  User,
  Camera,
  MapPin,
  Timer,
  Calendar,
  BarChart3,
  Lightbulb,
  Target,
  Trash2,
  Wrench,
  Globe,
  ChevronRight,
  ChevronDown,
  Zap,
  CheckCircle,
  XCircle,
  Pencil,
  CircleDollarSign,
  Unlock,
  Phone,
  SkipForward,
  RefreshCw,
  Key,
} from 'lucide-react'

const TOOL_CONFIG = {
  // Memory tools
  memory_search:    { label: 'Searched Memory',        icon: Brain },
  memory_get:       { label: 'Read Memory',            icon: Brain },
  memory_write:     { label: 'Saved to Memory',        icon: Brain },
  memory_rewrite:   { label: 'Updated Memory',         icon: Brain },
  add_memory:       { label: 'Updated Memory',         icon: Brain },
  // Investigation tools
  check_actions:    { label: 'Checked Action History',  icon: History },
  get_chat_history: { label: 'Retrieved Chat History',  icon: MessageSquare },
  get_user_data:    { label: 'Retrieved User Data',     icon: User },
  get_goal_stats:   { label: 'Retrieved Performance History', icon: BarChart3 },
  retrieve_evidence:   { label: 'Retrieved Evidence',   icon: Camera },
  // Search tools
  search_docs:      { label: 'Searched Docs',           icon: Search },
  web_search:       { label: 'Searched the Web',        icon: Search },
  // Schedule tools (new)
  add_schedule_item:    { label: 'Added Schedule Item',     icon: Timer },
  remove_schedule_item: { label: 'Removed Schedule Item',   icon: Timer },
  update_schedule_item: { label: 'Updated Schedule Item',   icon: Timer },
  list_schedule:        { label: 'Listed Schedule',         icon: Timer },
  replace_schedule:     { label: 'Replaced Schedule',       icon: Timer },
  display_schedule:     { label: 'Displayed Schedule',     icon: Timer },
  // Schedule tools (legacy)
  update_goal_schedule: { label: 'Updated Schedule',        icon: Timer },
  cron_update:      { label: 'Updated Schedule',            icon: Calendar },
  cron_list:        { label: 'Listed Jobs',                 icon: Calendar },
  cron_delete:      { label: 'Removed Job',                 icon: Calendar },
  cron_create:      { label: 'Created Job',                 icon: Calendar },
  cron_runs:        { label: 'Checked Job History',         icon: Calendar },
  // Suggestions / analysis
  stats:            { label: 'Pulled Statistics',       icon: BarChart3 },
  improvements_suggestion: { label: 'Generated Improvements', icon: Lightbulb },
  goal_suggestions: { label: 'Generated Suggestions',  icon: Lightbulb },
  goal_optimizer:   { label: 'Optimized Goal',          icon: Lightbulb },
  load_skill:       { label: 'Loaded Skill',            icon: Lightbulb },
  // Support
  contact_human:    { label: 'Contacted Human',          icon: MessageSquare },
  // Location tools
  create_location:  { label: 'Saved Location',            icon: MapPin },
  update_location:  { label: 'Updated Location',          icon: MapPin },
  delete_location:  { label: 'Removed Location',          icon: MapPin },
  list_locations:   { label: 'Checked Locations',          icon: MapPin },
  // Evidence
  reanalyze_evidence: { label: 'Re-evaluated Evidence',   icon: Camera },
  // Goal action tools
  approve_goal:     { label: 'Approved Goal',            icon: CheckCircle },
  fail_goal:        { label: 'Failed Goal',              icon: XCircle },
  skip_goal:        { label: 'Skipped Goal',             icon: SkipForward },
  create_goal:      { label: 'Created Goal',             icon: Target },
  edit_goal:        { label: 'Edited Goal',              icon: Pencil },
  change_status:    { label: 'Changed Status',           icon: RefreshCw },
  // Communication tools
  charge_user:      { label: 'Charged User',             icon: CircleDollarSign },
  send_sms:         { label: 'Sent SMS',                 icon: MessageSquare },
  call_user:        { label: 'Called User',               icon: Phone },
  // Screen tools
  unblock_screen:   { label: 'Unblocked Screen',         icon: Unlock },
  // Other
  delete_goal:      { label: 'Deleted Goal',             icon: Trash2 },
  refund_charge:    { label: 'Refunded Charge',         icon: Target },
  reverse_failure:  { label: 'Reversed Failure',        icon: Target },
  update_bootstrap: { label: 'Completed Onboarding Step', icon: Wrench },
  update_user_settings: { label: 'Updated Settings',    icon: Wrench },
  edit_mac_list:    { label: 'Updated Blocking List',    icon: Wrench },
  save_mac_instructions: { label: 'Saved Mac Instructions', icon: Wrench },
  complete_mac_onboarding: { label: 'Finished Onboarding', icon: CheckCircle },
  permission_disabled_already_charged: { label: 'Checked Permissions', icon: Wrench },
  http_request:     { label: 'HTTP Request',              icon: Globe },
  // Credentials
  request_credential: { label: 'Requested Credential',   icon: Key },
  reveal_credential:  { label: 'Revealed Credential',    icon: Key },
  generic:          { label: 'Action',                  icon: Wrench },
}

const _USER_DATA_LABELS = {
  health: 'Retrieved Health Data',
  calendar: 'Retrieved Calendar',
  location: 'Retrieved Location',
  mac_usage: 'Retrieved Mac Usage',
  settings: 'Retrieved Settings',
  contacts: 'Retrieved Contacts',
  overlord_settings: 'Retrieved App Settings',
  personality: 'Retrieved Personality',
  user_doc_settings: 'Retrieved Account Settings',
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

export function getToolConfig(action) {
  return getConfig(action)
}

function getConfig(action) {
  const name = action.data?.action || action.type

  // Dynamic label for http_request - show friendly domain name
  if (name === 'http_request') {
    const args = action.data?.args
    if (args?.url) {
      const domain = extractDomain(args.url)
      if (domain) {
        return { label: `Fetched from ${domain}`, icon: Globe }
      }
    }
    return TOOL_CONFIG.http_request
  }

  // Dynamic label for get_user_data based on the data type retrieved
  if (name === 'get_user_data') {
    try {
      const result = action.data?.result
      if (result) {
        const parsed = JSON.parse(result)
        const dataType = parsed?.type
        if (dataType && _USER_DATA_LABELS[dataType]) {
          return { label: _USER_DATA_LABELS[dataType], icon: User }
        }
      }
    } catch { /* fall through */ }
  }

  // Dynamic label for load_skill - extract skill name from result header
  if (name === 'load_skill') {
    const result = action.data?.result || action.data?.message || ''
    const headerMatch = result.match(/^#{1,3}\s+(.+)/m)
    if (headerMatch) {
      return { label: `Loaded ${headerMatch[1].trim()}`, icon: Lightbulb }
    }
  }

  return TOOL_CONFIG[name] || { label: name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), icon: Wrench }
}

function isErrorAction(action) {
  return action.data?.status === 'rejected' || action.data?.perform_action === false
}

export function isToolActionError(action) {
  return isErrorAction(action)
}

function cleanCronMessage(msg) {
  // "Created task 'gym-deadline' (s_agent_...) with schedule '...'" -> "Scheduled: gym deadline"
  const createMatch = msg.match(/^Created \w+ '([^']+)' \([^)]+\) with schedule/)
  if (createMatch) return `Scheduled: ${createMatch[1].replace(/[-_]/g, ' ')}`

  // "Deleted job 'name' (s_agent_...)" -> "Removed: name"
  const deleteMatch = msg.match(/^Deleted job '([^']+)'/)
  if (deleteMatch) return `Removed: ${deleteMatch[1].replace(/[-_]/g, ' ')}`

  // "Updated job 'name' (s_agent_...): ..." -> "Updated: name"
  const updateMatch = msg.match(/^Updated job '([^']+)'/)
  if (updateMatch) return `Updated: ${updateMatch[1].replace(/[-_]/g, ' ')}`

  // Strip any leftover (s_agent_...) or (s_coach_...) IDs
  return msg.replace(/\s*\([^)]*s_(?:agent|coach)_[^)]*\)/g, '')
}

function _friendlyDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return dateStr
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = Math.round((today.getTime() - target.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff === -1) return 'Tomorrow'
  const day = d.getDate()
  const suffix = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th'
  const month = d.toLocaleString('en-US', { month: 'short' })
  return `${month} ${day}${suffix}`
}

/** Parse the result JSON and generate a human-readable summary based on tool type. */
function summarizeResult(action) {
  const result = action.data?.result
  if (!result) return null
  try {
    const parsed = JSON.parse(result)
    if (!parsed || typeof parsed !== 'object') return null
    const name = action.data?.action || ''

    if (name === 'get_user_data') {
      const dates = parsed.dates
      if (Array.isArray(dates) && dates.length > 0) {
        const start = _friendlyDate(dates[0])
        const end = _friendlyDate(dates[dates.length - 1])
        if (dates.length === 1) return start
        if (start === end) return start
        return `${start} - ${end}`
      }
      return null
    }
    if (name === 'check_actions') {
      const actions = parsed.actions || {}
      const days = Object.keys(actions).length
      return days > 0 ? `${days} day${days !== 1 ? 's' : ''} of actions` : 'No actions found'
    }
    if (name === 'get_chat_history') {
      const days = parsed.days_back
      const note = parsed.note
      if (note) return note
      return days ? `${days} day${days !== 1 ? 's' : ''} back` : 'Retrieved messages'
    }
    if (name === 'get_goal_stats') {
      const rate = parsed.approval_rate
      const streak = parsed.current_streak
      if (rate) return `${rate} approval, ${streak || 0} day streak`
      return parsed.message || null
    }
    if (name === 'retrieve_evidence') {
      return parsed.summary || null
    }
    if (name === 'memory_search') {
      const matches = parsed.results
      if (Array.isArray(matches)) return `${matches.length} result${matches.length !== 1 ? 's' : ''}`
      if (typeof parsed.results === 'string') return parsed.results.slice(0, 80)
    }
    if (name === 'memory_get') {
      const content = parsed.content || parsed.data
      if (content) return content.slice(0, 60) + (content.length > 60 ? '...' : '')
    }
    if (name === 'load_skill') {
      return 'Loaded'
    }
    // Generic: check for message or summary field
    if (parsed.message && typeof parsed.message === 'string') return parsed.message
    if (parsed.summary && typeof parsed.summary === 'string') return parsed.summary
  } catch {
    // Not JSON - use raw string if short enough
    if (result.length <= 80) return result
  }
  return null
}

function getUserMessage(action) {
  const msg = action.data?.message

  // Always try the richer parsed-result summary first
  const richSummary = summarizeResult(action)
  if (richSummary) return richSummary

  if (!msg) return null
  // Guard against raw JSON leaking into the display
  if (msg.trimStart().startsWith('{') || msg.trimStart().startsWith('[')) {
    if (isErrorAction(action)) {
      const config = getConfig(action)
      return `${config.label} failed`
    }
    return null
  }
  // Clean up cron/schedule messages for user display
  const actionName = action.data?.action || ''
  if (actionName.startsWith('cron_') || actionName === 'update_goal_schedule' || ['add_schedule_item', 'remove_schedule_item', 'update_schedule_item', 'list_schedule', 'replace_schedule'].includes(actionName)) {
    return cleanCronMessage(msg)
  }
  return msg
}

function getShortDetail(action) {
  if (isErrorAction(action)) return 'Failed'
  const msg = getUserMessage(action)
  if (!msg) return null
  return msg.length > 50 ? msg.slice(0, 50) + '...' : msg
}

export function getToolShortDetail(action) {
  return getShortDetail(action)
}

function getFullDetail(action) {
  if (isErrorAction(action)) {
    const msg = getUserMessage(action)
    return msg || 'Action failed - an error occurred'
  }
  const msg = getUserMessage(action)
  if (msg) return msg
  const result = action.data?.result
  // Don't show raw JSON to the user
  if (result && (result.trimStart().startsWith('{') || result.trimStart().startsWith('['))) {
    return null
  }
  return result || null
}

/** Format a JSON string or object for admin display. */
function formatAdminJson(value) {
  if (!value) return null
  try {
    const obj = typeof value === 'string' ? JSON.parse(value) : value
    return JSON.stringify(obj, null, 2)
  } catch {
    return typeof value === 'string' ? value : null
  }
}

/** Build admin-only detail entries from action data. */
function getAdminDetails(action) {
  const entries = []
  const d = action.data || {}

  // Args (input to the tool)
  const args = d.args
  if (args && Object.keys(args).length > 0) {
    entries.push({ label: 'Args', value: formatAdminJson(args) || '' })
  }

  // Message (human-readable summary)
  const msg = d.message
  if (msg) entries.push({ label: 'Message', value: msg })

  // Result (raw tool output)
  const result = d.result
  if (result) {
    const formatted = formatAdminJson(result)
    entries.push({ label: 'Result', value: formatted || result })
  }

  // Goal ID
  const goalId = d.goal_id
  if (goalId) entries.push({ label: 'Goal ID', value: goalId })

  // Status
  const status = d.status
  if (status) entries.push({ label: 'Status', value: status })

  return entries
}

function ActionRow({ action, isLast, iconColor, isAdmin }) {
  const [isOpen, setIsOpen] = useState(false)
  const config = getConfig(action)
  const Icon = config.icon
  const shortDetail = getShortDetail(action)
  const fullDetail = getFullDetail(action)
  const adminDetails = isAdmin ? getAdminDetails(action) : []
  const hasDetail = isAdmin ? adminDetails.length > 0 : !!fullDetail
  const isError = isErrorAction(action)

  return (
    <div style={{ display: 'flex', gap: '12px', position: 'relative' }}>
      {/* Circle column with connector line */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', width: 36 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            width: 36,
            height: 36,
            backgroundColor: 'var(--background)',
            border: isError ? '1px solid #ef4444' : '1px solid var(--border)',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <Icon style={{ width: 17, height: 17, color: isError ? '#ef4444' : iconColor }} />
        </div>
        {!isLast && (
          <div
            style={{
              width: 1,
              flex: 1,
              minHeight: 8,
              backgroundColor: 'var(--border)',
            }}
          />
        )}
      </div>

      {/* Content column */}
      <div style={{ flex: 1, minWidth: 0, marginBottom: isLast ? 0 : 8 }}>
        {/* Label row - tappable if has detail */}
        <button
          onClick={() => hasDetail && setIsOpen(!isOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            width: '100%',
            textAlign: 'left',
            height: 36,
            cursor: hasDetail ? 'pointer' : 'default',
            background: 'none',
            border: 'none',
            padding: 0,
            fontFamily: 'inherit',
          }}
        >
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span
              style={{ fontSize: '14px', color: 'var(--foreground)', fontWeight: 500 }}
            >
              {config.label}
            </span>
            {shortDetail && !isOpen && (
              <span
                style={{
                  marginLeft: '6px',
                  fontSize: '12px',
                  color: isError ? '#ef4444' : 'var(--muted-foreground)',
                  opacity: isError ? 0.8 : 0.6,
                }}
              >
                ({shortDetail})
              </span>
            )}
          </div>
          {hasDetail && (
            <ChevronRight
              style={{
                flexShrink: 0,
                width: 16,
                height: 16,
                color: 'var(--muted-foreground)',
                opacity: 0.35,
                transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 200ms ease',
              }}
            />
          )}
        </button>

        {/* Expandable detail */}
        <div
          style={{
            display: 'grid',
            gridTemplateRows: isOpen ? '1fr' : '0fr',
            transition: 'grid-template-rows 200ms ease',
          }}
        >
          <div style={{ overflow: 'hidden' }}>
            {isAdmin ? (
              <div style={{ paddingTop: 4, paddingBottom: 8, paddingRight: 8 }}>
                {adminDetails.map((entry, i) => (
                  <div key={i} style={{ marginBottom: i < adminDetails.length - 1 ? 6 : 0 }}>
                    <span
                      style={{ fontSize: '12px', color: 'var(--muted-foreground)', fontWeight: 600 }}
                    >
                      {entry.label}
                    </span>
                    <pre
                      style={{
                        fontSize: '12px',
                        color: 'var(--muted-foreground)',
                        opacity: 0.8,
                        lineHeight: 1.4,
                        marginTop: 1,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                        maxHeight: 200,
                        overflow: 'auto',
                      }}
                    >
                      {entry.value}
                    </pre>
                  </div>
                ))}
              </div>
            ) : (
              <p
                style={{
                  fontSize: '12px',
                  color: 'var(--muted-foreground)',
                  lineHeight: 1.5,
                  paddingTop: 4,
                  paddingBottom: 8,
                  paddingRight: 8,
                  margin: 0,
                }}
              >
                {fullDetail}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function IntermediateActionsGroup({ actions }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isAdmin = auth.currentUser?.email?.endsWith('@forfeit.app') || false

  if (actions.length === 0) return null

  const iconColor = 'var(--foreground)'

  // Single action - render directly without collapsible wrapper
  if (actions.length === 1) {
    return (
      <div style={{ marginBottom: '6px', padding: '6px 0' }}>
        <ActionRow
          action={actions[0]}
          isLast={true}
          iconColor={iconColor}
          isAdmin={isAdmin}
        />
      </div>
    )
  }

  return (
    <div style={{ marginBottom: '6px' }}>
      {/* Collapsed header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '6px 0',
          transition: 'opacity 0.15s',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          width: '100%',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7' }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
      >
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            width: 36,
            height: 36,
            backgroundColor: 'var(--background)',
            border: '1px solid var(--border)',
          }}
        >
          <Zap style={{ width: 17, height: 17, color: iconColor }} />
        </div>
        <span
          style={{
            fontSize: '14px',
            flex: 1,
            textAlign: 'left',
            color: 'var(--foreground)',
            fontWeight: 500,
          }}
        >
          Performed {actions.length} actions
        </span>
        <ChevronDown
          style={{
            flexShrink: 0,
            width: 16,
            height: 16,
            color: 'var(--muted-foreground)',
            opacity: 0.4,
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 200ms ease',
          }}
        />
      </button>

      {/* Expandable action list */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: isExpanded ? '1fr' : '0fr',
          transition: 'grid-template-rows 250ms ease',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <div style={{ paddingTop: 4 }}>
            {actions.map((action, idx) => (
              <ActionRow
                key={idx}
                action={action}
                isLast={idx === actions.length - 1}
                iconColor={iconColor}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
