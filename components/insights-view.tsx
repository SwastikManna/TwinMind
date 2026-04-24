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
import { DashboardPageHeader, DashboardSection } from '@/components/dashboard-shell'
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
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [weeklyReport, setWeeklyReport] = useState<{
    avgHappiness: number
    avgStress: number
    happinessDelta: number
    stressDelta: number
    stressSpike: { date: string; stress: number; baseline: number; severity: number } | null
    recommendation: string
  } | null>(null)

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

  async function generateWeeklyReport() {
    setIsGeneratingReport(true)
    setGenerationError(null)

    try {
      const response = await fetch('/api/insights/report')
      const payload = (await response.json()) as { error?: string; report?: typeof weeklyReport }
      if (!response.ok || !payload.report) {
        throw new Error(payload.error || 'Weekly report generation failed')
      }
      setWeeklyReport(payload.report as NonNullable<typeof weeklyReport>)
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'Weekly report generation failed')
    } finally {
      setIsGeneratingReport(false)
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
      <DashboardPageHeader
        title="Insights"
        description="Personalized patterns and recommendations from your twin"
        actions={
          <>
            <button
              onClick={generateWeeklyReport}
              disabled={isGeneratingReport || isPending}
              className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground rounded-xl font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {isGeneratingReport ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <Calendar className="w-5 h-5" />
              )}
              Weekly Report
            </button>
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
          </>
        }
      />

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

      {weeklyReport && (
        <DashboardSection title="Weekly Mood Report" icon={Calendar} collapsible defaultOpen={false}>
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div className="rounded-xl border border-border p-4">
              <p className="text-sm text-muted-foreground">Avg Happiness</p>
              <p className="text-2xl font-semibold text-foreground">{weeklyReport.avgHappiness}</p>
              <p className="text-xs text-muted-foreground">Delta vs previous week: {weeklyReport.happinessDelta >= 0 ? '+' : ''}{weeklyReport.happinessDelta}</p>
            </div>
            <div className="rounded-xl border border-border p-4">
              <p className="text-sm text-muted-foreground">Avg Stress</p>
              <p className="text-2xl font-semibold text-foreground">{weeklyReport.avgStress}</p>
              <p className="text-xs text-muted-foreground">Delta vs previous week: {weeklyReport.stressDelta >= 0 ? '+' : ''}{weeklyReport.stressDelta}</p>
            </div>
          </div>
          {weeklyReport.stressSpike && (
            <div className="rounded-xl bg-destructive/10 text-destructive px-4 py-3 text-sm mb-3">
              Stress spike detected on {weeklyReport.stressSpike.date} (stress {weeklyReport.stressSpike.stress}, baseline {weeklyReport.stressSpike.baseline}).
            </div>
          )}
          <p className="text-sm text-foreground">{weeklyReport.recommendation}</p>
        </DashboardSection>
      )}

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
