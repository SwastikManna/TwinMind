'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Heart, Loader2, ShieldAlert, Smile, Activity, Trophy, TrendingDown, Flame, Award, Sparkles } from 'lucide-react'
import { DashboardPageHeader, DashboardSection } from '@/components/dashboard-shell'
import {
  aggregateMoodByDay,
  calculateMoodEntryStreak,
  calculateMoodGamification,
  calculateMoodAnalytics,
  filterMoodEntriesByWindow,
  MoodEntry,
  MoodWindow,
} from '@/lib/mood'

interface MoodTrackerProps {
  entries: MoodEntry[]
}

export function MoodTracker({ entries }: MoodTrackerProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [reflection, setReflection] = useState('')
  const [happiness, setHappiness] = useState(60)
  const [stress, setStress] = useState(35)
  const [error, setError] = useState<string | null>(null)
  const [window, setWindow] = useState<MoodWindow>('30d')

  const windowEntries = useMemo(() => filterMoodEntriesByWindow(entries, window), [entries, window])
  const daily = useMemo(() => aggregateMoodByDay(windowEntries), [windowEntries])
  const analytics = useMemo(() => calculateMoodAnalytics(windowEntries), [windowEntries])
  const streak = useMemo(() => calculateMoodEntryStreak(entries), [entries])
  const gamification = useMemo(() => calculateMoodGamification(entries), [entries])
  const stressSpike = useMemo(() => {
    if (daily.length < 4) return null
    const latest = daily[daily.length - 1]
    const baselineValues = daily.slice(Math.max(0, daily.length - 4), daily.length - 1).map((row) => row.stress)
    if (baselineValues.length === 0) return null
    const baseline = Math.round(baselineValues.reduce((sum, v) => sum + v, 0) / baselineValues.length)
    if (latest.stress - baseline >= 15) {
      return { date: latest.date, stress: latest.stress, baseline }
    }
    return null
  }, [daily])

  async function saveEntry() {
    if (!reflection.trim() || isPending) return
    setError(null)

    try {
      const response = await fetch('/api/mood/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reflection: reflection.trim(),
          happiness,
          stress,
          source: 'checkin',
        }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(payload.error || 'Could not save mood entry.')
      }

      setReflection('')
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save mood entry.')
    }
  }

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Daily Mood Tracker"
        description="Track how each day felt. Your twin learns your emotional patterns over time."
        actions={
          <div className="inline-flex rounded-xl border border-border bg-card p-1">
            {(['7d', '30d', '90d'] as MoodWindow[]).map((item) => (
              <button
                key={item}
                onClick={() => setWindow(item)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  window === item ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        }
      />

      <DashboardSection title="Daily Reflection" description="60 seconds now, clearer guidance through the day." collapsible defaultOpen>
        <p className="text-sm font-medium text-foreground">How did today go?</p>
        <textarea
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          placeholder="Share your day in 1-2 lines..."
          className="w-full min-h-24 px-3 py-2 rounded-xl bg-background border border-border text-sm"
        />
        <div className="grid md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm text-muted-foreground">Happiness: {happiness}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={happiness}
              onChange={(e) => setHappiness(Number(e.target.value))}
              className="w-full mt-2"
            />
          </label>
          <label className="block">
            <span className="text-sm text-muted-foreground">Stress: {stress}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={stress}
              onChange={(e) => setStress(Number(e.target.value))}
              className="w-full mt-2"
            />
          </label>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button
          onClick={saveEntry}
          disabled={!reflection.trim() || isPending}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Save daily mood
        </button>
      </DashboardSection>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-card rounded-2xl border border-border p-5">
          <p className="text-sm text-muted-foreground">Average Happiness ({window})</p>
          <p className="text-3xl font-semibold text-foreground mt-1 inline-flex items-center gap-2">
            <Smile className="w-6 h-6 text-accent" />
            {analytics.avgHappiness}
          </p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-5">
          <p className="text-sm text-muted-foreground">Average Stress ({window})</p>
          <p className="text-3xl font-semibold text-foreground mt-1 inline-flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-chart-3" />
            {analytics.avgStress}
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-card rounded-2xl border border-border p-5">
          <p className="text-sm text-muted-foreground">Mood Streak</p>
          <p className="text-3xl font-semibold text-foreground mt-1 inline-flex items-center gap-2">
            <Flame className="w-6 h-6 text-primary" />
            {streak} days
          </p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-5">
          <p className="text-sm text-muted-foreground">Mood Stability Score</p>
          <p className="text-3xl font-semibold text-foreground mt-1 inline-flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            {analytics.stabilityScore}
          </p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-5">
          <p className="text-sm text-muted-foreground">Best Day</p>
          <p className="text-base font-semibold text-foreground mt-2 inline-flex items-center gap-2">
            <Trophy className="w-5 h-5 text-accent" />
            {analytics.bestDay ? shortDate(analytics.bestDay.date) : 'N/A'}
          </p>
          {analytics.bestDay && (
            <p className="text-xs text-muted-foreground mt-1">
              H {analytics.bestDay.happiness} / S {analytics.bestDay.stress}
            </p>
          )}
        </div>
        <div className="bg-card rounded-2xl border border-border p-5">
          <p className="text-sm text-muted-foreground">Toughest Day</p>
          <p className="text-base font-semibold text-foreground mt-2 inline-flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-chart-3" />
            {analytics.toughestDay ? shortDate(analytics.toughestDay.date) : 'N/A'}
          </p>
          {analytics.toughestDay && (
            <p className="text-xs text-muted-foreground mt-1">
              H {analytics.toughestDay.happiness} / S {analytics.toughestDay.stress}
            </p>
          )}
        </div>
      </div>

      <DashboardSection
        title="Streak Rewards"
        icon={Award}
        right={<span className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">Level {gamification.level}</span>}
        collapsible
        defaultOpen={false}
      >

        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>XP Progress</span>
            <span>{gamification.xpIntoLevel} / 120</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(100, Math.round((gamification.xpIntoLevel / 120) * 100))}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {gamification.xpToNextLevel} XP to Level {gamification.level + 1}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-border/80 bg-background/70 p-3">
            <p className="text-xs text-muted-foreground">Best streak</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{gamification.bestStreak} days</p>
          </div>
          <div className="rounded-xl border border-border/80 bg-background/70 p-3">
            <p className="text-xs text-muted-foreground">Current streak</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{gamification.currentStreak} days</p>
          </div>
          <div className="rounded-xl border border-border/80 bg-background/70 p-3">
            <p className="text-xs text-muted-foreground">Total check-ins</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{gamification.totalCheckins}</p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-foreground inline-flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            Badges
          </p>
          <div className="flex flex-wrap gap-2">
            {gamification.badges.map((badge) => (
              <span
                key={badge.id}
                title={badge.description}
                className={`rounded-full px-3 py-1 text-xs border ${
                  badge.unlocked
                    ? 'bg-primary/12 border-primary/35 text-primary'
                    : 'bg-muted/40 border-border text-muted-foreground'
                }`}
              >
                {badge.label}
              </span>
            ))}
          </div>
        </div>
      </DashboardSection>

      {stressSpike && (
        <div className="rounded-2xl border border-chart-3/30 bg-chart-3/10 p-4">
          <p className="text-sm font-medium text-foreground">
            Stress spike detected on {shortDate(stressSpike.date)}.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Stress reached {stressSpike.stress} vs recent baseline {stressSpike.baseline}. Suggestion: pick one must-do task and cut low-impact tasks for the next 24 hours.
          </p>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-2xl border border-border p-5">
          <p className="font-semibold text-foreground mb-4 inline-flex items-center gap-2">
            <Heart className="w-5 h-5 text-accent" />
            Happiness Trend
          </p>
          <ChartContainer
            className="h-64 w-full"
            config={{ happiness: { label: 'Happiness', color: 'var(--color-accent)' } }}
          >
            <AreaChart data={daily}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} />
              <YAxis domain={[0, 100]} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area dataKey="happiness" type="monotone" fill="var(--color-happiness)" stroke="var(--color-happiness)" fillOpacity={0.25} />
            </AreaChart>
          </ChartContainer>
        </div>

        <div className="bg-card rounded-2xl border border-border p-5">
          <p className="font-semibold text-foreground mb-4 inline-flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-chart-3" />
            Stress Trend
          </p>
          <ChartContainer
            className="h-64 w-full"
            config={{ stress: { label: 'Stress', color: 'var(--color-chart-3)' } }}
          >
            <LineChart data={daily}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} />
              <YAxis domain={[0, 100]} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line dataKey="stress" type="monotone" stroke="var(--color-stress)" strokeWidth={3} dot={false} />
            </LineChart>
          </ChartContainer>
        </div>
      </div>

      <DashboardSection title="Recent Daily Notes" collapsible defaultOpen={false}>
        {windowEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No mood entries yet. Add your first one above.</p>
        ) : (
          <ul className="space-y-2">
            {windowEntries.slice(0, 8).map((entry) => (
              <li key={entry.id} className="rounded-xl border border-border/80 bg-background/60 px-3 py-2">
                <p className="text-sm text-foreground">{entry.reflection}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(entry.created_at).toLocaleString()}  |  Happiness {entry.happiness}  |  Stress {entry.stress}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>
    </div>
  )
}

function shortDate(value: string) {
  const date = new Date(value)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
