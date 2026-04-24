'use client'

import { useMemo, useState } from 'react'
import { addHours, format, isSameDay, parseISO, startOfDay } from 'date-fns'
import { AlertTriangle, BellRing, Calendar as CalendarIcon, Clock3, Flame, Plus, Save, ShieldAlert, Trash2, X } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { getCalendarConflicts, getDueReminders, getPriorityRiskItems } from '@/lib/calendar'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DashboardPageHeader, DashboardSection } from '@/components/dashboard-shell'
import type { CalendarEvent, CalendarEventPriority, CalendarEventRecurrence, CalendarEventTag } from '@/lib/types'

interface CalendarPlannerProps {
  initialEvents: CalendarEvent[]
  moodDayKeys: string[]
}

type EditorState = {
  id?: string
  title: string
  starts_at: string
  ends_at: string
  tag: CalendarEventTag
  priority: CalendarEventPriority
  reminder_minutes: number
  recurrence: CalendarEventRecurrence
  location: string
  notes: string
  completed: boolean
}

const TAG_OPTIONS: Array<{ value: CalendarEventTag; label: string }> = [
  { value: 'casual', label: 'Casual' },
  { value: 'important', label: 'Important' },
  { value: 'super_important', label: 'Super Important' },
  { value: 'work', label: 'Work' },
  { value: 'study', label: 'Study' },
  { value: 'health', label: 'Health' },
  { value: 'social', label: 'Social' },
]

const PRIORITY_OPTIONS: Array<{ value: CalendarEventPriority; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]

