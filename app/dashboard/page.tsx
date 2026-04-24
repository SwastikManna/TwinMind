import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { MessageSquare, Target, Lightbulb, TrendingUp, Calendar, ArrowRight, HeartPulse, Flame } from 'lucide-react'
import { AvatarPreview } from '@/components/avatar-preview'
import { DailyCheckinCard } from '@/components/daily-checkin-card'
import { MissedDayRecapCard } from '@/components/missed-day-recap-card'
import { BehaviorReportCard } from '@/components/behavior-report-card'
import { fetchMoodEntries } from '@/lib/mood-storage'
import { calculateMoodEntryStreak, calculateMoodGamification, getMissedMoodDays } from '@/lib/mood'
import { fetchWeeklyBehaviorReport } from '@/lib/behavior-storage'
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
  const { data: memoryLogs, error: memoryLogsError } = await supabase
    .from('memory_logs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(60) as { data: MemoryLog[] | null }

  // Fetch recent chat messages
  const { data: chatMessages, error: chatMessagesError } = await supabase
    .from('chat_messages')
    .select('id, role, content, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100) as { data: Array<{ id: string; role: 'user' | 'assistant'; content: string; created_at: string }> | null }

  // If no twin profile exists, redirect to onboarding
  if (!twinProfile) {
    redirect('/onboarding')
  }

  const greeting = getGreeting()
  const userName = user.user_metadata?.name || twinProfile.name || 'there'
  const allLogs = memoryLogsError && isMissingTableError(memoryLogsError.message) ? [] : memoryLogs || []
  const safeChatMessages =
    chatMessagesError && isMissingTableError(chatMessagesError.message) ? [] : chatMessages || []

  const modelData =
    twinProfile.ai_personality_model && typeof twinProfile.ai_personality_model === 'object'
      ? (twinProfile.ai_personality_model as Record<string, unknown>)
      : {}
  const appearanceData =
    modelData.avatar_appearance && typeof modelData.avatar_appearance === 'object'
      ? (modelData.avatar_appearance as Record<string, unknown>)
      : {}
  const twinHeadColor =
    typeof appearanceData.head_color === 'string' && /^#[0-9a-fA-F]{6}$/.test(appearanceData.head_color)
      ? appearanceData.head_color
      : '#0d9488'
  const twinBodyColor =
    typeof appearanceData.body_color === 'string' && /^#[0-9a-fA-F]{6}$/.test(appearanceData.body_color)
      ? appearanceData.body_color
      : '#0f766e'
  const fallbackChatHistory = Array.isArray(modelData.chat_history)
    ? (modelData.chat_history as Array<Record<string, unknown>>)
    : []
  const todaysChats = buildTodayChatActivity({
    chatMessages: safeChatMessages,
    fallbackChatHistory,
    twinName: twinProfile.name,
  })

  const hasCheckedInTodayFromLogs = allLogs.some((log) => {
    if (log.log_type !== 'mood') return false
    const text = log.content.toLowerCase()
    if (!text.includes('daily check-in mood:')) return false
    const created = new Date(log.created_at)
    const now = new Date()
    return (
      created.getFullYear() === now.getFullYear() &&
      created.getMonth() === now.getMonth() &&
      created.getDate() === now.getDate()
    )
  })

  const hasCheckedInTodayFromFallback = Array.isArray(modelData.mood_tracker_entries)
    ? (modelData.mood_tracker_entries as Array<Record<string, unknown>>).some((entry) => {
        const source = String(entry.source || '')
        if (source !== 'checkin') return false
        const createdAt = String(entry.created_at || '')
        if (!createdAt) return false
        const created = new Date(createdAt)
        const now = new Date()
        return (
          created.getFullYear() === now.getFullYear() &&
          created.getMonth() === now.getMonth() &&
          created.getDate() === now.getDate()
        )
      })
    : false

  const hasCheckedInToday = hasCheckedInTodayFromLogs || hasCheckedInTodayFromFallback
  const moodEntries = await fetchMoodEntries(supabase, user.id)
  const moodStreak = calculateMoodEntryStreak(moodEntries)
  const moodGame = calculateMoodGamification(moodEntries)
  const behaviorReport = await fetchWeeklyBehaviorReport(supabase, user.id)
  const missedMoodDays = getMissedMoodDays({
    entries: moodEntries,
    maxDays: 7,
    includeToday: false,
  })

  return (
    <div className="max-w-6xl mx-auto space-y-8 pt-16 lg:pt-0 tm-page-shell">
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
            <AvatarPreview expression="happy" size="md" headColor={twinHeadColor} bodyColor={twinBodyColor} />
          </div>
        </div>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-foreground">
          <Flame className="h-4 w-4 text-primary" />
          <span>
            Current mood streak: <strong>{moodStreak}</strong> day{moodStreak === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
        <QuickActionCard
          href="/dashboard/mood"
          icon={<HeartPulse className="w-5 h-5" />}
          title="Mood Tracker"
          description="Daily happiness and stress trends"
          color="chart-4"
        />
      </div>

      {!hasCheckedInToday && <DailyCheckinCard hasCheckedInToday={hasCheckedInToday} />}
      {missedMoodDays.length > 0 && <MissedDayRecapCard missingDays={missedMoodDays} />}
      <BehaviorReportCard report={behaviorReport} />

      {/* Stats and Activity */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-2xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Flame className="w-5 h-5 text-primary" />
            Streak Rewards
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Level</p>
              <p className="text-lg font-semibold text-foreground">{moodGame.level}</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Current streak</p>
              <p className="text-sm font-medium text-foreground">{moodGame.currentStreak} days</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Best streak</p>
              <p className="text-sm font-medium text-foreground">{moodGame.bestStreak} days</p>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>XP progress</span>
                <span>{moodGame.xpIntoLevel}/120</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(100, Math.round((moodGame.xpIntoLevel / 120) * 100))}%` }}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {moodGame.xpToNextLevel} XP to next level.
            </p>
          </div>
        </div>

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

        {/* Today's Chats */}
        <div className="bg-card rounded-2xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Today&apos;s Chats
          </h2>
          {todaysChats.length > 0 ? (
            <div className="max-h-[340px] overflow-y-auto pr-1">
              <ul className="space-y-3">
                {todaysChats.map((item) => (
                  <li key={`${item.id}-${item.created_at}`} className="pb-3 border-b border-border last:border-0 last:pb-0">
                    <Link
                      href={`/dashboard/chat?messageId=${encodeURIComponent(item.id)}&messageAt=${encodeURIComponent(item.created_at)}&messageRole=${encodeURIComponent(item.role)}&messageText=${encodeURIComponent(item.preview.slice(0, 60))}`}
                      className="flex items-start gap-3 rounded-xl p-2 hover:bg-muted/40 transition-colors"
                    >
                      <div className="w-2 h-2 rounded-full mt-2 flex-shrink-0 bg-chart-4" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground line-clamp-2">
                          {item.role === 'assistant' ? `${twinProfile.name}: ` : 'You: '}
                          {item.preview}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{formatRelativeTime(item.created_at)}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground text-sm">
                No chats yet today.
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

function buildTodayChatActivity({
  chatMessages,
  fallbackChatHistory,
  twinName,
}: {
  chatMessages: Array<{ id: string; role: 'user' | 'assistant'; content: string; created_at: string }>
  fallbackChatHistory: Array<Record<string, unknown>>
  twinName: string
}) {
  const now = new Date()
  const items: Array<{ id: string; role: 'user' | 'assistant'; preview: string; created_at: string }> = []

  for (const msg of chatMessages) {
    if (!isSameCalendarDay(msg.created_at, now)) continue
    items.push({
      id: msg.id,
      role: msg.role,
      preview: trimText(msg.content, 140),
      created_at: msg.created_at,
    })
  }

  for (let idx = 0; idx < fallbackChatHistory.length; idx += 1) {
    const entry = fallbackChatHistory[idx]
    const content = String(entry.content || '').trim()
    const createdAt = String(entry.created_at || '')
    if (!content || !createdAt) continue
    if (!isSameCalendarDay(createdAt, now)) continue
    const role = entry.role === 'assistant' ? 'assistant' : 'user'
    items.push({
      id: String(entry.id || `fallback-${createdAt}-${idx}`),
      role,
      preview: trimText(content, 140),
      created_at: createdAt,
    })
  }

  const deduped = new Map<string, { id: string; role: 'user' | 'assistant'; preview: string; created_at: string }>()
  for (const item of items) {
    const key = `${item.created_at}|${item.role}|${item.preview}`
    if (!deduped.has(key)) deduped.set(key, item)
  }

  return Array.from(deduped.values()).sort((a, b) => b.created_at.localeCompare(a.created_at))
}

function trimText(text: string, max = 140) {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1)}...`
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

function isSameCalendarDay(dateString: string, today: Date) {
  const d = new Date(dateString)
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  )
}

function isMissingTableError(message: string) {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('could not find the table') ||
    (normalized.includes('relation') && normalized.includes('does not exist'))
  )
}

