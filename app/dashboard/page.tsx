import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { MessageSquare, Target, Lightbulb, TrendingUp, Calendar, ArrowRight } from 'lucide-react'
import { AvatarPreview } from '@/components/avatar-preview'
import type { TwinProfile, Insight, MemoryLog } from '@/lib/types'

export default async function DashboardPage() {
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

  // Fetch recent insights
  const { data: insights } = await supabase
    .from('insights')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(3) as { data: Insight[] | null }

  // Fetch recent memory logs
  const { data: memoryLogs } = await supabase
    .from('memory_logs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5) as { data: MemoryLog[] | null }

  // If no twin profile exists, redirect to onboarding
  if (!twinProfile) {
    redirect('/onboarding')
  }

  const greeting = getGreeting()
  const userName = user.user_metadata?.name || twinProfile.name || 'there'

  return (
    <div className="max-w-6xl mx-auto space-y-8 pt-16 lg:pt-0">
      {/* Welcome Section */}
      <div className="bg-gradient-to-br from-primary/10 via-accent/5 to-primary/5 rounded-2xl p-6 lg:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center gap-6">
          <div className="flex-1">
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              {greeting}, {userName}!
            </h1>
            <p className="text-muted-foreground">
              Your digital twin is ready to help you today. What would you like to explore?
            </p>
          </div>
          <div className="w-32 h-32 lg:w-40 lg:h-40 flex-shrink-0">
            <AvatarPreview expression="happy" size="md" />
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <QuickActionCard
          href="/dashboard/chat"
          icon={<MessageSquare className="w-5 h-5" />}
          title="Chat with Twin"
          description="Have a conversation with your AI twin"
          color="primary"
        />
        <QuickActionCard
          href="/dashboard/goals"
          icon={<Target className="w-5 h-5" />}
          title="Review Goals"
          description={`${twinProfile.goals.length} active goals`}
          color="accent"
        />
        <QuickActionCard
          href="/dashboard/insights"
          icon={<Lightbulb className="w-5 h-5" />}
          title="View Insights"
          description="See patterns and recommendations"
          color="chart-2"
        />
      </div>

      {/* Stats and Activity */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Twin Profile Summary */}
        <div className="bg-card rounded-2xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Your Twin Profile
          </h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Personality Traits</p>
              <div className="flex flex-wrap gap-2">
                {twinProfile.personality_traits.slice(0, 4).map((trait, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 rounded-full bg-primary/10 text-primary text-sm"
                  >
                    {trait}
                  </span>
                ))}
                {twinProfile.personality_traits.length > 4 && (
                  <span className="px-3 py-1 rounded-full bg-muted text-muted-foreground text-sm">
                    +{twinProfile.personality_traits.length - 4} more
                  </span>
                )}
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">Current Goals</p>
              <ul className="space-y-2">
                {twinProfile.goals.slice(0, 3).map((goal, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Target className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-foreground">{goal}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-card rounded-2xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Recent Activity
          </h2>
          {memoryLogs && memoryLogs.length > 0 ? (
            <ul className="space-y-3">
              {memoryLogs.map((log) => (
                <li key={log.id} className="flex items-start gap-3 pb-3 border-b border-border last:border-0 last:pb-0">
                  <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${getLogTypeColor(log.log_type)}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground line-clamp-2">{log.content}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatRelativeTime(log.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground text-sm">
                No activity yet. Start chatting with your twin!
              </p>
              <Link
                href="/dashboard/chat"
                className="inline-flex items-center gap-2 text-primary text-sm mt-2 hover:underline"
              >
                Start a conversation
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Latest Insights */}
      {insights && insights.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-primary" />
              Latest Insights
            </h2>
            <Link
              href="/dashboard/insights"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              View all
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {insights.map((insight) => (
              <div
                key={insight.id}
                className="bg-background rounded-xl p-4 border border-border"
              >
                <div className={`inline-flex px-2 py-1 rounded-md text-xs font-medium mb-2 ${getInsightTypeStyle(insight.insight_type)}`}>
                  {insight.insight_type}
                </div>
                <p className="text-sm text-foreground line-clamp-3">{insight.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function QuickActionCard({
  href,
  icon,
  title,
  description,
  color,
}: {
  href: string
  icon: React.ReactNode
  title: string
  description: string
  color: string
}) {
  return (
    <Link
      href={href}
      className="group bg-card rounded-2xl border border-border p-5 hover:border-primary/30 transition-all"
    >
      <div className={`w-10 h-10 rounded-xl bg-${color}/10 flex items-center justify-center text-${color} mb-3`}>
        {icon}
      </div>
      <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
        {title}
      </h3>
      <p className="text-sm text-muted-foreground mt-1">{description}</p>
    </Link>
  )
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function getLogTypeColor(type: string) {
  switch (type) {
    case 'daily':
      return 'bg-primary'
    case 'reflection':
      return 'bg-accent'
    case 'decision':
      return 'bg-chart-3'
    case 'mood':
      return 'bg-chart-4'
    default:
      return 'bg-muted-foreground'
  }
}

function getInsightTypeStyle(type: string) {
  switch (type) {
    case 'behavior':
      return 'bg-primary/10 text-primary'
    case 'habit':
      return 'bg-accent/10 text-accent'
    case 'goal':
      return 'bg-chart-3/10 text-chart-3'
    case 'recommendation':
      return 'bg-chart-4/10 text-chart-4'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}
