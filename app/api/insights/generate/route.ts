import { generateObject, generateText } from 'ai'
import { getLanguageModel, getObjectGenerationProviderOptions } from '@/lib/ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { logTelemetryEvent } from '@/lib/telemetry'

const InsightSchema = z.object({
  summary: z.string().min(1).max(500),
  insight_type: z.enum(['behavior', 'habit', 'goal', 'recommendation']),
})

export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      logTelemetryEvent({ name: 'insight.generate.unauthorized', level: 'warn' })
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

    const { data: memoryLogs, error: memoryLogsError } = await supabase
      .from('memory_logs')
      .select('content, log_type, sentiment, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)

    const { data: recentChats, error: recentChatsError } = await supabase
      .from('chat_messages')
      .select('role, content, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)

    if (memoryLogsError && !isMissingTableError(memoryLogsError.message)) {
      return Response.json({ error: memoryLogsError.message }, { status: 500 })
    }
    if (recentChatsError && !isMissingTableError(recentChatsError.message)) {
      return Response.json({ error: recentChatsError.message }, { status: 500 })
    }

    const logsContext = (memoryLogs || [])
      .map((log) => `- [${log.log_type}] ${log.content}`)
      .join('\n')
    const chatContext = (recentChats || [])
      .reverse()
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n')

    const prompt = `Generate one high-value insight for this user.

User profile:
- Name: ${twinProfile.name}
- Goals: ${(twinProfile.goals || []).join('; ') || 'None listed'}
- Personality traits: ${(twinProfile.personality_traits || []).join(', ') || 'None listed'}
- Interests: ${(twinProfile.interests || []).join(', ') || 'None listed'}
- Daily habits: ${(twinProfile.daily_habits || []).join(', ') || 'None listed'}

Recent memory logs:
${logsContext || 'No logs yet'}

Recent chat:
${chatContext || 'No recent chat'}

Rules:
- Create exactly one concise insight with practical value.
- If there is enough context on goals, prefer insight_type=goal or recommendation.
- Do not repeat generic motivational advice.
- Return JSON only.`

    const object = await generateInsightObject({
      prompt,
      twinName: twinProfile.name,
      userId: user.id,
    })

    const { data: inserted, error } = await supabase
      .from('insights')
      .insert({
        user_id: user.id,
        summary: object.summary,
        insight_type: object.insight_type,
        data: { source: 'insight_generation_api', created_at: new Date().toISOString() },
      })
      .select('*')
      .single()

    if (error) {
      logTelemetryEvent({
        name: 'insight.generate.insert_failed',
        level: 'error',
        userId: user.id,
        metadata: { error: error.message },
      })
      return Response.json({ error: error.message }, { status: 500 })
    }

    logTelemetryEvent({
      name: 'insight.generate.success',
      userId: user.id,
      metadata: { insightType: object.insight_type },
    })

    return Response.json({ insight: inserted })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    logTelemetryEvent({
      name: 'insight.generate.failed',
      level: 'error',
      metadata: { error: message },
    })
    return Response.json({ error: message }, { status: 500 })
  }
}

async function generateInsightObject({
  prompt,
  twinName,
  userId,
}: {
  prompt: string
  twinName: string
  userId: string
}) {
  try {
    const { object } = await generateObject({
      model: getLanguageModel(),
      schema: InsightSchema,
      temperature: 0.4,
      providerOptions: getObjectGenerationProviderOptions(),
      prompt,
    })
    return object
  } catch (error) {
    logTelemetryEvent({
      name: 'insight.generate.schema_fallback',
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
  "insight_type": "behavior|habit|goal|recommendation"
}
`,
    })

    const parsed = parseJsonObject(text)
    const normalized = InsightSchema.safeParse(parsed)
    if (normalized.success) {
      return normalized.data
    }
  } catch (error) {
    logTelemetryEvent({
      name: 'insight.generate.text_fallback_failed',
      level: 'warn',
      userId,
      metadata: {
        error: error instanceof Error ? error.message : 'unknown',
      },
    })
  }

  return {
    summary: `${twinName}'s current trajectory looks positive. Focus on one small, repeatable action today to build momentum.`,
    insight_type: 'recommendation' as const,
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

function isMissingTableError(message: string) {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('could not find the table') ||
    (normalized.includes('relation') && normalized.includes('does not exist'))
  )
}
