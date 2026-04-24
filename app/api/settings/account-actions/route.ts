import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ActionSchema = z.object({
  action: z.enum(['clear_history', 'reset_personalization', 'delete_account']),
  confirmationText: z.string().optional(),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const parsed = ActionSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid action.' }, { status: 400 })
  }

  const action = parsed.data.action
  const confirmationText = parsed.data.confirmationText
  const admin = createAdminClient()

  if (action === 'clear_history') {
    await clearHistory({ supabase: admin, userId: user.id })
    return Response.json({ ok: true })
  }

  if (action === 'reset_personalization') {
    await resetPersonalization({ supabase: admin, userId: user.id })
    return Response.json({ ok: true })
  }

  if (confirmationText !== 'DELETE') {
    return Response.json({ error: 'Please type DELETE to confirm account deletion.' }, { status: 400 })
  }

  await deleteAccount({ supabase: admin, userId: user.id })
  return Response.json({ ok: true })
}

async function clearHistory({ supabase, userId }: { supabase: ReturnType<typeof createAdminClient>; userId: string }) {
  // Delete rows from optional tables if they exist.
  await maybeDelete(() => supabase.from('chat_messages').delete().eq('user_id', userId))
  await maybeDelete(() => supabase.from('memory_logs').delete().eq('user_id', userId))
  await maybeDelete(() => supabase.from('insights').delete().eq('user_id', userId))

  // Also clear embedded/fallback history in twin profile.
  const { data: twinProfile } = await supabase
    .from('twin_profiles')
    .select('id, ai_personality_model')
    .eq('user_id', userId)
    .single()

  if (!twinProfile) return

  const modelData =
    twinProfile.ai_personality_model && typeof twinProfile.ai_personality_model === 'object'
      ? (twinProfile.ai_personality_model as Record<string, unknown>)
      : {}

  await supabase
    .from('twin_profiles')
    .update({
      ai_personality_model: {
        ...modelData,
        chat_history: [],
        mood_tracker_entries: [],
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', twinProfile.id)
}

async function resetPersonalization({
  supabase,
  userId,
}: {
  supabase: ReturnType<typeof createAdminClient>
  userId: string
}) {
  const { data: twinProfile } = await supabase
    .from('twin_profiles')
    .select('id')
    .eq('user_id', userId)
    .single()

  if (!twinProfile) return

  await supabase
    .from('twin_profiles')
    .update({
      voice_preference: 'female',
      personality_traits: [],
      interests: [],
      goals: [],
      daily_habits: [],
      ai_personality_model: {
        communication_style: 'encouraging',
        decision_making: 'collaborative',
        chat_history: [],
        mood_tracker_entries: [],
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', twinProfile.id)
}

async function deleteAccount({ supabase, userId }: { supabase: ReturnType<typeof createAdminClient>; userId: string }) {
  // Deleting auth user cascades to profile/twin data (FK with on delete cascade).
  const { error } = await supabase.auth.admin.deleteUser(userId)
  if (error) {
    throw new Error(error.message || 'Could not delete account.')
  }
}

async function maybeDelete(operation: () => Promise<{ error: { message: string } | null }>) {
  const { error } = await operation()
  if (!error) return
  if (isMissingTableError(error.message)) return
  throw new Error(error.message)
}

function isMissingTableError(message: string) {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('could not find the table') ||
    (normalized.includes('relation') && normalized.includes('does not exist'))
  )
}
