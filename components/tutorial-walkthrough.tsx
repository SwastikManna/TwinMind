'use client'

import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Brain,
  CalendarDays,
  CheckCircle2,
  Flame,
  Goal,
  Lightbulb,
  MicVocal,
  Settings,
  Sparkles,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type TutorialPage = {
  id: string
  title: string
  body: string
  detail: string
  icon: ComponentType<{ className?: string }>
}

interface TutorialWalkthroughProps {
  userId: string
  shouldAutoShow: boolean
  avatarConfig: Record<string, unknown>
}

const PAGES: TutorialPage[] = [
  {
    id: 'welcome',
    title: 'Welcome To Saathi',
    body: 'Saathi is your AI twin that understands your goals, mood, habits, and priorities.',
    detail: 'This tutorial will quickly show how every section helps you grow without feeling overwhelmed.',
    icon: Sparkles,
  },
  {
    id: 'chat',
    title: 'Chat Is Deeply Personalized',
    body: 'Your twin adapts its tone, coaching style, and responses based on your profile and behavior.',
    detail: 'It uses your goals, interests, check-ins, and events to give context-aware support.',
    icon: Bot,
  },
  {
    id: 'voice',
    title: 'Voice + Full Conversation Mode',
    body: 'Speak naturally with real-time captions while your twin replies in voice.',
    detail: 'You can personalize voice preference, speech rate, and tone from Settings.',
    icon: MicVocal,
  },
  {
    id: 'goals',
    title: 'Goals & Coaching',
    body: 'Track goals, run AI check-ins, and receive actionable coaching plans.',
    detail: 'Saathi keeps nudging you toward consistency and progress.',
    icon: Goal,
  },
  {
    id: 'insights',
    title: 'Insights',
    body: 'Generate insights from your patterns across chats, mood logs, and decisions.',
    detail: 'This helps you understand what works best for your learning and productivity.',
    icon: Lightbulb,
  },
  {
    id: 'mood',
    title: 'Mood Tracker',
    body: 'Capture daily happiness and stress to build your emotional trend history.',
    detail: 'If you miss a day, recap tools help backfill and keep your timeline complete.',
    icon: Brain,
  },
  {
    id: 'calendar',
    title: 'Calendar & Smart Reminders',
    body: 'Plan events with tags and priorities while your twin remembers your schedule.',
    detail: 'Saathi can warn you when choices conflict with important upcoming events.',
    icon: CalendarDays,
  },
  {
    id: 'streaks',
    title: 'Streaks & Behavior Points',
    body: 'Earn points and keep streaks by making healthy, goal-aligned decisions.',
    detail: 'Weekly reports summarize your discipline, consistency, and momentum.',
    icon: Flame,
  },
  {
    id: 'settings',
    title: 'Customize Everything',
    body: 'Personalize your twin’s look, voice, tone, and coaching behavior in Settings.',
    detail: 'Your account data stays private and you control preferences any time.',
    icon: Settings,
  },
  {
    id: 'done',
    title: 'You Are Ready',
    body: 'Start with Chat, then use Goals, Mood, Insights, and Calendar together.',
    detail: 'That combination gives you the strongest personalized support loop.',
    icon: CheckCircle2,
  },
]

export function TutorialWalkthrough({ userId, shouldAutoShow, avatarConfig }: TutorialWalkthroughProps) {
  const [open, setOpen] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  const storageKey = `saathi_tutorial_seen_${userId}`
  const totalPages = PAGES.length
  const isLastPage = pageIndex === totalPages - 1
  const page = PAGES[pageIndex]

  useEffect(() => {
    if (!shouldAutoShow) return
    const seenLocally = typeof window !== 'undefined' && window.localStorage.getItem(storageKey) === '1'
    if (seenLocally) return

    const timer = window.setTimeout(() => setOpen(true), 280)
    return () => window.clearTimeout(timer)
  }, [shouldAutoShow, storageKey])

  useEffect(() => {
    function onOpenTutorial() {
      setPageIndex(0)
      setOpen(true)
    }

    window.addEventListener('saathi-open-tutorial', onOpenTutorial)
    return () => window.removeEventListener('saathi-open-tutorial', onOpenTutorial)
  }, [])

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        void finishTutorial()
      } else if (event.key === 'ArrowRight') {
        setPageIndex((current) => Math.min(totalPages - 1, current + 1))
      } else if (event.key === 'ArrowLeft') {
        setPageIndex((current) => Math.max(0, current - 1))
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, totalPages])

  async function finishTutorial() {
    if (saving) return
    setSaving(true)
    setOpen(false)

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, '1')
    }

    const mergedConfig = {
      ...avatarConfig,
      has_seen_tutorial: true,
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        avatar_config: mergedConfig,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    if (error) {
      console.error('Failed to persist tutorial completion:', error.message)
    }
    setSaving(false)
  }

  function goNext() {
    if (isLastPage) {
      void finishTutorial()
      return
    }
    setPageIndex((current) => Math.min(totalPages - 1, current + 1))
  }

  function goBack() {
    setPageIndex((current) => Math.max(0, current - 1))
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
            className="w-full max-w-xl rounded-3xl border border-border bg-card p-5 shadow-[0_20px_70px_rgb(0_0_0_/_0.45)] md:p-6"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/35 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Product Tour
              </div>
              <button
                type="button"
                onClick={() => void finishTutorial()}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close tutorial"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-2xl border border-border bg-background/40 p-4 md:p-5">
              <div className="mb-3 flex items-center gap-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <page.icon className="h-5 w-5" />
                </div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Page {pageIndex + 1} of {totalPages}
                </p>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={page.id}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2 }}
                >
                  <h3 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
                    {page.title}
                  </h3>
                  <p className="mt-3 text-base leading-relaxed text-foreground/90">{page.body}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{page.detail}</p>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="mt-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                {PAGES.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPageIndex(index)}
                    className={`h-2.5 rounded-full transition-all ${
                      index === pageIndex
                        ? 'w-8 bg-primary shadow-[0_0_16px_rgb(var(--app-glow)_/_0.9)]'
                        : 'w-2.5 bg-muted'
                    }`}
                    aria-label={`Go to tutorial page ${index + 1}`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void finishTutorial()}
                  className="rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={goBack}
                  disabled={pageIndex === 0}
                  className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-sm text-foreground disabled:opacity-40"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {isLastPage ? 'Finish' : 'Next'}
                  {!isLastPage && <ArrowRight className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
