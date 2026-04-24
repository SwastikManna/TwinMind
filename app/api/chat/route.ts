import {
  consumeStream,
  convertToModelMessages,
  generateObject,
  ProviderOptions,
  streamText,
  UIMessage,
} from 'ai'
import { getLanguageModel, getObjectGenerationProviderOptions } from '@/lib/ai'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { logTelemetryEvent } from '@/lib/telemetry'
import { getMissedMoodDays, inferMoodScoresFromText } from '@/lib/mood'
import { fetchMoodEntries, saveMoodEntry } from '@/lib/mood-storage'
import { inferBehaviorEntries } from '@/lib/behavior'
import { saveBehaviorEntries } from '@/lib/behavior-storage'
import {
  formatEventForPrompt,
  getCalendarConflicts,
  getDueReminders,
  getFallbackCalendarEvents,
  getPriorityRiskItems,
  isMissingTableError,
  normalizeCalendarEvent,
} from '@/lib/calendar'
import type { CalendarEvent } from '@/lib/types'
import { z } from 'zod'

export const maxDuration = 60

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[]; twinProfile?: TwinProfileContext } = await req.json()

  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: 'At least one message is required.' }, { status: 400 })
  }

  if (messages.length > 50) {
    return Response.json({ error: 'Too many messages in a single request.' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    logTelemetryEvent({ name: 'chat.unauthorized', level: 'warn' })
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: storedProfile } = await supabase
    .from('twin_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user')
  const latestUserText = latestUserMessage?.parts
    ?.filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('')
    .trim()

  if (!latestUserText) {
    return Response.json({ error: 'User message text is required.' }, { status: 400 })
  }

  if (latestUserText.length > 4000) {
    return Response.json({ error: 'Message is too long. Please keep it under 4000 characters.' }, { status: 400 })
  }

  // Build the system prompt based on the twin profile
  const upcomingEvents = await fetchUpcomingEventsForPrompt({
    supabase,
    userId: user.id,
    fallbackModel: storedProfile?.ai_personality_model,
  })

  const riskCoachingContext = buildRiskCoachingContext({
    latestUserText,
    upcomingEvents,
  })
  const plannerIntelligenceContext = buildPlannerIntelligenceContext(upcomingEvents)
  const moodEntries = await fetchMoodEntries(supabase, user.id)
  const missedMoodDays = getMissedMoodDays({
    entries: moodEntries,
    maxDays: 5,
    includeToday: false,
  })
  const checkinContext = buildMissedCheckinContext(missedMoodDays)

  const systemPrompt = buildTwinSystemPrompt(
    storedProfile || undefined,
    upcomingEvents,
    riskCoachingContext,
    checkinContext,
    plannerIntelligenceContext,
  )
  const result = streamText({
    model: getLanguageModel(),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    temperature: 0.6,
    abortSignal: req.signal,
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: async ({ messages: allMessages, isAborted }) => {
      if (isAborted) return
      logTelemetryEvent({
        name: 'chat.completed',
        userId: user.id,
        metadata: { messageCount: allMessages.length },
      })
      
      // Save the conversation to the database
      try {
        if (allMessages.length >= 2) {
          // Get the last user message and assistant response
          const lastUserMsg = [...allMessages].reverse().find(m => m.role === 'user')
          const lastAssistantMsg = [...allMessages].reverse().find(m => m.role === 'assistant')
          
          if (lastUserMsg && lastAssistantMsg) {
            const userContent = lastUserMsg.parts
              ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
              .map(p => p.text)
              .join('') || ''
            
            const assistantContent = lastAssistantMsg.parts
              ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
              .map(p => p.text)
              .join('') || ''

            await persistChatTurn({
              supabase,
              userId: user.id,
              userName: (user.user_metadata?.name as string | undefined) || null,
              userEmail: user.email || null,
              userContent,
              assistantContent,
            })

            // Auto-extract memory/insight signals from the latest conversation turn.
            await extractAndStoreConversationSignals({
              supabase,
              userId: user.id,
              userContent,
              assistantContent,
            })

            await persistChatMoodSnapshot({
              supabase,
              userId: user.id,
              userText: userContent,
            })

            await persistBehaviorPointsSnapshot({
              supabase,
              userId: user.id,
              userText: userContent,
              assistantText: assistantContent,
              upcomingEvents,
            })
          }
        }
      } catch (error) {
        logTelemetryEvent({
          name: 'chat.persist_failed',
          level: 'error',
          userId: user.id,
          metadata: { error: error instanceof Error ? error.message : 'unknown' },
        })
        console.error('Error saving chat messages:', error)
      }
    },
    consumeSseStream: consumeStream,
  })
}

interface TwinProfileContext {
  name: string
  personality_traits: string[]
  interests: string[]
  goals: string[]
  daily_habits: string[]
  communication_style?: string
  ai_personality_model?: {
    communication_style?: string
  }
}

interface ExtractSignalsParams {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  userContent: string
  assistantContent: string
}

interface PersistChatTurnParams {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  userName: string | null
  userEmail: string | null
  userContent: string
  assistantContent: string
}

interface PersistChatMoodSnapshotParams {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  userText: string
}

interface PersistBehaviorPointsSnapshotParams {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  userText: string
  assistantText: string
  upcomingEvents: CalendarEvent[]
}

interface FetchUpcomingEventsParams {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  fallbackModel?: unknown
}

const ExtractedSignalsSchema = z.object({
  memoryLogs: z
    .array(
      z.object({
        content: z.string().min(1).max(400),
        log_type: z.enum(['daily', 'reflection', 'decision', 'mood']),
        sentiment: z.enum(['positive', 'neutral', 'negative']).nullable(),
      }),
    )
    .max(2),
  insight: z
    .object({
      summary: z.string().min(1).max(500),
      insight_type: z.enum(['behavior', 'habit', 'goal', 'recommendation']),
    })
    .nullable(),
})

function buildTwinSystemPrompt(
  profile?: TwinProfileContext,
  upcomingEvents: CalendarEvent[] = [],
  riskCoachingContext = '',
  checkinContext = '',
  plannerIntelligenceContext = '',
): string {
  if (!profile) {
    return `You are TwinMind, a helpful and empathetic AI digital twin. You aim to understand the user deeply and provide personalized guidance. Be warm, supportive, and thoughtful in your responses. Ask clarifying questions when needed and remember details about the user to build a meaningful relationship. Keep answers concise and practical by default.`
  }

  const traits = profile.personality_traits.length > 0 
    ? `The user has described themselves as: ${profile.personality_traits.join(', ')}.`
    : ''
  
  const interests = profile.interests.length > 0
    ? `Their interests include: ${profile.interests.join(', ')}.`
    : ''
  
  const goals = profile.goals.length > 0
    ? `Their current goals are: ${profile.goals.join('; ')}.`
    : ''
  
  const habits = profile.daily_habits.length > 0
    ? `Their daily habits include: ${profile.daily_habits.join(', ')}.`
    : ''

  const prioritizedGoal = profile.goals[0]
    ? `The top current goal to prioritize in advice is: ${profile.goals[0]}.`
    : ''

  const eventContext = upcomingEvents.length
    ? `Upcoming events in the user's planner:\n${upcomingEvents.map((event) => `- ${formatEventForPrompt(event)}`).join('\n')}`
    : 'There are currently no upcoming planner events available.'

  return `You are ${profile.name}'s personal digital twin - an AI companion that deeply understands them and provides personalized guidance.

${traits}
${interests}
${goals}
${habits}
${prioritizedGoal}
${eventContext}
${riskCoachingContext}
${checkinContext}
${plannerIntelligenceContext}

As their digital twin, you should:
1. Communicate in a ${profile.communication_style || profile.ai_personality_model?.communication_style || 'warm and encouraging'} manner
2. Reference their interests and goals naturally in conversation
3. Provide advice that aligns with their personality and values
4. Help them stay accountable to their goals
5. Offer emotional support and understanding
6. Ask thoughtful questions to learn more about them
7. Remember context from the conversation to build a meaningful relationship
8. Use the planner event context to answer schedule questions accurately
9. If the user suggests low-priority plans right before a super-important event, gently warn them and suggest a safer alternative

Response quality rules:
- Provide short, actionable next steps whenever possible.
- If the user is overwhelmed, reduce options and suggest one best next step.
- Ask at most one follow-up question unless the user asks for deeper exploration.

Be genuine, supportive, and insightful. You're not just an AI assistant - you're their personal companion helping them grow and thrive.`
}

function buildPlannerIntelligenceContext(upcomingEvents: CalendarEvent[]) {
  if (upcomingEvents.length === 0) return ''
  const conflicts = getCalendarConflicts(upcomingEvents).slice(0, 3)
  const reminders = getDueReminders(upcomingEvents, 240).slice(0, 3)
  const risks = getPriorityRiskItems(upcomingEvents).slice(0, 2)

  const lines: string[] = ['PLANNER INTELLIGENCE CONTEXT:']

  if (conflicts.length > 0) {
    lines.push(
      `- Conflicts detected: ${conflicts
        .map((conflict) => `${conflict.first.title} vs ${conflict.second.title} (${conflict.overlapMinutes}m overlap)`)
        .join('; ')}`,
    )
  }

  if (reminders.length > 0) {
    lines.push(
      `- Upcoming reminders: ${reminders
        .map((item) => `${item.event.title} in ${item.startsInMinutes}m`)
        .join('; ')}`,
    )
  }

  if (risks.length > 0) {
    lines.push(
      `- Focus risks before critical events: ${risks
        .map((risk) => `${risk.event.title} has ${risk.conflictingLowPriority.length} distracting plan(s)`)
        .join('; ')}`,
    )
  }

  lines.push(
    '- If user asks about schedule, answer with precise event time and suggest one concrete planning action when conflicts/risks exist.',
  )

  return lines.join('\n')
}

function buildMissedCheckinContext(missedMoodDays: string[]) {
  if (missedMoodDays.length === 0) return ''
  const recentDays = missedMoodDays
    .slice(0, 2)
    .map((day) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
    .join(', ')

  return `CHECK-IN CONTEXT:
- The user has missing daily mood recap entries for: ${recentDays}.
- When relevant, gently ask for a short day recap and stress/happiness reflection so their progress graphs stay complete.
- Keep this nudge concise and supportive (one line).`
}

async function extractAndStoreConversationSignals({
  supabase,
  userId,
  userContent,
  assistantContent,
}: ExtractSignalsParams) {
  const userText = userContent.trim()
  const assistantText = assistantContent.trim()

  if (!userText || !assistantText) {
    return
  }

  try {
    const { object } = await generateObject({
      model: getLanguageModel(),
      schema: ExtractedSignalsSchema,
      temperature: 0.2,
      providerOptions: getObjectGenerationProviderOptions() as ProviderOptions,
      prompt: `Extract memory signals from this chat turn.

User message:
${userText}

Assistant response:
${assistantText}

Output constraints:
- memoryLogs: include only high-signal facts or emotional markers worth storing long-term.
- insight: include only if there's a meaningful recommendation or pattern.
- Avoid repeating content verbatim; summarize in neutral language.
- Return JSON only.`,
    })

    if (object.memoryLogs.length > 0) {
      const rows = object.memoryLogs.map((log) => ({
        user_id: userId,
        content: log.content,
        log_type: log.log_type,
        sentiment: log.sentiment,
      }))

      const { error } = await supabase.from('memory_logs').insert(rows)
      if (error) {
        console.error('Error inserting memory logs:', error)
      }
    }

    if (object.insight) {
      const { error } = await supabase.from('insights').insert({
        user_id: userId,
        summary: object.insight.summary,
        insight_type: object.insight.insight_type,
        data: { source: 'chat_auto_extract', created_at: new Date().toISOString() },
      })

      if (error) {
        console.error('Error inserting insight:', error)
      }
    }
  } catch (error) {
    logTelemetryEvent({
      name: 'chat.signal_extraction_failed',
      level: 'warn',
      userId,
      metadata: { error: error instanceof Error ? error.message : 'unknown' },
    })
    console.error('Signal extraction failed:', error)
  }
}

async function persistChatTurn({
  supabase,
  userId,
  userName,
  userEmail,
  userContent,
  assistantContent,
}: PersistChatTurnParams) {
  let db = supabase
  try {
    db = createAdminClient() as unknown as Awaited<ReturnType<typeof createClient>>
  } catch {
    // If admin client is unavailable, fall back to user-scoped client.
  }

  // Ensure the parent profile exists for FK constraints.
  const { error: profileError } = await db.from('profiles').upsert(
    {
      id: userId,
      name: userName,
      email: userEmail,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )

  if (profileError) {
    logTelemetryEvent({
      name: 'chat.profile_upsert_failed',
      level: 'warn',
      userId,
      metadata: { error: profileError.message },
    })
  }

  const userCreatedAt = new Date()
  const assistantCreatedAt = new Date(userCreatedAt.getTime() + 1)
  const { error: insertError } = await db.from('chat_messages').insert([
    { user_id: userId, role: 'user', content: userContent, created_at: userCreatedAt.toISOString() },
    { user_id: userId, role: 'assistant', content: assistantContent, created_at: assistantCreatedAt.toISOString() },
  ])

  if (!insertError) {
    return
  }

  logTelemetryEvent({
    name: 'chat.persist_primary_failed',
    level: 'warn',
    userId,
    metadata: { error: insertError.message },
  })

  // Fallback storage path when chat_messages table/RLS is unavailable.
  const { data: twinProfile } = await db
    .from('twin_profiles')
    .select('id, ai_personality_model')
    .eq('user_id', userId)
    .single()

  if (!twinProfile) {
    return
  }

  const modelData =
    twinProfile.ai_personality_model && typeof twinProfile.ai_personality_model === 'object'
      ? (twinProfile.ai_personality_model as Record<string, unknown>)
      : {}

  const existingHistory = Array.isArray(modelData.chat_history)
    ? (modelData.chat_history as Array<Record<string, unknown>>)
    : []

  const now = assistantCreatedAt.toISOString()
  const updatedHistory = [
    ...existingHistory,
    { role: 'user', content: userContent, created_at: userCreatedAt.toISOString() },
    { role: 'assistant', content: assistantContent, created_at: assistantCreatedAt.toISOString() },
  ].slice(-100)

  const { error: fallbackError } = await db
    .from('twin_profiles')
    .update({
      ai_personality_model: {
        ...modelData,
        chat_history: updatedHistory,
      },
      updated_at: now,
    })
    .eq('id', twinProfile.id)

  if (fallbackError) {
    logTelemetryEvent({
      name: 'chat.persist_fallback_failed',
      level: 'error',
      userId,
      metadata: { error: fallbackError.message },
    })
  }
}

async function persistChatMoodSnapshot({
  supabase,
  userId,
  userText,
}: PersistChatMoodSnapshotParams) {
  const text = userText.trim()
  if (text.length < 3) return

  const { happiness, stress } = inferMoodScoresFromText(text)

  try {
    await saveMoodEntry(supabase, {
      user_id: userId,
      source: 'chat',
      reflection: text.slice(0, 240),
      happiness,
      stress,
    })
  } catch (error) {
    logTelemetryEvent({
      name: 'chat.mood_snapshot_failed',
      level: 'warn',
      userId,
      metadata: { error: error instanceof Error ? error.message : 'unknown' },
    })
  }
}

async function persistBehaviorPointsSnapshot({
  supabase,
  userId,
  userText,
  assistantText,
  upcomingEvents,
}: PersistBehaviorPointsSnapshotParams) {
  const entries = inferBehaviorEntries({
    userText,
    assistantText,
    upcomingEvents,
    userId,
  })
  if (entries.length === 0) return

  try {
    await saveBehaviorEntries(supabase, userId, entries)
  } catch (error) {
    logTelemetryEvent({
      name: 'chat.behavior_snapshot_failed',
      level: 'warn',
      userId,
      metadata: { error: error instanceof Error ? error.message : 'unknown' },
    })
  }
}

async function fetchUpcomingEventsForPrompt({
  supabase,
  userId,
  fallbackModel,
}: FetchUpcomingEventsParams): Promise<CalendarEvent[]> {
  let db = supabase
  try {
    db = createAdminClient() as unknown as Awaited<ReturnType<typeof createClient>>
  } catch {
    // Fall back to scoped client.
  }

  const nowIso = new Date().toISOString()
  const { data, error } = await db
    .from('calendar_events')
    .select('*')
    .eq('user_id', userId)
    .gte('ends_at', nowIso)
    .order('starts_at', { ascending: true })
    .limit(8)

  if (!error) {
    return (data || []).map((event) => normalizeCalendarEvent(event, userId))
  }

  if (!isMissingTableError(error.message)) {
    return []
  }

  const fallbackEvents = getFallbackCalendarEvents(fallbackModel, userId)
    .filter((event) => event.ends_at >= nowIso)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, 8)
  return fallbackEvents
}

function buildRiskCoachingContext({
  latestUserText,
  upcomingEvents,
}: {
  latestUserText: string
  upcomingEvents: CalendarEvent[]
}) {
  const criticalEvent = upcomingEvents.find((event) => {
    if (event.tag !== 'super_important' && event.priority !== 'critical') return false
    const start = new Date(event.starts_at).getTime()
    const now = Date.now()
    const hoursAway = (start - now) / (1000 * 60 * 60)
    return hoursAway >= 0 && hoursAway <= 24
  })

  if (!criticalEvent) return ''

  const normalizedText = latestUserText.toLowerCase()
  const riskyKeywords = [
    'movie',
    'watch',
    'party',
    'hangout',
    'gaming',
    'game',
    'binge',
    'netflix',
    'instagram',
    'reel',
    'scroll',
  ]
  const mentionsRisk = riskyKeywords.some((keyword) => normalizedText.includes(keyword))
  if (!mentionsRisk) return ''

  const eventTime = new Date(criticalEvent.starts_at).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  return `RISK ALERT CONTEXT:
- User mentioned a potentially distracting plan right before a critical event.
- Critical event: ${criticalEvent.title} at ${eventTime}.
- Start your response with token [[mood:dissatisfied]].
- Briefly explain concern, remind the event timing, and propose one concrete better next action.`
}
