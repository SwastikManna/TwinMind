import {
  BehaviorEntry,
  buildWeeklyBehaviorReport,
  parseBehaviorEntriesFromModel,
  normalizeBehaviorEntry,
  WeeklyBehaviorReport,
} from '@/lib/behavior'

export async function saveBehaviorEntries(
  supabase: any,
  userId: string,
  entriesInput: Array<Partial<BehaviorEntry>>,
) {
  if (!entriesInput.length) return []
  const normalized = entriesInput.map((entry) => normalizeBehaviorEntry({ ...entry, user_id: userId }))

  const { data: twinProfile } = await supabase
    .from('twin_profiles')
    .select('id, ai_personality_model')
    .eq('user_id', userId)
    .single()

  if (!twinProfile) return []

  const modelData =
    twinProfile.ai_personality_model && typeof twinProfile.ai_personality_model === 'object'
      ? (twinProfile.ai_personality_model as Record<string, unknown>)
      : {}
  const existing = parseBehaviorEntriesFromModel(modelData, userId)
  const next = [...normalized, ...existing]
    .filter((entry, idx, arr) => arr.findIndex((e) => e.id === entry.id) === idx)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 400)

  await supabase
    .from('twin_profiles')
    .update({
      ai_personality_model: {
        ...modelData,
        behavior_points_history: next,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', twinProfile.id)

  return normalized
}

export async function fetchBehaviorEntries(supabase: any, userId: string) {
  const { data: twinProfile } = await supabase
    .from('twin_profiles')
    .select('ai_personality_model')
    .eq('user_id', userId)
    .single()

  return parseBehaviorEntriesFromModel(twinProfile?.ai_personality_model, userId).sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )
}

export async function fetchWeeklyBehaviorReport(supabase: any, userId: string): Promise<WeeklyBehaviorReport> {
  const entries = await fetchBehaviorEntries(supabase, userId)
  return buildWeeklyBehaviorReport(entries)
}
