import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardNav } from '@/components/dashboard-nav'
import { GlobalNotifications } from '@/components/global-notifications'
import { getFallbackCalendarEvents, isMissingTableError, normalizeCalendarEvent } from '@/lib/calendar'
import type { CalendarEvent, Profile, TwinProfile } from '@/lib/types'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, avatar_config')
    .eq('id', user.id)
    .single() as { data: Pick<Profile, 'name' | 'avatar_config'> | null }

  const { data: twinProfile } = await supabase
    .from('twin_profiles')
    .select('ai_personality_model')
    .eq('user_id', user.id)
    .single() as { data: Pick<TwinProfile, 'ai_personality_model'> | null }

  const model =
    twinProfile?.ai_personality_model && typeof twinProfile.ai_personality_model === 'object'
      ? (twinProfile.ai_personality_model as Record<string, unknown>)
      : {}

  const preferenceModel =
    model.preferences && typeof model.preferences === 'object'
      ? (model.preferences as Record<string, unknown>)
      : {}
  const globalNotificationsEnabled = preferenceModel.global_notifications_enabled !== false

  let events: CalendarEvent[] = []
  const { data: calendarRows, error: calendarError } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('user_id', user.id)
    .order('starts_at', { ascending: true })

  if (!calendarError && Array.isArray(calendarRows)) {
    events = calendarRows.map((event) => normalizeCalendarEvent(event, user.id))
  } else {
    const isMissingTable = isMissingTableError(calendarError?.message || '')
    if (isMissingTable || !calendarRows) {
      events = getFallbackCalendarEvents(twinProfile?.ai_personality_model, user.id)
    }
  }

  const avatarConfig =
    profile?.avatar_config && typeof profile.avatar_config === 'object'
      ? (profile.avatar_config as Record<string, unknown>)
      : {}
  const profileImageUrl = typeof avatarConfig.profile_image_url === 'string' ? avatarConfig.profile_image_url : null
  const profileName = profile?.name || user.user_metadata?.name || 'User'

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav user={user} profileName={profileName} profileImageUrl={profileImageUrl} />
      <GlobalNotifications events={events} enabled={globalNotificationsEnabled} />
      <main className="lg:pl-64">
        <div className="px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  )
}
