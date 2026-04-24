import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { saveMoodEntry } from '@/lib/mood-storage'

const MoodTrackSchema = z.object({
  reflection: z.string().min(3).max(400),
  happiness: z.number().int().min(0).max(100),
  stress: z.number().int().min(0).max(100),
  source: z.enum(['checkin', 'chat']).default('checkin'),
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
    return Response.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const parsed = MoodTrackSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Please provide reflection, happiness and stress.' }, { status: 400 })
  }

  try {
    const entry = await saveMoodEntry(supabase, {
      user_id: user.id,
      reflection: parsed.data.reflection,
      happiness: parsed.data.happiness,
      stress: parsed.data.stress,
      source: parsed.data.source,
    })
    return Response.json({ entry })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save mood entry.'
    return Response.json({ error: message }, { status: 500 })
  }
}
