import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { inferMoodScoresFromText } from '@/lib/mood'
import { saveMoodEntry } from '@/lib/mood-storage'

const DailyCheckinSchema = z.object({
  mood: z.string().min(1).max(120),
  win: z.string().min(1).max(300),
  blocker: z.string().min(1).max(300),
  focus: z.string().min(1).max(300),
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

  const parsed = DailyCheckinSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Please complete all check-in fields.' }, { status: 400 })
  }

  const { mood, win, blocker, focus } = parsed.data
  const now = new Date().toISOString()
  const narrative = `Mood: ${mood}. Win: ${win}. Blocker: ${blocker}. Focus: ${focus}`
  const { happiness, stress } = inferMoodScoresFromText(narrative)

  const rows = [
    {
      user_id: user.id,
      log_type: 'mood' as const,
      sentiment: 'neutral',
      content: `Daily check-in mood: ${mood}`,
      created_at: now,
    },
    {
      user_id: user.id,
      log_type: 'reflection' as const,
      sentiment: 'positive',
      content: `Daily win: ${win}`,
      created_at: now,
    },
    {
      user_id: user.id,
      log_type: 'daily' as const,
      sentiment: 'neutral',
      content: `Current blocker: ${blocker}. Focus for today: ${focus}`,
      created_at: now,
    },
  ]

  try {
    await saveMoodEntry(supabase, {
      user_id: user.id,
      source: 'checkin',
      reflection: narrative,
      happiness,
      stress,
      created_at: now,
    })
  } catch {
    // Keep check-in usable even if mood storage is temporarily unavailable.
  }

  const { error } = await supabase.from('memory_logs').insert(rows)
  if (error && !isMissingTableError(error.message || '')) {
    return Response.json({ error: error.message || 'Could not save daily check-in.' }, { status: 500 })
  }

  return Response.json({ ok: true })
}

function isMissingTableError(message: string) {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('could not find the table') ||
    (normalized.includes('relation') && normalized.includes('does not exist'))
  )
}
