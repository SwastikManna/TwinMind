import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { InsightsView } from '@/components/insights-view'
import type { TwinProfile, Insight, MemoryLog } from '@/lib/types'

export default async function InsightsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Fetch twin profile
  const { data: twinProfile } = await supabase
    .from('twin_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single() as { data: TwinProfile | null }

  if (!twinProfile) {
    redirect('/onboarding')
  }

  // Fetch all insights
  const { data: insights } = await supabase
    .from('insights')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50) as { data: Insight[] | null }

  // Fetch memory logs for analysis
  const { data: memoryLogs } = await supabase
    .from('memory_logs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(30) as { data: MemoryLog[] | null }

  return (
    <div className="max-w-4xl mx-auto pt-16 lg:pt-0">
      <InsightsView 
        twinProfile={twinProfile}
        insights={insights || []}
        memoryLogs={memoryLogs || []}
      />
    </div>
  )
}
