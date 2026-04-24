'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, BellRing, CalendarClock, X } from 'lucide-react'
import type { CalendarEvent } from '@/lib/types'

interface GlobalNotificationsProps {
  events: CalendarEvent[]
  enabled: boolean
}

interface NotificationItem {
  id: string
  title: string
  message: string
  type: 'event' | 'rest'
}

const STORAGE_KEY = 'tm:dismissed-global-notifications'

export function GlobalNotifications({ events, enabled }: GlobalNotificationsProps) {
  const [dismissed, setDismissed] = useState<string[]>([])
  const [tick, setTick] = useState(() => Date.now())

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        setDismissed(parsed.filter((item): item is string => typeof item === 'string'))
      }
    } catch {
      // Ignore malformed local storage.
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    const timer = window.setInterval(() => setTick(Date.now()), 60 * 1000)
    return () => window.clearInterval(timer)
  }, [enabled])

  const notifications = useMemo(() => {
    if (!enabled) return []

    const now = new Date(tick)
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startTomorrow = new Date(startToday)
    startTomorrow.setDate(startToday.getDate() + 1)
    const endTomorrow = new Date(startTomorrow)
    endTomorrow.setDate(startTomorrow.getDate() + 1)

    const activeEvents = events.filter((event) => !event.completed)
    const tomorrowEvents = activeEvents
      .filter((event) => {
        const startsAt = new Date(event.starts_at)
        return startsAt >= startTomorrow && startsAt < endTomorrow
      })
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))

    const pending: NotificationItem[] = []

    if (tomorrowEvents.length > 0) {
      const nextEvent = tomorrowEvents[0]
      const nextTime = new Date(nextEvent.starts_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      const tomorrowKey = toDayKey(startTomorrow)
      pending.push({
        id: `event-next-day:${tomorrowKey}:${nextEvent.id}`,
        type: 'event',
        title: tomorrowEvents.length > 1 ? `You have ${tomorrowEvents.length} events tomorrow` : 'Event Reminder for Tomorrow',
        message:
          tomorrowEvents.length > 1
            ? `Next is "${nextEvent.title}" at ${nextTime}. Plan tonight so tomorrow feels easy.`
            : `"${nextEvent.title}" is tomorrow at ${nextTime}. Prep a little now and sleep on time.`,
      })
    }

    const hour = now.getHours()
    const hasImportantTomorrow = tomorrowEvents.some((event) => event.priority === 'critical' || event.priority === 'high')
    const shouldRestAlert = hour >= 23 || (hour >= 22 && hasImportantTomorrow)
    if (shouldRestAlert) {
      pending.push({
        id: `rest-advice:${toDayKey(startToday)}`,
        type: 'rest',
        title: "It's Late, Time to Recharge",
        message: hasImportantTomorrow
          ? 'Your twin recommends resting now so you are fresh for tomorrow’s important plan.'
          : 'Your twin thinks winding down now will help your mood and focus tomorrow.',
      })
    }

    return pending.filter((item) => !dismissed.includes(item.id))
  }, [dismissed, enabled, events, tick])

  function dismiss(id: string) {
    setDismissed((current) => {
      if (current.includes(id)) return current
      const next = [...current, id]
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Ignore storage issues.
      }
      return next
    })
  }

  return (
    <div className="pointer-events-none fixed right-4 top-20 z-[80] w-[min(94vw,24rem)] space-y-3 lg:top-4">
      <AnimatePresence initial={false}>
        {notifications.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: -8, x: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, x: 24, scale: 0.98 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="pointer-events-auto rounded-2xl border border-border bg-card/95 p-3 shadow-[0_10px_30px_rgb(0_0_0_/_0.24)] backdrop-blur-sm"
          >
            <div className="flex items-start gap-2">
              <div
                className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  item.type === 'rest' ? 'bg-amber-500/15 text-amber-500' : 'bg-primary/15 text-primary'
                }`}
              >
                {item.type === 'rest' ? <AlertTriangle className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.message}</p>
                <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary/90">
                  <BellRing className="h-3 w-3" />
                  Twin reminder
                </div>
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

function toDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

