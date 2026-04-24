import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { GoalsManager } from '@/components/goals-manager'
import type { TwinProfile, MemoryLog } from '@/lib/types'

export default async function GoalsPage() {
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

  // Fetch recent memory logs related to goals
  const { data: memoryLogs, error: memoryLogsError } = await supabase
    .from('memory_logs')
    .select('*')
    .eq('user_id', user.id)
    .in('log_type', ['decision', 'reflection'])
    .order('created_at', { ascending: false })
    .limit(10) as { data: MemoryLog[] | null }

  const safeMemoryLogs =
    memoryLogsError && isMissingTableError(memoryLogsError.message)
      ? []
      : memoryLogs || []

  return (
    <div className="max-w-5xl mx-auto pt-20 lg:pt-6 tm-page-shell">
      <GoalsManager 
        twinProfile={twinProfile} 
        memoryLogs={safeMemoryLogs}
      />
    </div>
  )
}

function isMissingTableError(message: string) {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('could not find the table') ||
    (normalized.includes('relation') && normalized.includes('does not exist'))
  )
}
