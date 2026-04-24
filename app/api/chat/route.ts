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
import { inferMoodScoresFromText } from '@/lib/mood'
import { saveMoodEntry } from '@/lib/mood-storage'
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
  const systemPrompt = buildTwinSystemPrompt(storedProfile || undefined)
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

function buildTwinSystemPrompt(profile?: TwinProfileContext): string {
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

  return `You are ${profile.name}'s personal digital twin - an AI companion that deeply understands them and provides personalized guidance.

${traits}
${interests}
${goals}
${habits}
${prioritizedGoal}

As their digital twin, you should:
1. Communicate in a ${profile.communication_style || profile.ai_personality_model?.communication_style || 'warm and encouraging'} manner
2. Reference their interests and goals naturally in conversation
3. Provide advice that aligns with their personality and values
4. Help them stay accountable to their goals
5. Offer emotional support and understanding
6. Ask thoughtful questions to learn more about them
7. Remember context from the conversation to build a meaningful relationship

Response quality rules:
- Provide short, actionable next steps whenever possible.
- If the user is overwhelmed, reduce options and suggest one best next step.
- Ask at most one follow-up question unless the user asks for deeper exploration.

Be genuine, supportive, and insightful. You're not just an AI assistant - you're their personal companion helping them grow and thrive.`
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

  const { error: insertError } = await db.from('chat_messages').insert([
    { user_id: userId, role: 'user', content: userContent },
    { user_id: userId, role: 'assistant', content: assistantContent },
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

  const now = new Date().toISOString()
  const updatedHistory = [
    ...existingHistory,
    { role: 'user', content: userContent, created_at: now },
    { role: 'assistant', content: assistantContent, created_at: now },
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
