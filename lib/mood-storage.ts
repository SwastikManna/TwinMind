import { MoodEntry, normalizeMoodEntry, parseMoodEntriesFromModel, parseMoodEntryFromMemoryLogContent, serializeMoodEntryForMemoryLog } from '@/lib/mood'

function isMissingTableError(message: string) {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('could not find the table') ||
    (normalized.includes('relation') && normalized.includes('does not exist'))
  )
}

export async function saveMoodEntry(supabase: any, input: Partial<MoodEntry> & { user_id: string }) {
  const entry = normalizeMoodEntry(input)
  const { data: twinProfile } = await supabase
    .from('twin_profiles')
    .select('id, ai_personality_model')
    .eq('user_id', entry.user_id)
    .single()

  if (!twinProfile) {
    throw new Error('Twin profile not found.')
  }

  const modelData =
    twinProfile.ai_personality_model && typeof twinProfile.ai_personality_model === 'object'
      ? (twinProfile.ai_personality_model as Record<string, unknown>)
      : {}

  const existing = parseMoodEntriesFromModel(modelData, entry.user_id)
  const deduped = [entry, ...existing.filter((row) => row.id !== entry.id)].slice(0, 240)

  const { error: twinUpdateError } = await supabase
    .from('twin_profiles')
    .update({
      ai_personality_model: {
        ...modelData,
        mood_tracker_entries: deduped,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', twinProfile.id)

  if (twinUpdateError) {
    throw new Error(twinUpdateError.message || 'Could not update twin mood tracker.')
  }

  const { error: memoryError } = await supabase.from('memory_logs').insert({
    user_id: entry.user_id,
    content: serializeMoodEntryForMemoryLog(entry),
    log_type: 'mood',
    sentiment: entry.happiness >= 60 ? 'positive' : entry.happiness <= 40 ? 'negative' : 'neutral',
    created_at: entry.created_at,
  })

  if (memoryError && !isMissingTableError(memoryError.message)) {
    throw new Error(memoryError.message || 'Could not save mood log.')
  }

  return entry
}

export async function fetchMoodEntries(supabase: any, userId: string) {
  const { data: twinProfile } = await supabase
    .from('twin_profiles')
    .select('ai_personality_model')
    .eq('user_id', userId)
    .single()

  const fromModel = parseMoodEntriesFromModel(twinProfile?.ai_personality_model, userId)

  const { data: memoryLogs, error } = await supabase
    .from('memory_logs')
    .select('id, content, created_at')
    .eq('user_id', userId)
    .eq('log_type', 'mood')
    .order('created_at', { ascending: false })
    .limit(240)

  if (error && !isMissingTableError(error.message)) {
    throw new Error(error.message)
  }

  const fromLogs =
    (memoryLogs || [])
      .map((log: { content: string }) => parseMoodEntryFromMemoryLogContent(log.content, userId))
      .filter((row): row is MoodEntry => Boolean(row)) || []

  const map = new Map<string, MoodEntry>()
  for (const entry of [...fromLogs, ...fromModel]) {
    map.set(entry.id, entry)
  }

  return Array.from(map.values()).sort((a, b) => b.created_at.localeCompare(a.created_at))
}
