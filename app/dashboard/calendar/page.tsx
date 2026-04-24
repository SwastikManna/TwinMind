import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CalendarPlanner } from '@/components/calendar-planner'
import { getFallbackCalendarEvents, isMissingTableError, normalizeCalendarEvent } from '@/lib/calendar'
import { fetchMoodEntries } from '@/lib/mood-storage'
import type { CalendarEvent } from '@/lib/types'

export default async function CalendarPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  let db = supabase
  try {
    db = createAdminClient() as unknown as typeof supabase
  } catch {
    // fallback
  }

  let events: CalendarEvent[] = []
  const { data, error } = await db
    .from('calendar_events')
    .select('*')
    .eq('user_id', user.id)
    .order('starts_at', { ascending: true })

  if (!error) {
    events = (data || []).map((event) => normalizeCalendarEvent(event, user.id))
  } else if (isMissingTableError(error.message)) {
    const { data: twin } = await db
      .from('twin_profiles')
      .select('ai_personality_model')
      .eq('user_id', user.id)
      .single()

    events = getFallbackCalendarEvents(twin?.ai_personality_model, user.id)
  }
  const moodEntries = await fetchMoodEntries(db, user.id)
  const moodDayKeys = Array.from(new Set(moodEntries.map((entry) => entry.created_at.slice(0, 10))))

  return (
    <div className="max-w-6xl mx-auto pt-20 lg:pt-6 tm-page-shell">
      <CalendarPlanner initialEvents={events} moodDayKeys={moodDayKeys} />
    </div>
  )
}
