'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Loader2, Save } from 'lucide-react'

interface MissedDayRecapCardProps {
  missingDays: string[]
}

export function MissedDayRecapCard({ missingDays }: MissedDayRecapCardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedDay, setSelectedDay] = useState(missingDays[0] || '')
  const [reflection, setReflection] = useState('')
  const [happiness, setHappiness] = useState(55)
  const [stress, setStress] = useState(40)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const selectableDays = useMemo(() => missingDays, [missingDays])
  const formValid = Boolean(selectedDay && reflection.trim().length >= 3)

  async function saveRecap() {
    if (!formValid || isPending) return
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/mood/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'backfill',
          entry_date: selectedDay,
          reflection: reflection.trim(),
          happiness,
          stress,
        }),
      })

      const payload = (await res.json()) as { error?: string }
      if (!res.ok) {
        throw new Error(payload.error || 'Could not save missed-day recap.')
      }

      setReflection('')
      setSuccess('Recap saved. Mood graph is now backfilled for that day.')
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save missed-day recap.')
    }
  }

  if (missingDays.length === 0) return null

  return (
    <div className="bg-card rounded-2xl border border-chart-3/30 p-6">
      <div className="flex items-start gap-3 mb-4">
        <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-chart-3/15 text-chart-3">
          <AlertCircle className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Missed-Day Recap</h2>
          <p className="text-sm text-muted-foreground">
            You missed {missingDays.length} day{missingDays.length > 1 ? 's' : ''}. Share a short recap so your streak
            and mood timeline stay complete.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="text-sm text-muted-foreground">Day to backfill</span>
          <select
            value={selectedDay}
            onChange={(e) => setSelectedDay(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-xl bg-background border border-border text-sm"
          >
            {selectableDays.map((day) => (
              <option key={day} value={day}>
                {new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </option>
            ))}
          </select>
        </label>

        <textarea
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          placeholder="Quick recap of that day..."
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
        {success && <p className="text-sm text-accent">{success}</p>}

        <button
          onClick={saveRecap}
          disabled={!formValid || isPending}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save recap
        </button>
      </div>
    </div>
  )
}
