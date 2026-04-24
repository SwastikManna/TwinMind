import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getFallbackCalendarEvents,
  isMissingTableError,
  normalizeCalendarEvent,
  withFallbackCalendarEvents,
} from '@/lib/calendar'
import type { CalendarEvent } from '@/lib/types'

const EventInputSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(160),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  tag: z.enum(['casual', 'important', 'super_important', 'health', 'study', 'work', 'social']).default('casual'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  reminder_minutes: z.number().int().min(0).max(10080).default(60),
  recurrence: z.enum(['none', 'daily', 'weekly', 'monthly']).default('none'),
  location: z.string().max(240).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  completed: z.boolean().default(false),
})

const UpdateEventSchema = EventInputSchema.partial().extend({
  id: z.string().min(1),
})

const DeleteEventSchema = z.object({
  id: z.string().min(1),
})

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let db = supabase
  try {
    db = createAdminClient() as unknown as typeof supabase
  } catch {
    // Fallback to scoped client.
  }

  const { data, error } = await db
    .from('calendar_events')
    .select('*')
    .eq('user_id', user.id)
    .order('starts_at', { ascending: true })

  if (!error) {
    const events = (data || []).map((event) => normalizeCalendarEvent(event, user.id))
    return Response.json({ events })
  }

  if (!isMissingTableError(error.message)) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const { data: twinProfile, error: twinError } = await db
    .from('twin_profiles')
    .select('ai_personality_model')
    .eq('user_id', user.id)
    .single()

  if (twinError) return Response.json({ error: twinError.message }, { status: 500 })

  const events = getFallbackCalendarEvents(twinProfile?.ai_personality_model, user.id)
  return Response.json({ events, source: 'fallback' })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = await req.json()
  const parsed = EventInputSchema.safeParse(payload)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message || 'Invalid event payload' }, { status: 400 })
  }

  let db = supabase
  try {
    db = createAdminClient() as unknown as typeof supabase
  } catch {
    // Fallback to scoped client.
  }

  const event = normalizeCalendarEvent(parsed.data, user.id)
  const { error } = await db.from('calendar_events').insert(event)

  if (!error) return Response.json({ event })

  if (!isMissingTableError(error.message)) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const { data: twinProfile, error: twinError } = await db
    .from('twin_profiles')
    .select('id, ai_personality_model')
    .eq('user_id', user.id)
    .single()

  if (twinError || !twinProfile) {
    return Response.json({ error: twinError?.message || 'Twin profile not found' }, { status: 500 })
  }

  const existing = getFallbackCalendarEvents(twinProfile.ai_personality_model, user.id)
  const updated = [...existing, event]
  const model = withFallbackCalendarEvents(twinProfile.ai_personality_model, user.id, updated)

  const { error: updateError } = await db
    .from('twin_profiles')
    .update({ ai_personality_model: model, updated_at: new Date().toISOString() })
    .eq('id', twinProfile.id)

  if (updateError) return Response.json({ error: updateError.message }, { status: 500 })
  return Response.json({ event, source: 'fallback' })
}

export async function PATCH(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = await req.json()
  const parsed = UpdateEventSchema.safeParse(payload)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message || 'Invalid update payload' }, { status: 400 })
  }

  let db = supabase
  try {
    db = createAdminClient() as unknown as typeof supabase
  } catch {
    // Fallback to scoped client.
  }

  const nowIso = new Date().toISOString()
  const patch = { ...parsed.data, updated_at: nowIso }
  const { data, error } = await db
    .from('calendar_events')
    .update(patch)
    .eq('user_id', user.id)
    .eq('id', parsed.data.id)
    .select('*')
    .single()

  if (!error) {
    return Response.json({ event: normalizeCalendarEvent(data, user.id) })
  }

  if (!isMissingTableError(error.message)) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const { data: twinProfile, error: twinError } = await db
    .from('twin_profiles')
    .select('id, ai_personality_model')
    .eq('user_id', user.id)
    .single()

  if (twinError || !twinProfile) {
    return Response.json({ error: twinError?.message || 'Twin profile not found' }, { status: 500 })
  }

  const existing = getFallbackCalendarEvents(twinProfile.ai_personality_model, user.id)
  const updated = existing.map((event) =>
    event.id === parsed.data.id ? normalizeCalendarEvent({ ...event, ...parsed.data, updated_at: nowIso }, user.id) : event,
  )
  const nextEvent = updated.find((event) => event.id === parsed.data.id)

  if (!nextEvent) return Response.json({ error: 'Event not found' }, { status: 404 })

  const model = withFallbackCalendarEvents(twinProfile.ai_personality_model, user.id, updated)
  const { error: updateError } = await db
    .from('twin_profiles')
    .update({ ai_personality_model: model, updated_at: nowIso })
    .eq('id', twinProfile.id)

  if (updateError) return Response.json({ error: updateError.message }, { status: 500 })
  return Response.json({ event: nextEvent, source: 'fallback' })
}

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = await req.json()
  const parsed = DeleteEventSchema.safeParse(payload)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message || 'Invalid delete payload' }, { status: 400 })
  }

  let db = supabase
  try {
    db = createAdminClient() as unknown as typeof supabase
  } catch {
    // Fallback to scoped client.
  }

  const { error } = await db
    .from('calendar_events')
    .delete()
    .eq('user_id', user.id)
    .eq('id', parsed.data.id)

  if (!error) return Response.json({ ok: true })
  if (!isMissingTableError(error.message)) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const { data: twinProfile, error: twinError } = await db
    .from('twin_profiles')
    .select('id, ai_personality_model')
    .eq('user_id', user.id)
    .single()

  if (twinError || !twinProfile) {
    return Response.json({ error: twinError?.message || 'Twin profile not found' }, { status: 500 })
  }

  const existing = getFallbackCalendarEvents(twinProfile.ai_personality_model, user.id)
  const next = existing.filter((event) => event.id !== parsed.data.id)
  const model = withFallbackCalendarEvents(twinProfile.ai_personality_model, user.id, next)

  const { error: updateError } = await db
    .from('twin_profiles')
    .update({ ai_personality_model: model, updated_at: new Date().toISOString() })
    .eq('id', twinProfile.id)

  if (updateError) return Response.json({ error: updateError.message }, { status: 500 })
  return Response.json({ ok: true, source: 'fallback' })
}

