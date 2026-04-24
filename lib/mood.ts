export interface MoodEntry {
  id: string
  user_id: string
  source: 'checkin' | 'chat' | 'backfill'
  reflection: string
  happiness: number
  stress: number
  created_at: string
}

export function normalizeMoodEntry(input: Partial<MoodEntry> & { user_id: string }): MoodEntry {
  const createdAt = input.created_at || new Date().toISOString()
  return {
    id: input.id || `mood-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    user_id: input.user_id,
    source: input.source === 'chat' ? 'chat' : input.source === 'backfill' ? 'backfill' : 'checkin',
    reflection: String(input.reflection || '').trim(),
    happiness: clampScore(input.happiness),
    stress: clampScore(input.stress),
    created_at: createdAt,
  }
}

export function parseMoodEntriesFromModel(model: unknown, userId: string): MoodEntry[] {
  if (!model || typeof model !== 'object') return []
  const raw = (model as Record<string, unknown>).mood_tracker_entries
  if (!Array.isArray(raw)) return []

  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      return normalizeMoodEntry({
        id: typeof row.id === 'string' ? row.id : undefined,
        user_id: userId,
        source: row.source === 'chat' ? 'chat' : row.source === 'backfill' ? 'backfill' : 'checkin',
        reflection: String(row.reflection || ''),
        happiness: Number(row.happiness ?? 50),
        stress: Number(row.stress ?? 50),
        created_at: typeof row.created_at === 'string' ? row.created_at : undefined,
      })
    })
    .filter((entry): entry is MoodEntry => Boolean(entry))
}

export function parseMoodEntryFromMemoryLogContent(content: string, userId: string): MoodEntry | null {
  if (!content.startsWith('MOOD_TRACKER::')) return null
  const raw = content.replace('MOOD_TRACKER::', '').trim()
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<MoodEntry>
    return normalizeMoodEntry({
      id: parsed.id,
      user_id: userId,
      source: parsed.source === 'chat' ? 'chat' : parsed.source === 'backfill' ? 'backfill' : 'checkin',
      reflection: parsed.reflection || '',
      happiness: Number(parsed.happiness ?? 50),
      stress: Number(parsed.stress ?? 50),
      created_at: parsed.created_at,
    })
  } catch {
    return null
  }
}

export function serializeMoodEntryForMemoryLog(entry: MoodEntry) {
  return `MOOD_TRACKER::${JSON.stringify(entry)}`
}

export function inferMoodScoresFromText(text: string) {
  const normalized = text.toLowerCase()
  const positiveSignals = ['happy', 'good', 'great', 'excited', 'proud', 'grateful', 'hopeful', 'calm', 'better']
  const negativeSignals = ['sad', 'tired', 'stuck', 'bad', 'upset', 'angry', 'lonely', 'anxious', 'overwhelmed']
  const stressSignals = ['stress', 'deadline', 'pressure', 'panic', 'worried', 'fear', 'busy', 'exhausted']

  const positive = countMatches(normalized, positiveSignals)
  const negative = countMatches(normalized, negativeSignals)
  const stress = countMatches(normalized, stressSignals)

  const happiness = clampScore(55 + positive * 9 - negative * 7 - stress * 3)
  const stressScore = clampScore(30 + stress * 12 + negative * 6 - positive * 4)

  return { happiness, stress: stressScore }
}

export function aggregateMoodByDay(entries: MoodEntry[]) {
  const bucket = new Map<string, { date: string; happinessTotal: number; stressTotal: number; count: number }>()

  for (const entry of entries) {
    const day = entry.created_at.slice(0, 10)
    const current = bucket.get(day) || { date: day, happinessTotal: 0, stressTotal: 0, count: 0 }
    current.happinessTotal += entry.happiness
    current.stressTotal += entry.stress
    current.count += 1
    bucket.set(day, current)
  }

  return Array.from(bucket.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      date: row.date,
      happiness: Math.round(row.happinessTotal / row.count),
      stress: Math.round(row.stressTotal / row.count),
      entries: row.count,
    }))
}

export type MoodWindow = '7d' | '30d' | '90d'

export function getMoodWindowDays(window: MoodWindow) {
  if (window === '7d') return 7
  if (window === '30d') return 30
  return 90
}

export function filterMoodEntriesByWindow(entries: MoodEntry[], window: MoodWindow) {
  const days = getMoodWindowDays(window)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - (days - 1))
  const cutoffIso = cutoff.toISOString()
  return entries.filter((entry) => entry.created_at >= cutoffIso)
}

export function calculateMoodAnalytics(entries: MoodEntry[]) {
  const daily = aggregateMoodByDay(entries)

  if (daily.length === 0) {
    return {
      avgHappiness: 0,
      avgStress: 0,
      stabilityScore: 0,
      bestDay: null as { date: string; happiness: number; stress: number } | null,
      toughestDay: null as { date: string; happiness: number; stress: number } | null,
    }
  }

  const avgHappiness = Math.round(daily.reduce((sum, row) => sum + row.happiness, 0) / daily.length)
  const avgStress = Math.round(daily.reduce((sum, row) => sum + row.stress, 0) / daily.length)

  const swings = daily.slice(1).map((row, idx) => Math.abs(row.happiness - daily[idx].happiness))
  const avgSwing = swings.length ? swings.reduce((sum, s) => sum + s, 0) / swings.length : 0
  const stabilityScore = Math.max(0, Math.min(100, Math.round(100 - avgSwing)))

  const bestDayRow = [...daily].sort((a, b) => (b.happiness - b.stress) - (a.happiness - a.stress))[0]
  const toughestDayRow = [...daily].sort((a, b) => (b.stress - b.happiness) - (a.stress - a.happiness))[0]

  return {
    avgHappiness,
    avgStress,
    stabilityScore,
    bestDay: bestDayRow ? { date: bestDayRow.date, happiness: bestDayRow.happiness, stress: bestDayRow.stress } : null,
    toughestDay: toughestDayRow
      ? { date: toughestDayRow.date, happiness: toughestDayRow.happiness, stress: toughestDayRow.stress }
      : null,
  }
}

export function toDayKey(isoLike: string) {
  return isoLike.slice(0, 10)
}

export function getDaysWithMoodEntries(entries: MoodEntry[]) {
  return new Set(entries.map((entry) => toDayKey(entry.created_at)))
}

export function getMissedMoodDays({
  entries,
  maxDays = 7,
  includeToday = false,
}: {
  entries: MoodEntry[]
  maxDays?: number
  includeToday?: boolean
}) {
  const daySet = getDaysWithMoodEntries(entries)
  const now = new Date()
  const result: string[] = []

  const startOffset = includeToday ? 0 : 1
  for (let offset = startOffset; offset <= maxDays; offset += 1) {
    const day = new Date(now)
    day.setHours(12, 0, 0, 0)
    day.setDate(day.getDate() - offset)
    const isoDay = day.toISOString().slice(0, 10)
    if (!daySet.has(isoDay)) {
      result.push(isoDay)
    }
  }

  return result.sort((a, b) => b.localeCompare(a))
}

export function calculateMoodEntryStreak(entries: MoodEntry[]) {
  const dayKeys = Array.from(getDaysWithMoodEntries(entries)).sort((a, b) => b.localeCompare(a))
  if (dayKeys.length === 0) return 0

  const now = new Date()
  now.setHours(12, 0, 0, 0)
  const todayKey = now.toISOString().slice(0, 10)

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = yesterday.toISOString().slice(0, 10)

  const startsToday = dayKeys[0] === todayKey
  const startsYesterday = dayKeys[0] === yesterdayKey
  if (!startsToday && !startsYesterday) {
    return 0
  }

  let streak = 1
  for (let i = 1; i < dayKeys.length; i += 1) {
    const prev = new Date(dayKeys[i - 1])
    const current = new Date(dayKeys[i])
    const diff = Math.round((prev.getTime() - current.getTime()) / 86400000)
    if (diff === 1) {
      streak += 1
    } else {
      break
    }
  }

  return streak
}

export interface MoodBadge {
  id: string
  label: string
  description: string
  unlocked: boolean
}

export interface MoodGamificationProfile {
  level: number
  xp: number
  xpIntoLevel: number
  xpToNextLevel: number
  currentStreak: number
  bestStreak: number
  totalCheckins: number
  badges: MoodBadge[]
}

export function calculateMoodGamification(entries: MoodEntry[]): MoodGamificationProfile {
  const daysWithEntries = Array.from(getDaysWithMoodEntries(entries)).sort((a, b) => b.localeCompare(a))
  const totalCheckins = entries.filter((entry) => entry.source !== 'chat').length
  const currentStreak = calculateMoodEntryStreak(entries)
  const bestStreak = calculateBestMoodStreak(daysWithEntries)
  const weeklyConsistency = calculateWeeklyConsistency(daysWithEntries)

  const xp = totalCheckins * 12 + currentStreak * 18 + bestStreak * 8 + Math.round(weeklyConsistency * 40)
  const level = Math.max(1, Math.floor(xp / 120) + 1)
  const levelStartXp = (level - 1) * 120
  const nextLevelXp = level * 120

  const badges: MoodBadge[] = [
    {
      id: 'first-checkin',
      label: 'First Step',
      description: 'Logged your first daily check-in.',
      unlocked: totalCheckins >= 1,
    },
    {
      id: 'streak-3',
      label: 'On Fire',
      description: 'Reached a 3-day mood streak.',
      unlocked: bestStreak >= 3,
    },
    {
      id: 'streak-7',
      label: 'Weekly Warrior',
      description: 'Reached a 7-day streak.',
      unlocked: bestStreak >= 7,
    },
    {
      id: 'streak-21',
      label: 'Unbreakable',
      description: 'Reached a 21-day streak.',
      unlocked: bestStreak >= 21,
    },
    {
      id: 'consistency-80',
      label: 'Consistent Mind',
      description: 'Maintained 80% weekly consistency.',
      unlocked: weeklyConsistency >= 0.8,
    },
  ]

  return {
    level,
    xp,
    xpIntoLevel: xp - levelStartXp,
    xpToNextLevel: Math.max(0, nextLevelXp - xp),
    currentStreak,
    bestStreak,
    totalCheckins,
    badges,
  }
}

function calculateBestMoodStreak(dayKeysDesc: string[]) {
  if (dayKeysDesc.length === 0) return 0
  let best = 1
  let current = 1
  for (let i = 1; i < dayKeysDesc.length; i += 1) {
    const prev = new Date(dayKeysDesc[i - 1])
    const currentDay = new Date(dayKeysDesc[i])
    const diff = Math.round((prev.getTime() - currentDay.getTime()) / 86400000)
    if (diff === 1) {
      current += 1
      best = Math.max(best, current)
    } else {
      current = 1
    }
  }
  return best
}

function calculateWeeklyConsistency(dayKeysDesc: string[]) {
  if (dayKeysDesc.length === 0) return 0
  const recent = new Set(dayKeysDesc.slice(0, 7))
  return recent.size / 7
}

function countMatches(text: string, words: string[]) {
  return words.reduce((score, token) => (text.includes(token) ? score + 1 : score), 0)
}

function clampScore(value: unknown) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 50
  return Math.max(0, Math.min(100, Math.round(n)))
}
