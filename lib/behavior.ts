import type { CalendarEvent } from '@/lib/types'

export type BehaviorType =
  | 'study_near_event'
  | 'prepared_for_event'
  | 'healthy_break'
  | 'focused_choice'
  | 'risky_choice'

export interface BehaviorEntry {
  id: string
  user_id: string
  type: BehaviorType
  points: number
  note: string
  created_at: string
}

export interface WeeklyBehaviorReport {
  weekStart: string
  weekEnd: string
  totalPoints: number
  positiveActions: number
  riskyActions: number
  grade: 'A' | 'B' | 'C' | 'D'
  summary: string
}

export function normalizeBehaviorEntry(input: Partial<BehaviorEntry> & { user_id: string }): BehaviorEntry {
  const createdAt = input.created_at || new Date().toISOString()
  const points = Number.isFinite(Number(input.points)) ? Math.round(Number(input.points)) : 0
  const safeType: BehaviorType = isBehaviorType(input.type) ? input.type : points >= 0 ? 'focused_choice' : 'risky_choice'

  return {
    id: input.id || `behavior-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    user_id: input.user_id,
    type: safeType,
    points,
    note: String(input.note || '').trim().slice(0, 220),
    created_at: createdAt,
  }
}

export function parseBehaviorEntriesFromModel(model: unknown, userId: string) {
  if (!model || typeof model !== 'object') return [] as BehaviorEntry[]
  const raw = (model as Record<string, unknown>).behavior_points_history
  if (!Array.isArray(raw)) return [] as BehaviorEntry[]

  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      return normalizeBehaviorEntry({
        id: typeof row.id === 'string' ? row.id : undefined,
        user_id: userId,
        type: typeof row.type === 'string' ? (row.type as BehaviorType) : undefined,
        points: Number(row.points ?? 0),
        note: String(row.note || ''),
        created_at: typeof row.created_at === 'string' ? row.created_at : undefined,
      })
    })
    .filter((row): row is BehaviorEntry => Boolean(row))
}

export function inferBehaviorEntries({
  userText,
  assistantText,
  upcomingEvents,
  userId,
}: {
  userText: string
  assistantText: string
  upcomingEvents: CalendarEvent[]
  userId: string
}) {
  const normalized = userText.toLowerCase()
  const assistant = assistantText.toLowerCase()
  const now = Date.now()
  const nearCritical = upcomingEvents.some((event) => {
    const critical = event.priority === 'critical' || event.tag === 'super_important'
    if (!critical) return false
    const startsAt = new Date(event.starts_at).getTime()
    const hoursAway = (startsAt - now) / (1000 * 60 * 60)
    return hoursAway >= 0 && hoursAway <= 72
  })

  const entries: BehaviorEntry[] = []

  const studying = /study|revision|revise|prepare|prep|practice|work on/.test(normalized)
  if (studying && nearCritical) {
    entries.push(
      normalizeBehaviorEntry({
        user_id: userId,
        type: 'study_near_event',
        points: 14,
        note: 'Studied/prepared close to a critical event.',
      }),
    )
  }

  const planning = /plan|schedule|prioriti[sz]e|todo|to-do/.test(normalized)
  if (planning && nearCritical) {
    entries.push(
      normalizeBehaviorEntry({
        user_id: userId,
        type: 'prepared_for_event',
        points: 10,
        note: 'Proactively planned tasks before an important deadline.',
      }),
    )
  }

  const breakWords = /break|rest|walk|hydrate|water|stretch/.test(normalized)
  const assistantSuggestedBreak = /break|stretch|snack|rest/.test(assistant)
  if (breakWords && assistantSuggestedBreak) {
    entries.push(
      normalizeBehaviorEntry({
        user_id: userId,
        type: 'healthy_break',
        points: 7,
        note: 'Took a healthy reset break based on guidance.',
      }),
    )
  }

  const risky = /movie|watch|party|binge|gaming|game|scroll|instagram|reel/.test(normalized)
  if (risky && nearCritical) {
    entries.push(
      normalizeBehaviorEntry({
        user_id: userId,
        type: 'risky_choice',
        points: -8,
        note: 'Chose a distracting plan before a critical event.',
      }),
    )
  }

  return dedupeBehavior(entries)
}

export function buildWeeklyBehaviorReport(entries: BehaviorEntry[], baseDate = new Date()): WeeklyBehaviorReport {
  const { weekStart, weekEnd } = getWeekRange(baseDate)
  const start = new Date(`${weekStart}T00:00:00.000Z`).getTime()
  const end = new Date(`${weekEnd}T23:59:59.999Z`).getTime()

  const weekEntries = entries.filter((entry) => {
    const t = new Date(entry.created_at).getTime()
    return t >= start && t <= end
  })

  const totalPoints = weekEntries.reduce((sum, entry) => sum + entry.points, 0)
  const positiveActions = weekEntries.filter((entry) => entry.points > 0).length
  const riskyActions = weekEntries.filter((entry) => entry.points < 0).length

  const grade: WeeklyBehaviorReport['grade'] =
    totalPoints >= 55 ? 'A' : totalPoints >= 35 ? 'B' : totalPoints >= 15 ? 'C' : 'D'

  const summary =
    grade === 'A'
      ? 'Excellent week. Strong focus and healthy decisions.'
      : grade === 'B'
      ? 'Good momentum. Keep reducing avoidable distractions.'
      : grade === 'C'
      ? 'Mixed week. Build consistency with one focused daily block.'
      : 'Challenging week. Reset with small wins and tighter planning.'

  return { weekStart, weekEnd, totalPoints, positiveActions, riskyActions, grade, summary }
}

function getWeekRange(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0 Sun ... 6 Sat
  const shift = day === 0 ? 6 : day - 1 // Monday as start
  const start = new Date(d)
  start.setDate(d.getDate() - shift)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return {
    weekStart: start.toISOString().slice(0, 10),
    weekEnd: end.toISOString().slice(0, 10),
  }
}

function dedupeBehavior(entries: BehaviorEntry[]) {
  const seen = new Set<string>()
  return entries.filter((entry) => {
    const key = `${entry.type}|${entry.note}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function isBehaviorType(value: unknown): value is BehaviorType {
  return (
    value === 'study_near_event' ||
    value === 'prepared_for_event' ||
    value === 'healthy_break' ||
    value === 'focused_choice' ||
    value === 'risky_choice'
  )
}