const RECUR_OPTIONS: Array<{ value: CalendarEventRecurrence; label: string }> = [
  { value: 'none', label: 'No repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

const REMINDER_PRESETS = [0, 10, 30, 60, 180, 720, 1440]

type DayMarker = 'active_streak' | 'ended_streak' | 'ended_cross' | 'none'

export function CalendarPlanner({ initialEvents, moodDayKeys }: CalendarPlannerProps) {
  const [events, setEvents] = useState(initialEvents)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDayPopupOpen, setIsDayPopupOpen] = useState(false)
  const [dayPopupDate, setDayPopupDate] = useState<Date | null>(null)
  const [editor, setEditor] = useState<EditorState>(() => buildEmptyEditor(new Date()))

  const eventMapByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      const dayKey = event.starts_at.slice(0, 10)
      const existing = map.get(dayKey) || []
      existing.push(event)
      map.set(dayKey, existing)
    }
    for (const [key, list] of map.entries()) {
      map.set(
        key,
        list.sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
      )
    }
    return map
  }, [events])

  const streakMarkerByDay = useMemo(() => {
    return buildStreakMarkers(moodDayKeys)
  }, [moodDayKeys])

  const selectedEvents = useMemo(() => {
    return [...events]
      .filter((event) => isSameDay(parseISO(event.starts_at), selectedDate))
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  }, [events, selectedDate])

  const upcomingEvents = useMemo(() => {
    const start = startOfDay(new Date())
    return [...events]
      .filter((event) => parseISO(event.starts_at) >= start)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .slice(0, 5)
  }, [events])

  const conflicts = useMemo(() => getCalendarConflicts(events), [events])
  const dueReminders = useMemo(() => getDueReminders(events, 240), [events])
  const priorityRisks = useMemo(() => getPriorityRiskItems(events), [events])

  const dayPopupEvents = useMemo(() => {
    if (!dayPopupDate) return []
    return eventMapByDay.get(toDayKey(dayPopupDate)) || []
  }, [dayPopupDate, eventMapByDay])

  function openCreateEditor() {
    setEditor(buildEmptyEditor(selectedDate))
    setError(null)
    setIsEditorOpen(true)
  }

  function openEditEditor(event: CalendarEvent) {
    setEditor({
      id: event.id,
      title: event.title,
      starts_at: event.starts_at.slice(0, 16),
      ends_at: event.ends_at.slice(0, 16),
      tag: event.tag,
      priority: event.priority,
      reminder_minutes: event.reminder_minutes,
      recurrence: event.recurrence,
      location: event.location || '',
      notes: event.notes || '',
      completed: event.completed,
    })
    setError(null)
    setIsEditorOpen(true)
  }

  async function saveEvent() {
    setError(null)
    if (!editor.title.trim()) {
      setError('Title is required.')
      return
    }

    const starts = new Date(editor.starts_at)
    const ends = new Date(editor.ends_at)
    if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) {
      setError('Start and end date/time are required.')
      return
    }
    if (ends <= starts) {
      setError('End time must be after start time.')
      return
    }

    setIsSaving(true)
    const payload = {
      ...editor,
      title: editor.title.trim(),
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      location: editor.location.trim() || null,
      notes: editor.notes.trim() || null,
    }

    try {
      const response = await fetch('/api/calendar/events', {
        method: editor.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = (await response.json()) as { error?: string; event?: CalendarEvent }
      if (!response.ok || !body.event) {
        throw new Error(body.error || 'Failed to save event')
      }

      setEvents((current) => {
        const without = current.filter((event) => event.id !== body.event!.id)
        return [...without, body.event!].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      })
      setIsEditorOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save event.')
    } finally {
      setIsSaving(false)
    }
  }

  async function removeEvent(id: string) {
    setError(null)
    setIsSaving(true)
    try {
      const response = await fetch('/api/calendar/events', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error || 'Failed to delete event')
      setEvents((current) => current.filter((event) => event.id !== id))
      if (editor.id === id) setIsEditorOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete event.')
    } finally {
      setIsSaving(false)
    }
  }

  async function patchEventById(id: string, patch: Partial<CalendarEvent>) {
    const response = await fetch('/api/calendar/events', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    })
    const body = (await response.json()) as { error?: string; event?: CalendarEvent }
    if (!response.ok || !body.event) {
      throw new Error(body.error || 'Failed to update event')
    }
    setEvents((current) => {
      const without = current.filter((event) => event.id !== body.event!.id)
      return [...without, body.event!].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    })
  }

  async function applyFocusProtection(criticalId: string) {
    const risk = priorityRisks.find((item) => item.event.id === criticalId)
    if (!risk || isSaving) return
    setIsSaving(true)
    setError(null)
    try {
      const criticalEndTs = new Date(risk.event.ends_at).getTime()
      for (let idx = 0; idx < risk.conflictingLowPriority.length; idx += 1) {
        const casual = risk.conflictingLowPriority[idx]
        const duration = new Date(casual.ends_at).getTime() - new Date(casual.starts_at).getTime()
        const shiftedStart = new Date(criticalEndTs + (idx + 1) * 45 * 60000)
        const shiftedEnd = new Date(shiftedStart.getTime() + Math.max(duration, 30 * 60000))
        await patchEventById(casual.id, {
          starts_at: shiftedStart.toISOString(),
          ends_at: shiftedEnd.toISOString(),
        })
      }

      await patchEventById(risk.event.id, {
        reminder_minutes: Math.max(risk.event.reminder_minutes, 180),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not auto-protect focus block.')
    } finally {
      setIsSaving(false)
    }
  }

  function openDayPopup(day: Date) {
    setDayPopupDate(day)
    setSelectedDate(day)
    setIsDayPopupOpen(true)
  }

  function tileEventPreview(day: Date) {
    const dayEvents = eventMapByDay.get(toDayKey(day)) || []
    if (dayEvents.length === 0) return ''
    if (dayEvents.length === 1) return shorten(dayEvents[0].title, 12)
    return `${shorten(dayEvents[0].title, 10)} +${dayEvents.length - 1}`
  }

  return (
    <div className="space-y-6 pt-16 lg:pt-0">
      <DashboardPageHeader
        title="Calendar & Events"
        description="Plan your days with tags, priorities, reminders, and recurrence."
        actions={
          <button
            onClick={openCreateEditor}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add Event
          </button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <section className="rounded-2xl border border-border bg-card p-4 tm-panel">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(value) => value && setSelectedDate(value)}
            onDayClick={(day) => openDayPopup(day)}
            className="w-full"
            components={{
              DayButton: ({ day, modifiers, ...props }) => {
                const marker = streakMarkerByDay.get(toDayKey(day.date)) || 'none'
                const preview = tileEventPreview(day.date)
                return (
                  <button
                    {...props}
                    type="button"
                    className={`relative h-full w-full rounded-md border border-transparent px-1 py-1 text-left transition-colors hover:border-primary/30 hover:bg-muted/40 ${
                      modifiers.selected ? 'bg-primary/12 border-primary/35' : ''
                    }`}
                  >
                    <span className="block text-[11px] font-medium leading-none text-foreground">
                      {day.date.getDate()}
                    </span>
                    {preview && (
                      <span className="mt-1 block truncate text-[9px] leading-tight text-muted-foreground">
                        {preview}
                      </span>
                    )}
                    {marker !== 'none' && (
                      <span className="absolute left-0.5 top-0.5 text-[10px] leading-none">
                        {marker === 'active_streak' ? (
                          <Flame className="h-3 w-3 fill-orange-400 text-orange-500" title="Active streak" />
                        ) : marker === 'ended_streak' ? (
                          <Flame className="h-3 w-3 fill-sky-400 text-sky-500" title="Past streak" />
                        ) : (
                          <span title="Streak ended" className="text-red-500">
                            ×
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                )
              },
            }}
          />
        </section>

        <section className="space-y-4">
          <DashboardSection
            title={format(selectedDate, 'EEEE, MMM d')}
            icon={CalendarIcon}
            contentClassName="max-h-64 overflow-y-auto pr-1"
          >
            <div className="mt-3 space-y-2 max-h-64 overflow-y-auto pr-1">
              {selectedEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No events for this day yet.</p>
              ) : (
                selectedEvents.map((event) => (
                  <button
                    key={event.id}
                    onClick={() => openEditEditor(event)}
                    className="w-full rounded-xl border border-border bg-background p-3 text-left hover:border-primary/50"
                  >
                    <p className="font-medium text-foreground">{event.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {format(parseISO(event.starts_at), 'h:mm a')} - {format(parseISO(event.ends_at), 'h:mm a')}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">{event.tag.replace('_', ' ')}</span>
                      <span className="rounded-full bg-accent/10 px-2 py-1 text-xs text-accent">{event.priority}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </DashboardSection>

          <DashboardSection title="Upcoming" icon={Clock3} collapsible defaultOpen={false}>
            <ul className="mt-3 space-y-2">
              {upcomingEvents.length === 0 ? (
                <li className="text-sm text-muted-foreground">No upcoming events yet.</li>
              ) : (
                upcomingEvents.map((event) => (
                  <li key={event.id} className="rounded-lg bg-background px-3 py-2 text-sm">
                    <p className="font-medium text-foreground">{event.title}</p>
                    <p className="text-xs text-muted-foreground">{format(parseISO(event.starts_at), 'EEE, MMM d - h:mm a')}</p>
                  </li>
                ))
              )}
            </ul>
          </DashboardSection>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <DashboardSection title="Conflict Planner" icon={AlertTriangle} collapsible defaultOpen={false}>
          <div className="mt-3 space-y-2">
            {conflicts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No overlaps detected. Your schedule looks clean.</p>
            ) : (
              conflicts.slice(0, 5).map((conflict) => (
                <div key={`${conflict.first.id}-${conflict.second.id}`} className="rounded-xl border border-border bg-background p-3">
                  <p className="text-sm font-medium text-foreground">
                    {conflict.first.title} vs {conflict.second.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Overlap: {conflict.overlapMinutes} min - {conflict.severity === 'critical' ? 'Critical' : 'Warning'}
                  </p>
                </div>
              ))
            )}
          </div>
        </DashboardSection>

        <DashboardSection title="Reminder Queue" icon={BellRing} collapsible defaultOpen={false}>
          <div className="mt-3 space-y-2">
            {dueReminders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reminder due in the next 4 hours.</p>
            ) : (
              dueReminders.slice(0, 6).map((item) => (
                <div key={item.event.id} className="rounded-xl border border-border bg-background p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.event.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Starts in {item.startsInMinutes} min - reminder set {item.event.reminder_minutes} min before
                      </p>
                    </div>
                    <button
                      onClick={() => patchEventById(item.event.id, { completed: true }).catch((e) => setError(e instanceof Error ? e.message : 'Could not mark complete'))}
                      className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted"
                    >
                      Mark done
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DashboardSection>
      </div>

      <DashboardSection title="Critical Event Focus Guard" icon={ShieldAlert} collapsible defaultOpen={false}>
        <div className="mt-3 space-y-2">
          {priorityRisks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No risky low-priority plans found before super important events.
            </p>
          ) : (
            priorityRisks.slice(0, 4).map((risk) => (
              <div key={risk.event.id} className="rounded-xl border border-border bg-background p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">{risk.event.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {risk.conflictingLowPriority.length} low-priority plan(s) can distract focus before this event.
                    </p>
                  </div>
                  <button
                    disabled={isSaving}
                    onClick={() => applyFocusProtection(risk.event.id)}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    Protect focus window
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </DashboardSection>

      {isEditorOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-foreground">{editor.id ? 'Edit Event' : 'Create Event'}</h3>
              <button onClick={() => setIsEditorOpen(false)} className="rounded-lg p-2 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Title">
                <input
                  value={editor.title}
                  onChange={(e) => setEditor((prev) => ({ ...prev, title: e.target.value }))}
                  className={inputClass}
                  placeholder="Exam prep session"
                />
              </Field>
              <Field label="Tag">
                <select
                  value={editor.tag}
                  onChange={(e) => setEditor((prev) => ({ ...prev, tag: e.target.value as CalendarEventTag }))}
                  className={inputClass}
                >
                  {TAG_OPTIONS.map((tag) => (
                    <option key={tag.value} value={tag.value}>
                      {tag.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Starts">
                <input
                  type="datetime-local"
                  value={editor.starts_at}
                  onChange={(e) => setEditor((prev) => ({ ...prev, starts_at: e.target.value }))}
                  className={inputClass}
                />
              </Field>
              <Field label="Ends">
                <input
                  type="datetime-local"
                  value={editor.ends_at}
                  onChange={(e) => setEditor((prev) => ({ ...prev, ends_at: e.target.value }))}
                  className={inputClass}
                />
              </Field>
              <Field label="Priority">
                <select
                  value={editor.priority}
                  onChange={(e) => setEditor((prev) => ({ ...prev, priority: e.target.value as CalendarEventPriority }))}
                  className={inputClass}
                >
                  {PRIORITY_OPTIONS.map((priority) => (
                    <option key={priority.value} value={priority.value}>
                      {priority.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Recurrence">
                <select
                  value={editor.recurrence}
                  onChange={(e) => setEditor((prev) => ({ ...prev, recurrence: e.target.value as CalendarEventRecurrence }))}
                  className={inputClass}
                >
                  {RECUR_OPTIONS.map((recurrence) => (
                    <option key={recurrence.value} value={recurrence.value}>
                      {recurrence.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Reminder">
                <select
                  value={editor.reminder_minutes}
                  onChange={(e) => setEditor((prev) => ({ ...prev, reminder_minutes: Number(e.target.value) }))}
                  className={inputClass}
                >
                  {REMINDER_PRESETS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes === 0 ? 'At event time' : `${minutes} min before`}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Location (optional)">
                <input
                  value={editor.location}
                  onChange={(e) => setEditor((prev) => ({ ...prev, location: e.target.value }))}
                  className={inputClass}
                  placeholder="Classroom B2"
                />
              </Field>
            </div>

            <Field label="Notes (optional)">
              <textarea
                value={editor.notes}
                onChange={(e) => setEditor((prev) => ({ ...prev, notes: e.target.value }))}
                className={`${inputClass} min-h-20`}
              />
            </Field>

            {error && <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

            <div className="mt-4 flex items-center justify-between gap-2">
              {editor.id ? (
                <button
                  disabled={isSaving}
                  onClick={() => editor.id && removeEvent(editor.id)}
                  className="inline-flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-destructive hover:bg-destructive/20 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              ) : (
                <div />
              )}
              <button
                disabled={isSaving}
                onClick={saveEvent}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {isSaving ? 'Saving...' : editor.id ? 'Update Event' : 'Create Event'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={isDayPopupOpen} onOpenChange={setIsDayPopupOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dayPopupDate ? format(dayPopupDate, 'EEEE, MMM d') : 'Day details'}</DialogTitle>
            <DialogDescription>
              {dayPopupEvents.length > 0 ? 'There are events on this day.' : 'No events on this day.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {dayPopupEvents.length === 0 ? (
              <p className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                No event planned.
              </p>
            ) : (
              dayPopupEvents.map((event) => (
                <button
                  key={event.id}
                  onClick={() => {
                    openEditEditor(event)
                    setIsDayPopupOpen(false)
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-left hover:border-primary/40"
                >
                  <p className="text-sm font-medium text-foreground">{event.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(parseISO(event.starts_at), 'h:mm a')} - {format(parseISO(event.ends_at), 'h:mm a')}
                  </p>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function buildEmptyEditor(date: Date): EditorState {
  const start = startOfDay(date)
  const starts = addHours(start, 9)
  const ends = addHours(starts, 1)
  return {
    title: '',
    starts_at: toDatetimeInput(starts),
    ends_at: toDatetimeInput(ends),
    tag: 'casual',
    priority: 'medium',
    reminder_minutes: 60,
    recurrence: 'none',
    location: '',
    notes: '',
    completed: false,
  }
}

function toDatetimeInput(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  )
}

const inputClass =
  'w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring'

function toDayKey(day: Date) {
  return new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate())).toISOString().slice(0, 10)
}

function shorten(value: string, max: number) {
  const clean = value.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1)}...`
}

function buildStreakMarkers(moodDayKeys: string[]) {
  const unique = Array.from(new Set(moodDayKeys)).sort((a, b) => a.localeCompare(b))
  const markers = new Map<string, DayMarker>()
  if (unique.length === 0) return markers

  const runs: string[][] = []
  let currentRun: string[] = [unique[0]]

  for (let i = 1; i < unique.length; i += 1) {
    const prev = new Date(`${unique[i - 1]}T00:00:00Z`)
    const current = new Date(`${unique[i]}T00:00:00Z`)
    const diff = Math.round((current.getTime() - prev.getTime()) / 86400000)
    if (diff === 1) {
      currentRun.push(unique[i])
    } else {
      runs.push(currentRun)
      currentRun = [unique[i]]
    }
  }
  runs.push(currentRun)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayKey = today.toISOString().slice(0, 10)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = yesterday.toISOString().slice(0, 10)

  const lastRun = runs[runs.length - 1]
  const runEndsOn = lastRun[lastRun.length - 1]
  const active = runEndsOn === todayKey || runEndsOn === yesterdayKey

  if (active) {
    for (const dayKey of lastRun) markers.set(dayKey, 'active_streak')
    for (let i = 0; i < runs.length - 1; i += 1) {
      const endedRun = runs[i]
      for (const dayKey of endedRun) markers.set(dayKey, 'ended_streak')
      markers.set(endedRun[endedRun.length - 1], 'ended_cross')
    }
  } else {
    for (const endedRun of runs) {
      for (const dayKey of endedRun) markers.set(dayKey, 'ended_streak')
      markers.set(endedRun[endedRun.length - 1], 'ended_cross')
    }
  }

  return markers
}

