import { generateObject, generateText } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getLanguageModel, getObjectGenerationProviderOptions } from '@/lib/ai'

const GoalPlanSchema = z.object({
  focus_goal: z.string().min(1).max(180),
  weekly_tasks: z
    .array(
      z.object({
        day: z.string().min(1).max(20),
        task: z.string().min(1).max(180),
        why: z.string().min(1).max(220),
      }),
    )
    .min(3)
    .max(7),
  risk: z.string().min(1).max(220),
  win_condition: z.string().min(1).max(220),
})

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: twinProfile } = await supabase
    .from('twin_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!twinProfile) {
    return Response.json({ error: 'Twin profile not found' }, { status: 404 })
  }

  const goals: string[] = twinProfile.goals || []
  if (goals.length === 0) {
    return Response.json({ error: 'No goals found to plan.' }, { status: 400 })
  }

  const prompt = `Create a practical 7-day goal execution plan.

User goals:
${goals.map((goal, index) => `${index + 1}. ${goal}`).join('\n')}

User daily habits:
${(twinProfile.daily_habits || []).join(', ') || 'None listed'}

Rules:
- Choose one focus goal that matters most this week.
- Give 3-7 tasks across the week.
- Tasks must be tiny, concrete, and realistic.
- Include one likely risk and one clear win condition.
- Return JSON only.`

  const plan = await generateGoalPlan(prompt, goals)

  const modelData =
    twinProfile.ai_personality_model && typeof twinProfile.ai_personality_model === 'object'
      ? (twinProfile.ai_personality_model as Record<string, unknown>)
      : {}

  await supabase
    .from('twin_profiles')
    .update({
      ai_personality_model: {
        ...modelData,
        goal_coach_plan: {
          ...plan,
          generated_at: new Date().toISOString(),
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', twinProfile.id)

  return Response.json({ plan })
}

async function generateGoalPlan(prompt: string, goals: string[]) {
  try {
    const { object } = await generateObject({
      model: getLanguageModel(),
      schema: GoalPlanSchema,
      temperature: 0.4,
      providerOptions: getObjectGenerationProviderOptions(),
      prompt,
    })
    return object
  } catch {
    // continue
  }

  try {
    const { text } = await generateText({
      model: getLanguageModel(),
      temperature: 0.2,
      prompt: `${prompt}

Return a valid JSON object with this shape:
{
  "focus_goal": "string",
  "weekly_tasks": [{"day":"Mon","task":"...","why":"..."}],
  "risk": "string",
  "win_condition": "string"
}`,
    })

    const parsed = parseJsonObject(text)
    const normalized = GoalPlanSchema.safeParse(parsed)
    if (normalized.success) {
      return normalized.data
    }
  } catch {
    // continue
  }

  return {
    focus_goal: goals[0] || 'Primary goal',
    weekly_tasks: [
      { day: 'Mon', task: `20 min focused work on: ${goals[0] || 'primary goal'}`, why: 'Start momentum early.' },
      { day: 'Wed', task: 'Review progress and remove one blocker.', why: 'Mid-week correction prevents drift.' },
      { day: 'Fri', task: 'Ship one visible result.', why: 'A visible win increases consistency.' },
    ],
    risk: 'Overplanning without execution.',
    win_condition: 'At least 3 focused sessions completed this week.',
  }
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const firstBrace = trimmed.indexOf('{')
    const lastBrace = trimmed.lastIndexOf('}')
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1))
    }
    throw new Error('No JSON found')
  }
}
