import { createClient } from '@/lib/supabase/server'
import { aggregateMoodByDay } from '@/lib/mood'
import { fetchMoodEntries } from '@/lib/mood-storage'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const entries = await fetchMoodEntries(supabase, user.id)
    const daily = aggregateMoodByDay(entries)
    return Response.json({ entries, daily })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load mood history.'
    return Response.json({ error: message }, { status: 500 })
  }
}
