'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { motion } from 'framer-motion'
import { 
  Lightbulb, 
  Brain, 
  Target, 
  TrendingUp, 
  Calendar,
  Sparkles,
  RefreshCw,
  Activity
} from 'lucide-react'
import type { TwinProfile, Insight, MemoryLog } from '@/lib/types'

interface InsightsViewProps {
  twinProfile: TwinProfile
  insights: Insight[]
  memoryLogs: MemoryLog[]
}

export function InsightsView({ twinProfile, insights, memoryLogs }: InsightsViewProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)

  async function generateInsight() {
    setIsGenerating(true)
    setGenerationError(null)

    try {
      const response = await fetch('/api/insights/generate', { method: 'POST' })
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        throw new Error(payload.error || 'Insight generation failed')
      }

      startTransition(() => router.refresh())
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'Insight generation failed')
    } finally {
      setIsGenerating(false)
    }
  }

  // Group insights by type
  const behaviorInsights = insights.filter(i => i.insight_type === 'behavior')
  const habitInsights = insights.filter(i => i.insight_type === 'habit')
  const goalInsights = insights.filter(i => i.insight_type === 'goal')
  const recommendationInsights = insights.filter(i => i.insight_type === 'recommendation')

  // Calculate activity stats
  const totalLogs = memoryLogs.length
  const moodLogs = memoryLogs.filter(m => m.log_type === 'mood').length
  const decisionLogs = memoryLogs.filter(m => m.log_type === 'decision').length
  const reflectionLogs = memoryLogs.filter(m => m.log_type === 'reflection').length

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
            Insights
          </h1>
          <p className="text-muted-foreground mt-1">
            Personalized patterns and recommendations from your twin
          </p>
        </div>
        <button
          onClick={generateInsight}
          disabled={isGenerating || isPending}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isGenerating ? (
            <RefreshCw className="w-5 h-5 animate-spin" />
          ) : (
            <Sparkles className="w-5 h-5" />
          )}
          Generate Insight
        </button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Activity className="w-5 h-5" />}
          label="Total Activity"
          value={totalLogs}
          color="primary"
        />
        <StatCard
          icon={<Brain className="w-5 h-5" />}
          label="Reflections"
          value={reflectionLogs}
          color="accent"
        />
        <StatCard
          icon={<Target className="w-5 h-5" />}
          label="Decisions"
          value={decisionLogs}
          color="chart-3"
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Mood Entries"
          value={moodLogs}
          color="chart-4"
        />
      </div>

      {/* Insights by Category */}
      <div className="space-y-6">
        {generationError && (
          <div className="rounded-xl bg-destructive/10 text-destructive text-sm px-4 py-3">
            {generationError}
          </div>
        )}

        {insights.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-2xl border border-border">
            <Lightbulb className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No insights yet</h3>
            <p className="text-muted-foreground mb-4 max-w-md mx-auto">
              As you interact with your twin, insights about your patterns and growth will appear here.
            </p>
            <button
              onClick={generateInsight}
              disabled={isGenerating}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Sparkles className="w-5 h-5" />
              Generate Your First Insight
            </button>
          </div>
        ) : (
          <>
            {recommendationInsights.length > 0 && (
              <InsightSection
                title="Recommendations"
                icon={<Sparkles className="w-5 h-5" />}
                insights={recommendationInsights}
                color="primary"
              />
            )}
            
            {behaviorInsights.length > 0 && (
              <InsightSection
                title="Behavior Patterns"
                icon={<Brain className="w-5 h-5" />}
                insights={behaviorInsights}
                color="accent"
              />
            )}
            
            {habitInsights.length > 0 && (
              <InsightSection
                title="Habit Insights"
                icon={<Calendar className="w-5 h-5" />}
                insights={habitInsights}
                color="chart-3"
              />
            )}
            
            {goalInsights.length > 0 && (
              <InsightSection
                title="Goal Progress"
                icon={<Target className="w-5 h-5" />}
                insights={goalInsights}
                color="chart-4"
              />
            )}
          </>
        )}
      </div>

      {/* Personality Summary */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          Your Profile Summary
        </h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm text-muted-foreground mb-2">Personality Traits</p>
            <div className="flex flex-wrap gap-2">
              {twinProfile.personality_traits.map((trait, i) => (
                <span
                  key={i}
                  className="px-3 py-1 rounded-full bg-primary/10 text-primary text-sm"
                >
                  {trait}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-2">Interests</p>
            <div className="flex flex-wrap gap-2">
              {twinProfile.interests.map((interest, i) => (
                <span
                  key={i}
                  className="px-3 py-1 rounded-full bg-accent/10 text-accent text-sm"
                >
                  {interest}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: number
  color: string
}) {
  const styles: Record<string, string> = {
    primary: 'bg-primary/10 text-primary',
    accent: 'bg-accent/10 text-accent',
    'chart-3': 'bg-chart-3/10 text-chart-3',
    'chart-4': 'bg-chart-4/10 text-chart-4',
  }

  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${styles[color] || styles.primary}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

function InsightSection({
  title,
  icon,
  insights,
  color,
}: {
  title: string
  icon: React.ReactNode
  insights: Insight[]
  color: string
}) {
  const headingStyles: Record<string, string> = {
    primary: 'text-primary',
    accent: 'text-accent',
    'chart-3': 'text-chart-3',
    'chart-4': 'text-chart-4',
  }

  return (
    <div>
      <h2 className={`font-semibold text-foreground mb-4 flex items-center gap-2 ${headingStyles[color] || headingStyles.primary}`}>
        {icon}
        {title}
      </h2>
      <div className="space-y-3">
        {insights.slice(0, 5).map((insight, index) => (
          <motion.div
            key={insight.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="bg-card rounded-xl border border-border p-4"
          >
            <p className="text-foreground">{insight.summary}</p>
            <p className="text-xs text-muted-foreground mt-2">
              {new Date(insight.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
