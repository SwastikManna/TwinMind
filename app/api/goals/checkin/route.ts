import { generateObject, generateText } from 'ai'
import { getLanguageModel, getObjectGenerationProviderOptions } from '@/lib/ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { logTelemetryEvent } from '@/lib/telemetry'

const GoalCheckinSchema = z.object({
  summary: z.string().min(1).max(500),
  suggested_actions: z.array(z.string().min(1).max(160)).max(3),
})

export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      logTelemetryEvent({ name: 'goals.checkin.unauthorized', level: 'warn' })
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
      return Response.json({ error: 'No goals found' }, { status: 400 })
    }

    const { data: recentLogs, error: recentLogsError } = await supabase
      .from('memory_logs')
      .select('content, log_type, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(15)

    if (recentLogsError && !isMissingTableError(recentLogsError.message)) {
      return Response.json({ error: recentLogsError.message }, { status: 500 })
    }

    const logsContext = (recentLogs || [])
      .map((log) => `- [${log.log_type}] ${log.content}`)
      .join('\n')

    const prompt = `Create a focused goal check-in for this user.

Active goals:
${goals.map((goal, index) => `${index + 1}. ${goal}`).join('\n')}

Recent memory logs:
${logsContext || 'No logs yet'}

Output requirements:
- A short motivating summary of progress status.
- Up to 3 concrete next actions for this week.
- Keep recommendations practical and specific.
- Return JSON only.`

    const object = await generateGoalCheckinObject({
      prompt,
      goals,
      userId: user.id,
    })

    let logError: { message: string } | null = null
    if (recentLogsError == null || !isMissingTableError(recentLogsError.message)) {
      const { error } = await supabase.from('memory_logs').insert({
        user_id: user.id,
        content: `Goal check-in: ${object.summary}`,
        log_type: 'reflection',
        sentiment: 'positive',
      })
      logError = error
    }

    if (logError) {
      logTelemetryEvent({
        name: 'goals.checkin.memory_log_failed',
        level: 'error',
        userId: user.id,
        metadata: { error: logError.message },
      })
      return Response.json({ error: logError.message }, { status: 500 })
    }

    let insight: unknown = null
    const { data: insertedInsight, error: insightError } = await supabase
      .from('insights')
      .insert({
        user_id: user.id,
        summary: `${object.summary} Next actions: ${object.suggested_actions.join(' | ')}`,
        insight_type: 'goal',
        data: {
          source: 'goal_checkin_api',
          suggested_actions: object.suggested_actions,
          created_at: new Date().toISOString(),
        },
      })
      .select('*')
      .single()

    if (insightError && !isMissingTableError(insightError.message)) {
      logTelemetryEvent({
        name: 'goals.checkin.insight_failed',
        level: 'error',
        userId: user.id,
        metadata: { error: insightError.message },
      })
      return Response.json({ error: insightError.message }, { status: 500 })
    }
    insight = insertedInsight

    logTelemetryEvent({
      name: 'goals.checkin.success',
      userId: user.id,
      metadata: { actionCount: object.suggested_actions.length },
    })

    return Response.json({
      checkin: object,
      insight,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    logTelemetryEvent({
      name: 'goals.checkin.failed',
      level: 'error',
      metadata: { error: message },
    })
    return Response.json({ error: message }, { status: 500 })
  }
}

function isMissingTableError(message: string) {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('could not find the table') ||
    normalized.includes('relation') && normalized.includes('does not exist')
  )
}

async function generateGoalCheckinObject({
  prompt,
  goals,
  userId,
}: {
  prompt: string
  goals: string[]
  userId: string
}) {
  try {
    const { object } = await generateObject({
      model: getLanguageModel(),
      schema: GoalCheckinSchema,
      temperature: 0.4,
      providerOptions: getObjectGenerationProviderOptions(),
      prompt,
    })
    return object
  } catch (error) {
    logTelemetryEvent({
      name: 'goals.checkin.schema_fallback',
      level: 'warn',
      userId,
      metadata: {
        error: error instanceof Error ? error.message : 'unknown',
      },
    })
  }

  try {
    const { text } = await generateText({
      model: getLanguageModel(),
      temperature: 0.2,
      prompt: `${prompt}

Return a valid JSON object with exactly this shape:
{
  "summary": "string",
  "suggested_actions": ["string", "string", "string"]
}
`,
    })

    const parsed = parseJsonObject(text)
    const normalized = GoalCheckinSchema.safeParse(parsed)
    if (normalized.success) {
      return normalized.data
    }
  } catch (error) {
    logTelemetryEvent({
      name: 'goals.checkin.text_fallback_failed',
      level: 'warn',
      userId,
      metadata: {
        error: error instanceof Error ? error.message : 'unknown',
      },
    })
  }

  // Guaranteed fallback so UI never breaks.
  return {
    summary: `You're making progress. Focus on one goal this week: ${goals[0] || 'your top priority'}.`,
    suggested_actions: [
      `Spend 20 minutes today on: ${goals[0] || 'your top priority'}.`,
      'Track one small win in your journal tonight.',
      'Set a reminder for a focused session tomorrow.',
    ],
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
      const candidate = trimmed.slice(firstBrace, lastBrace + 1)
      return JSON.parse(candidate)
    }
    throw new Error('No JSON object found in model response.')
  }
}
