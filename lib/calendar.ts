import type {
  AIPersonalityModel,
  CalendarEvent,
  CalendarEventPriority,
  CalendarEventRecurrence,
  CalendarEventTag,
} from '@/lib/types'

const VALID_TAGS: CalendarEventTag[] = ['casual', 'important', 'super_important', 'health', 'study', 'work', 'social']
const VALID_PRIORITIES: CalendarEventPriority[] = ['low', 'medium', 'high', 'critical']
const VALID_RECURRENCES: CalendarEventRecurrence[] = ['none', 'daily', 'weekly', 'monthly']

export function isMissingTableError(message: string) {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('could not find the table') ||
    (normalized.includes('relation') && normalized.includes('does not exist'))
  )
}

export function normalizeCalendarEvent(input: Partial<CalendarEvent>, userId: string): CalendarEvent {
  const nowIso = new Date().toISOString()
  const startsAt = toIso(input.starts_at) || nowIso
  const endsAt = toIso(input.ends_at) || new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString()

  const tag = VALID_TAGS.includes(input.tag as CalendarEventTag) ? (input.tag as CalendarEventTag) : 'casual'
  const priority = VALID_PRIORITIES.includes(input.priority as CalendarEventPriority)
    ? (input.priority as CalendarEventPriority)
    : tag === 'super_important'
    ? 'critical'
    : tag === 'important'
    ? 'high'
    : 'medium'
  const recurrence = VALID_RECURRENCES.includes(input.recurrence as CalendarEventRecurrence)
    ? (input.recurrence as CalendarEventRecurrence)
    : 'none'

  return {
    id: String(input.id || crypto.randomUUID()),
    user_id: String(input.user_id || userId),
    title: String(input.title || 'Untitled event').slice(0, 160),
    starts_at: startsAt,
    ends_at: endsAt,
    tag,
    priority,
    reminder_minutes: normalizeReminder(input.reminder_minutes),
    recurrence,
    location: input.location ? String(input.location).slice(0, 240) : null,
    notes: input.notes ? String(input.notes).slice(0, 2000) : null,
    completed: Boolean(input.completed),
    created_at: toIso(input.created_at) || nowIso,
    updated_at: toIso(input.updated_at) || nowIso,
  }
}

export function normalizeReminder(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 60
  return Math.min(7 * 24 * 60, Math.max(0, Math.round(parsed)))
}

function toIso(value: unknown) {
  if (!value) return null
  const parsed = new Date(String(value))
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

export function getFallbackCalendarEvents(model: unknown, userId: string): CalendarEvent[] {
  if (!model || typeof model !== 'object') return []
  const typedModel = model as AIPersonalityModel
  const raw = Array.isArray(typedModel.calendar_events) ? typedModel.calendar_events : []
  return raw
    .map((event) => normalizeCalendarEvent(event, userId))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
}

export function withFallbackCalendarEvents(
  model: unknown,
  userId: string,
  events: CalendarEvent[],
): AIPersonalityModel {
  const safeModel = model && typeof model === 'object' ? (model as AIPersonalityModel) : {}
  const normalized = events.map((event) => normalizeCalendarEvent(event, userId))
  return {
    ...safeModel,
    calendar_events: normalized,
  }
}

export function formatEventForPrompt(event: CalendarEvent) {
  const start = new Date(event.starts_at)
  const end = new Date(event.ends_at)
  const date = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const startTime = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const endTime = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${event.title} | ${date} ${startTime}-${endTime} | tag=${event.tag} | priority=${event.priority} | reminder=${event.reminder_minutes}m`
}

export interface CalendarConflict {
  first: CalendarEvent
  second: CalendarEvent
  overlapMinutes: number
  severity: 'warning' | 'critical'
}

export interface ReminderDueItem {
  event: CalendarEvent
  remindAt: string
  startsInMinutes: number
}

export interface PriorityRiskItem {
  event: CalendarEvent
  conflictingLowPriority: CalendarEvent[]
}

export function getCalendarConflicts(events: CalendarEvent[]) {
  const sorted = [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const conflicts: CalendarConflict[] = []

  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const first = sorted[i]
      const second = sorted[j]
      const firstStart = new Date(first.starts_at).getTime()
      const firstEnd = new Date(first.ends_at).getTime()
      const secondStart = new Date(second.starts_at).getTime()
      const secondEnd = new Date(second.ends_at).getTime()

      if (secondStart >= firstEnd) break
      const overlap = Math.min(firstEnd, secondEnd) - Math.max(firstStart, secondStart)
      if (overlap <= 0) continue

      const overlapMinutes = Math.round(overlap / 60000)
      const severity =
        first.priority === 'critical' || second.priority === 'critical' || first.tag === 'super_important' || second.tag === 'super_important'
          ? 'critical'
          : 'warning'
      conflicts.push({ first, second, overlapMinutes, severity })
    }
  }

  return conflicts
}

export function getDueReminders(events: CalendarEvent[], lookAheadMinutes = 180) {
  const now = Date.now()
  return events
    .filter((event) => !event.completed)
    .map((event) => {
      const startsAt = new Date(event.starts_at).getTime()
      const remindAt = startsAt - event.reminder_minutes * 60000
      const startsInMinutes = Math.round((startsAt - now) / 60000)
      return {
        event,
        remindAt: new Date(remindAt).toISOString(),
        startsInMinutes,
      }
    })
    .filter((row) => row.startsInMinutes >= 0 && row.startsInMinutes <= lookAheadMinutes)
    .sort((a, b) => a.startsInMinutes - b.startsInMinutes)
}

export function getPriorityRiskItems(events: CalendarEvent[]) {
  const upcoming = [...events]
    .filter((event) => !event.completed && new Date(event.ends_at).getTime() >= Date.now())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))

  const riskItems: PriorityRiskItem[] = []

  for (const event of upcoming) {
    const isCritical = event.priority === 'critical' || event.tag === 'super_important'
    if (!isCritical) continue

    const startTs = new Date(event.starts_at).getTime()
    const focusWindowStart = startTs - 4 * 60 * 60000

    const conflictingLowPriority = upcoming.filter((other) => {
      if (other.id === event.id) return false
      const lowPriority = other.priority === 'low' || other.tag === 'casual' || other.tag === 'social'
      if (!lowPriority) return false
      const otherStart = new Date(other.starts_at).getTime()
      return otherStart >= focusWindowStart && otherStart <= startTs
    })

    if (conflictingLowPriority.length > 0) {
      riskItems.push({ event, conflictingLowPriority })
    }
  }

  return riskItems
}
