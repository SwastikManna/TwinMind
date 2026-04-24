import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchMoodEntries } from '@/lib/mood-storage'
import { MoodTracker } from '@/components/mood-tracker'

export default async function MoodPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const entries = await fetchMoodEntries(supabase, user.id)

  return (
    <div className="max-w-6xl mx-auto pt-20 lg:pt-6 tm-page-shell">
      <MoodTracker entries={entries} />
    </div>
  )
}
