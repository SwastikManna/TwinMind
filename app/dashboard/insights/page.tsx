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
  const { data: insights, error: insightsError } = await supabase
    .from('insights')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50) as { data: Insight[] | null }

  // Fetch memory logs for analysis
  const { data: memoryLogs, error: memoryLogsError } = await supabase
    .from('memory_logs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(30) as { data: MemoryLog[] | null }

  const safeMemoryLogs =
    memoryLogsError && isMissingTableError(memoryLogsError.message)
      ? []
      : memoryLogs || []

  const fallbackInsights = safeMemoryLogs
    .filter((log) => log.content.startsWith('Insight ('))
    .map((log, idx) => {
      const match = /^Insight \((behavior|habit|goal|recommendation)\):\s*(.+)$/i.exec(log.content)
      const insightType = (match?.[1]?.toLowerCase() || 'recommendation') as Insight['insight_type']
      const summary = match?.[2] || log.content
      return {
        id: `memory-fallback-${idx}-${log.id}`,
        user_id: log.user_id,
        summary,
        insight_type: insightType,
        data: { source: 'memory_logs_fallback' },
        created_at: log.created_at,
      } as Insight
    })

  const safeInsights =
    insightsError && isMissingTableError(insightsError.message)
      ? fallbackInsights
      : insights || []

  return (
    <div className="max-w-4xl mx-auto pt-16 lg:pt-0 tm-page-shell">
      <InsightsView 
        twinProfile={twinProfile}
        insights={safeInsights}
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
