import { CalendarClock, CheckCircle2, Lightbulb, MessageSquare, TrendingUp } from 'lucide-react'
import type { MemoryLog } from '@/lib/types'

interface MemoryTimelineProps {
  logs: MemoryLog[]
  title?: string
  emptyMessage?: string
  limit?: number
}

interface TimelineGroup {
  label: string
  items: MemoryLog[]
}

export function MemoryTimeline({
  logs,
  title = 'Growth Timeline',
  emptyMessage = 'No timeline entries yet. Keep chatting and checking in.',
  limit = 20,
}: MemoryTimelineProps) {
  const slicedLogs = logs.slice(0, limit)
  const grouped = groupByDateLabel(slicedLogs)

  return (
    <div className="bg-card rounded-2xl border border-border p-6">
      <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <CalendarClock className="w-5 h-5 text-primary" />
        {title}
      </h2>

      {grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <section key={group.label}>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
                {group.label}
              </p>
              <ul className="space-y-3">
                {group.items.map((log) => (
                  <li key={log.id} className="flex items-start gap-3">
                    <div className={`mt-1 flex h-7 w-7 items-center justify-center rounded-full ${getTypeBadgeClass(log.log_type)}`}>
                      {getTypeIcon(log.log_type)}
                    </div>
                    <div className="min-w-0 flex-1 rounded-xl border border-border/80 bg-background/60 px-3 py-2">
                      <p className="text-sm text-foreground">{log.content}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatTime(log.created_at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function groupByDateLabel(logs: MemoryLog[]): TimelineGroup[] {
  const map = new Map<string, MemoryLog[]>()

  for (const log of logs) {
    const label = getDateBucketLabel(log.created_at)
    const current = map.get(label) || []
    current.push(log)
    map.set(label, current)
  }

  return Array.from(map.entries()).map(([label, items]) => ({ label, items }))
}

function getDateBucketLabel(iso: string) {
  const date = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86400000)

  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return 'This Week'
  if (diffDays < 30) return 'This Month'
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  })
}

function getTypeIcon(type: MemoryLog['log_type']) {
  switch (type) {
    case 'decision':
      return <CheckCircle2 className="w-3.5 h-3.5" />
    case 'reflection':
      return <Lightbulb className="w-3.5 h-3.5" />
    case 'mood':
      return <TrendingUp className="w-3.5 h-3.5" />
    case 'daily':
    default:
      return <MessageSquare className="w-3.5 h-3.5" />
  }
}

function getTypeBadgeClass(type: MemoryLog['log_type']) {
  switch (type) {
    case 'decision':
      return 'bg-chart-3/15 text-chart-3'
    case 'reflection':
      return 'bg-accent/15 text-accent'
    case 'mood':
      return 'bg-chart-4/15 text-chart-4'
    case 'daily':
    default:
      return 'bg-primary/15 text-primary'
  }
}
