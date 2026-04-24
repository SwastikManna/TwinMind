'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'
import { Target, Plus, Check, X, Sparkles, Calendar, TrendingUp, RefreshCw } from 'lucide-react'
import type { TwinProfile, MemoryLog } from '@/lib/types'

interface GoalsManagerProps {
  twinProfile: TwinProfile
  memoryLogs: MemoryLog[]
}

export function GoalsManager({ twinProfile, memoryLogs }: GoalsManagerProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isGeneratingCheckin, setIsGeneratingCheckin] = useState(false)
  const [newGoal, setNewGoal] = useState('')
  const [showAddGoal, setShowAddGoal] = useState(false)
  const [completedGoals, setCompletedGoals] = useState<string[]>([])
  const [goalCheckin, setGoalCheckin] = useState<{ summary: string; suggested_actions: string[] } | null>(null)
  const [goalError, setGoalError] = useState<string | null>(null)

  async function handleAddGoal() {
    if (!newGoal.trim()) return

    const supabase = createClient()
    const updatedGoals = [...twinProfile.goals, newGoal.trim()]

    const { error } = await supabase
      .from('twin_profiles')
      .update({ goals: updatedGoals, updated_at: new Date().toISOString() })
      .eq('id', twinProfile.id)

    if (!error) {
      // Also add a memory log
      await supabase.from('memory_logs').insert({
        user_id: twinProfile.user_id,
        content: `Set a new goal: ${newGoal.trim()}`,
        log_type: 'decision',
      })

      setNewGoal('')
      setShowAddGoal(false)
      startTransition(() => router.refresh())
    }
  }

  async function handleCompleteGoal(goal: string) {
    setCompletedGoals([...completedGoals, goal])
    
    const supabase = createClient()
    const updatedGoals = twinProfile.goals.filter(g => g !== goal)

    const { error } = await supabase
      .from('twin_profiles')
      .update({ goals: updatedGoals, updated_at: new Date().toISOString() })
      .eq('id', twinProfile.id)

    if (!error) {
      // Add a memory log for completing the goal
      await supabase.from('memory_logs').insert({
        user_id: twinProfile.user_id,
        content: `Completed goal: ${goal}`,
        log_type: 'reflection',
        sentiment: 'positive',
      })

      // Also add an insight
      await supabase.from('insights').insert({
        user_id: twinProfile.user_id,
        summary: `Congratulations on completing your goal: "${goal}"! This shows your commitment to growth.`,
        insight_type: 'goal',
        data: { completed_goal: goal, completed_at: new Date().toISOString() },
      })

      startTransition(() => router.refresh())
    }
  }

  async function handleRemoveGoal(goal: string) {
    const supabase = createClient()
    const updatedGoals = twinProfile.goals.filter(g => g !== goal)

    const { error } = await supabase
      .from('twin_profiles')
      .update({ goals: updatedGoals, updated_at: new Date().toISOString() })
      .eq('id', twinProfile.id)

    if (!error) {
      startTransition(() => router.refresh())
    }
  }

  async function handleGenerateGoalCheckin() {
    setIsGeneratingCheckin(true)
    setGoalError(null)

    try {
      const response = await fetch('/api/goals/checkin', { method: 'POST' })
      const payload = (await response.json()) as {
        error?: string
        checkin?: { summary: string; suggested_actions: string[] }
      }

      if (!response.ok || !payload.checkin) {
        throw new Error(payload.error || 'Could not generate goal check-in')
      }

      setGoalCheckin(payload.checkin)
      startTransition(() => router.refresh())
    } catch (error) {
      setGoalError(error instanceof Error ? error.message : 'Could not generate goal check-in')
    } finally {
      setIsGeneratingCheckin(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
            Your Goals
          </h1>
          <p className="text-muted-foreground mt-1">
            Track your progress and stay accountable
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerateGoalCheckin}
            disabled={isGeneratingCheckin || isPending || twinProfile.goals.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground rounded-xl font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {isGeneratingCheckin ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
            AI Check-in
          </button>
          <button
            onClick={() => setShowAddGoal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Goal
          </button>
        </div>
      </div>

      {goalError && (
        <div className="rounded-xl bg-destructive/10 text-destructive text-sm px-4 py-3">
          {goalError}
        </div>
      )}

      {goalCheckin && (
        <div className="bg-card rounded-2xl border border-border p-6">
          <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" />
            Weekly Goal Check-in
          </h3>
          <p className="text-foreground mb-3">{goalCheckin.summary}</p>
          {goalCheckin.suggested_actions.length > 0 && (
            <ul className="space-y-2">
              {goalCheckin.suggested_actions.map((action) => (
                <li key={action} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="mt-1.5 inline-block w-1.5 h-1.5 rounded-full bg-primary" />
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Add Goal Modal */}
      <AnimatePresence>
        {showAddGoal && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-card rounded-2xl border border-border p-6"
          >
            <h3 className="font-semibold text-foreground mb-4">New Goal</h3>
            <div className="flex gap-3">
              <input
                type="text"
                value={newGoal}
                onChange={(e) => setNewGoal(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddGoal()}
                placeholder="What do you want to achieve?"
                autoFocus
                className="flex-1 px-4 py-3 rounded-xl bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={handleAddGoal}
                disabled={!newGoal.trim() || isPending}
                className="px-4 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setShowAddGoal(false)
                  setNewGoal('')
                }}
                className="px-4 py-3 bg-muted text-muted-foreground rounded-xl hover:bg-muted/80 transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Goals List */}
      <div className="space-y-4">
        {twinProfile.goals.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-2xl border border-border">
            <Target className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No goals yet</h3>
            <p className="text-muted-foreground mb-4">
              Set your first goal to start tracking your progress
            </p>
            <button
              onClick={() => setShowAddGoal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Add Your First Goal
            </button>
          </div>
        ) : (
          <AnimatePresence>
            {twinProfile.goals.map((goal, index) => (
              <motion.div
                key={goal}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ delay: index * 0.05 }}
                className={`bg-card rounded-2xl border border-border p-5 ${
                  completedGoals.includes(goal) ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-start gap-4">
                  <button
                    onClick={() => handleCompleteGoal(goal)}
                    disabled={completedGoals.includes(goal) || isPending}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                      completedGoals.includes(goal)
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-border hover:border-primary'
                    }`}
                  >
                    {completedGoals.includes(goal) && <Check className="w-4 h-4" />}
                  </button>
                  <div className="flex-1">
                    <p className={`text-foreground ${completedGoals.includes(goal) ? 'line-through' : ''}`}>
                      {goal}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemoveGoal(goal)}
                    disabled={isPending}
                    className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                    title="Remove goal"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Progress Section */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Daily Habits */}
        <div className="bg-card rounded-2xl border border-border p-6">
          <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Daily Habits
          </h2>
          {twinProfile.daily_habits.length > 0 ? (
            <div className="space-y-3">
              {twinProfile.daily_habits.map((habit, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-accent" />
                  <span className="text-sm text-foreground">{habit}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No daily habits set. Add some in your profile settings.
            </p>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-card rounded-2xl border border-border p-6">
          <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Recent Progress
          </h2>
          {memoryLogs.length > 0 ? (
            <div className="space-y-3">
              {memoryLogs.slice(0, 5).map((log) => (
                <div key={log.id} className="flex items-start gap-3">
                  <Sparkles className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-foreground line-clamp-2">{log.content}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(log.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Start chatting with your twin to track your progress.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
