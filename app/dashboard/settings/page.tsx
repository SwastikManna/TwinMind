import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SettingsForm } from '@/components/settings-form'
import type { Profile, TwinProfile } from '@/lib/types'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single() as { data: Profile | null }

  // Fetch twin profile
  const { data: twinProfile } = await supabase
    .from('twin_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single() as { data: TwinProfile | null }

  if (!twinProfile) {
    redirect('/onboarding')
  }

  return (
    <div className="max-w-6xl mx-auto pt-20 lg:pt-6 tm-page-shell">
      <SettingsForm 
        profile={profile}
        twinProfile={twinProfile}
        userEmail={user.email || ''}
      />
    </div>
  )
}
