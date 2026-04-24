'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarCheck2, Loader2, Sparkles } from 'lucide-react'

interface DailyCheckinCardProps {
  hasCheckedInToday: boolean
}

export function DailyCheckinCard({ hasCheckedInToday }: DailyCheckinCardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mood, setMood] = useState('')
  const [win, setWin] = useState('')
  const [blocker, setBlocker] = useState('')
  const [focus, setFocus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const isFormValid = useMemo(() => {
    return Boolean(mood.trim() && win.trim() && blocker.trim() && focus.trim())
  }, [mood, win, blocker, focus])

  async function submitCheckin() {
    if (!isFormValid || isPending) return

    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/checkin/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mood: mood.trim(),
          win: win.trim(),
          blocker: blocker.trim(),
          focus: focus.trim(),
        }),
      })
      const payload = (await res.json()) as { error?: string }
      if (!res.ok) {
        throw new Error(payload.error || 'Could not save check-in.')
      }

      setMood('')
      setWin('')
      setBlocker('')
      setFocus('')
      setSuccess('Check-in saved. Your twin updated your timeline.')
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save check-in.')
    }
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <CalendarCheck2 className="w-5 h-5 text-accent" />
            Daily Twin Check-in
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            60 seconds. One reflection. Stronger guidance all day.
          </p>
        </div>
        {hasCheckedInToday && (
          <span className="inline-flex items-center rounded-full bg-accent/10 text-accent text-xs px-3 py-1">
            Checked in today
          </span>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <input
          value={mood}
          onChange={(e) => setMood(e.target.value)}
          placeholder="Mood in one line"
          className="px-3 py-2 rounded-lg bg-background border border-border text-sm"
        />
        <input
          value={win}
          onChange={(e) => setWin(e.target.value)}
          placeholder="Today’s small win"
          className="px-3 py-2 rounded-lg bg-background border border-border text-sm"
        />
        <input
          value={blocker}
          onChange={(e) => setBlocker(e.target.value)}
          placeholder="Current blocker"
          className="px-3 py-2 rounded-lg bg-background border border-border text-sm"
        />
        <input
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder="Main focus for today"
          className="px-3 py-2 rounded-lg bg-background border border-border text-sm"
        />
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      {success && <p className="mt-3 text-sm text-accent">{success}</p>}

      <button
        onClick={submitCheckin}
        disabled={!isFormValid || isPending}
        className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-accent-foreground font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
      >
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        Save check-in
      </button>
    </div>
  )
}
