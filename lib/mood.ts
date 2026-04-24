export interface MoodEntry {
  id: string
  user_id: string
  source: 'checkin' | 'chat'
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
    source: input.source === 'chat' ? 'chat' : 'checkin',
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
        source: row.source === 'chat' ? 'chat' : 'checkin',
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
      source: parsed.source === 'chat' ? 'chat' : 'checkin',
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

function countMatches(text: string, words: string[]) {
  return words.reduce((score, token) => (text.includes(token) ? score + 1 : score), 0)
}

function clampScore(value: unknown) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 50
  return Math.max(0, Math.min(100, Math.round(n)))
}
