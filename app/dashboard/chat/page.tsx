import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ChatInterface } from '@/components/chat-interface'
import type { TwinProfile, ChatMessage } from '@/lib/types'

export default async function ChatPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Fetch twin profile
  const { data: twinProfile } = await supabase
    .from('twin_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single() as { data: TwinProfile | null }

  if (!twinProfile) {
    redirect('/onboarding')
  }

  // Fetch recent chat messages (primary storage). Use admin client to avoid
  // missing RLS policy issues while still scoping by authenticated user id.
  let db = supabase
  try {
    db = createAdminClient() as unknown as typeof supabase
  } catch {
    // Fall back to user-scoped client if service role is unavailable.
  }

  const { data: recentMessages, error: recentMessagesError } = await db
    .from('chat_messages')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20) as { data: ChatMessage[] | null }

  let messages = normalizeMessageOrder(recentMessages || [])

  // Fallback: read from twin profile JSON when chat_messages table is unavailable.
  if ((recentMessagesError || messages.length === 0) && twinProfile.ai_personality_model) {
    const modelData = twinProfile.ai_personality_model as Record<string, unknown>
    const history = Array.isArray(modelData.chat_history)
      ? (modelData.chat_history as Array<Record<string, unknown>>)
      : []

    if (history.length > 0) {
      messages = history.slice(-20).map((entry, idx) => ({
        id: String(entry.id || `fallback-${idx}`),
        user_id: user.id,
        role: entry.role === 'assistant' ? 'assistant' : 'user',
        content: String(entry.content || ''),
        audio_url: null,
        created_at: String(entry.created_at || new Date().toISOString()),
      }))
    }
  }

  return (
    <div className="h-[calc(100vh-4rem)] lg:h-[calc(100vh-2rem)] pt-20 lg:pt-6">
      <ChatInterface 
        twinProfile={twinProfile}
        initialMessages={messages}
      />
    </div>
  )
}

function normalizeMessageOrder(messages: ChatMessage[]) {
  return [...messages].sort((a, b) => {
    const timeDelta = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    if (timeDelta !== 0) return timeDelta

    // If two rows have identical timestamps, enforce user before assistant.
    if (a.role !== b.role) {
      if (a.role === 'user') return -1
      if (b.role === 'user') return 1
    }

    return String(a.id).localeCompare(String(b.id))
  })
}
