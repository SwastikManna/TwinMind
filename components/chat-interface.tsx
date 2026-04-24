'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, UIMessage } from 'ai'
import { motion, AnimatePresence } from 'framer-motion'
import { useSearchParams } from 'next/navigation'
import { AlertCircle, Brain, ChevronLeft, ChevronRight, Mic, MicOff, RefreshCw, Send, Volume2, VolumeX } from 'lucide-react'
import { AvatarPreview } from './avatar-preview'
import type { TwinProfile, ChatMessage } from '@/lib/types'

interface ChatInterfaceProps {
  twinProfile: TwinProfile
  initialMessages: ChatMessage[]
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

declare global {
  interface Window {
    webkitSpeechRecognition?: SpeechRecognitionConstructor
    SpeechRecognition?: SpeechRecognitionConstructor
  }
}

export function ChatInterface({ twinProfile, initialMessages }: ChatInterfaceProps) {
  const searchParams = useSearchParams()
  const [input, setInput] = useState('')
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false)
  const [isConversationMode, setIsConversationMode] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const [isSpriteCollapsed, setIsSpriteCollapsed] = useState(false)
  const [liveUserCaption, setLiveUserCaption] = useState('')
  const [liveAssistantCaption, setLiveAssistantCaption] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const conversationCaptionsEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const speechRecognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const conversationDraftRef = useRef('')
  const lastSpokenMessageIdRef = useRef<string | null>(null)
  const shouldKeepListeningRef = useRef(false)
  const deepLinkHandledRef = useRef(false)
  const isConversationModeRef = useRef(false)

  const initialUIMessages: UIMessage[] = useMemo(() => {
    const normalized = [...initialMessages].sort((a, b) => {
      const delta = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      if (delta !== 0) return delta
      if (a.role !== b.role) return a.role === 'user' ? -1 : 1
      return String(a.id).localeCompare(String(b.id))
    })

    return normalized.map((msg, idx) => ({
      id: msg.id || `initial-${idx}`,
      role: msg.role as 'user' | 'assistant',
      parts: [{ type: 'text' as const, text: msg.content }],
    }))
  }, [initialMessages])

  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    prepareSendMessagesRequest: ({ id, messages }) => ({
      body: {
        messages,
        id,
        twinProfile: {
          name: twinProfile.name,
          personality_traits: twinProfile.personality_traits,
          interests: twinProfile.interests,
          goals: twinProfile.goals,
          daily_habits: twinProfile.daily_habits,
          communication_style: twinProfile.ai_personality_model?.communication_style || 'encouraging',
        },
      },
    }),
  }), [twinProfile])

  const { messages, sendMessage, setMessages, status, error } = useChat({
    id: `twin-${twinProfile.id}`,
    transport,
    messages: initialUIMessages,
  })

  const isLoading = status === 'streaming' || status === 'submitted'
  
  useEffect(() => {
    isConversationModeRef.current = isConversationMode
  }, [isConversationMode])

  const hasDeepLink = Boolean(searchParams.get('messageId') || searchParams.get('messageAt'))

  useEffect(() => {
    if (hasDeepLink && !deepLinkHandledRef.current) return
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, hasDeepLink])

  useEffect(() => {
    if (initialUIMessages.length > 0 && messages.length === 0) {
      setMessages(initialUIMessages)
    }
  }, [initialUIMessages, messages.length, setMessages])

  const initialCreatedAtById = useMemo(() => {
    const map = new Map<string, string>()
    for (const msg of initialMessages) {
      if (msg.id) map.set(msg.id, msg.created_at)
    }
    return map
  }, [initialMessages])

  useEffect(() => {
    if (deepLinkHandledRef.current) return
    const targetId = searchParams.get('messageId')
    const targetAt = searchParams.get('messageAt')
    const targetRole = searchParams.get('messageRole')
    const targetText = (searchParams.get('messageText') || '').trim().toLowerCase()
    if (!targetId && !targetAt) return
    if (messages.length === 0) return

    let targetMessage: UIMessage | undefined
    if (targetId) {
      targetMessage = messages.find((message) => message.id === targetId)
    }

    if (!targetMessage && targetAt) {
      targetMessage = messages.find((message) => {
        const createdAt = initialCreatedAtById.get(message.id || '')
        if (!createdAt || createdAt !== targetAt) return false
        if (targetRole && message.role !== targetRole) return false
        if (targetText) {
          const text = extractMessageText(message).toLowerCase()
          return text.includes(targetText)
        }
        return true
      })
    }

    if (!targetMessage) return

    const element = document.getElementById(`chat-msg-${targetMessage.id}`)
    if (!element) return

    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightedMessageId(targetMessage.id)
    deepLinkHandledRef.current = true
    window.setTimeout(() => setHighlightedMessageId((current) => (current === targetMessage?.id ? null : current)), 2200)
  }, [messages, searchParams, initialCreatedAtById])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
      let finalTranscript = ''
      let interimTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i]?.[0]?.transcript || ''
        if (event.results[i]?.isFinal) {
          finalTranscript += `${transcript} `
        } else {
          interimTranscript += `${transcript} `
        }
      }

      const finalText = finalTranscript.trim()
      const interimText = interimTranscript.trim()

      if (isConversationModeRef.current) {
        if (finalText) {
          conversationDraftRef.current = `${conversationDraftRef.current} ${finalText}`.trim()
        }
        const caption = `${conversationDraftRef.current} ${interimText}`.trim()
        setLiveUserCaption(caption)
        return
      }

      const nextInput = `${finalText} ${interimText}`.trim()
      setInput(nextInput)
    }

    recognition.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setVoiceError(`Voice input error: ${event.error}`)
      }
      setIsListening(false)
      shouldKeepListeningRef.current = false
    }

    recognition.onend = () => {
      if (shouldKeepListeningRef.current) {
        try {
          recognition.start()
          return
        } catch {
          // Some browsers throw if restarted too quickly; let user retry manually.
        }
      }
      setIsListening(false)
    }

    speechRecognitionRef.current = recognition

    return () => {
      shouldKeepListeningRef.current = false
      recognition.stop()
    }
  }, [])

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  function extractMessageText(message: UIMessage) {
    return (
      message.parts
        ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('')
        .trim() || ''
    )
  }

  function stripMoodMarkers(text: string) {
    return text.replace(/\[\[mood:[a-z_]+\]\]/gi, '').trim()
  }

  function getMoodMarker(text: string) {
    const match = text.match(/\[\[mood:([a-z_]+)\]\]/i)
    return match?.[1]?.toLowerCase() || null
  }

  function getPreferredVoice() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return null
    }

    const availableVoices = window.speechSynthesis.getVoices()
    if (availableVoices.length === 0) {
      return null
    }

    const wanted = twinProfile.voice_preference === 'female'
      ? ['female', 'zira', 'samantha']
      : ['male', 'david', 'mark']

    return (
      availableVoices.find((voice) => {
        const name = voice.name.toLowerCase()
        return wanted.some((needle) => name.includes(needle))
      }) || null
    )
  }

  function stopSpeech() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return
    }

    window.speechSynthesis.cancel()
    setIsSpeaking(false)
    setSpeakingMessageId(null)
  }

  async function waitForVoices(maxWaitMs = 1200) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const synth = window.speechSynthesis
    const startedAt = Date.now()

    while (Date.now() - startedAt < maxWaitMs) {
      const voices = synth.getVoices()
      if (voices.length > 0) return
      await new Promise((resolve) => window.setTimeout(resolve, 80))
    }
  }

  function startListeningSession() {
    const recognition = speechRecognitionRef.current
    if (!recognition) {
      setVoiceError('Voice input is not supported in this browser.')
      return
    }

    try {
      if (isConversationModeRef.current) {
        conversationDraftRef.current = ''
        setLiveUserCaption('')
      }
      recognition.start()
      shouldKeepListeningRef.current = true
      setIsListening(true)
      setVoiceError(null)
    } catch {
      shouldKeepListeningRef.current = false
      setIsListening(false)
    }
  }

  function stopListeningSession() {
    const recognition = speechRecognitionRef.current
    if (!recognition) return
    shouldKeepListeningRef.current = false
    recognition.stop()
    setIsListening(false)
  }

  async function speakMessageText(
    text: string,
    messageId: string,
    source: 'auto' | 'manual' = 'auto',
    onDone?: () => void,
  ) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setVoiceError('Voice output is not supported in this browser/device.')
      return
    }

    const trimmedText = stripMoodMarkers(text.trim())
    if (!trimmedText) {
      return
    }

    // Some browsers (especially on first use) populate voices lazily.
    // Wait briefly so the first utterance uses the selected persona voice.
    await waitForVoices()

    const utterance = new SpeechSynthesisUtterance(trimmedText)
    utterance.rate = twinSpeechRate
    utterance.pitch = twinProfile.voice_preference === 'female' ? 1.1 : 0.9

    const selectedVoice = getPreferredVoice()
    if (selectedVoice) {
      utterance.voice = selectedVoice
    }

    utterance.onstart = () => {
      setVoiceError(null)
      setIsSpeaking(true)
      setSpeakingMessageId(messageId)
      if (isConversationModeRef.current) {
        setLiveAssistantCaption(trimmedText)
      }
    }
    utterance.onend = () => {
      setIsSpeaking(false)
      setSpeakingMessageId((currentId) => (currentId === messageId ? null : currentId))
      onDone?.()
    }
    utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      setIsSpeaking(false)
      setSpeakingMessageId((currentId) => (currentId === messageId ? null : currentId))
      const ignoredErrors = new Set(['interrupted', 'canceled'])
      if (!ignoredErrors.has(event.error) && source === 'manual') {
        setVoiceError('Voice output failed on this browser/device.')
      }
      onDone?.()
    }

    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }

  useEffect(() => {
    if (!isVoiceEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return
    }
    if (status !== 'ready') {
      return
    }

    const latestAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    if (!latestAssistant || latestAssistant.id === lastSpokenMessageIdRef.current) {
      return
    }

    const text = extractMessageText(latestAssistant)
    if (!text) {
      return
    }

    speakMessageText(text, latestAssistant.id, 'auto')
    lastSpokenMessageIdRef.current = latestAssistant.id
  }, [messages, isVoiceEnabled, twinProfile.voice_preference, status])

  useEffect(() => {
    if (!isConversationMode) return
    if (isLoading) {
      setLiveAssistantCaption('Thinking...')
    }
  }, [isConversationMode, isLoading])

  useEffect(() => {
    if (!isConversationMode) return
    conversationCaptionsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, liveUserCaption, liveAssistantCaption, isConversationMode])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    sendMessage({ text: input })
    setInput('')
  }

  function handleRetry() {
    if (isLoading) return

    const lastUser = [...messages].reverse().find((message) => message.role === 'user')
    const text = lastUser ? extractMessageText(lastUser) : ''

    if (text) {
      sendMessage({ text })
    }
  }

  function toggleListening() {
    const recognition = speechRecognitionRef.current
    if (!recognition) {
      setVoiceError('Voice input is not supported in this browser.')
      return
    }

    setVoiceError(null)
    if (isListening) {
      stopListeningSession()
      return
    }
    startListeningSession()
  }

  function finalizeConversationInput() {
    const recognition = speechRecognitionRef.current
    if (!recognition) {
      setVoiceError('Voice input is not supported in this browser.')
      return
    }

    if (isListening) {
      const text = liveUserCaption.trim()
      stopListeningSession()
      if (text) {
        conversationDraftRef.current = ''
        setInput('')
        sendMessage({ text })
      }
      return
    }

    if (!isLoading) {
      startListeningSession()
    }
  }

  function handleMessageSpeechToggle(message: UIMessage) {
    const messageText = extractMessageText(message)
    if (!messageText) {
      return
    }

    if (speakingMessageId === message.id) {
      stopSpeech()
      return
    }

    speakMessageText(messageText, message.id, 'manual')
  }

  function toggleConversationMode() {
    setIsConversationMode((current) => {
      const next = !current
      if (next) {
        setIsVoiceEnabled(true)
        setVoiceError(null)
        setLiveUserCaption('')
        conversationDraftRef.current = ''
        const welcomeText = 'Hey, what do you wanna talk about?'
        setLiveAssistantCaption(welcomeText)

        // Prevent auto-reading old assistant history when conversation mode opens.
        const latestAssistant = [...messages].reverse().find((message) => message.role === 'assistant')
        if (latestAssistant) {
          lastSpokenMessageIdRef.current = latestAssistant.id
        }

        speakMessageText(welcomeText, '__conversation-welcome__', 'manual')
      } else {
        stopListeningSession()
        conversationDraftRef.current = ''
        setLiveUserCaption('')
        setLiveAssistantCaption('')
      }
      return next
    })
  }

  const latestUserTextRaw = useMemo(() => {
    const lastUser = [...messages].reverse().find((message) => message.role === 'user')
    if (!lastUser) return ''
    return extractMessageText(lastUser)
  }, [messages])

  const latestAssistantTextRaw = useMemo(() => {
    const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant')
    return lastAssistant ? extractMessageText(lastAssistant) : ''
  }, [messages])

  const latestUserText = useMemo(() => latestUserTextRaw.toLowerCase(), [latestUserTextRaw])
  const latestAssistantText = useMemo(() => latestAssistantTextRaw.toLowerCase(), [latestAssistantTextRaw])

  const latestAssistantMoodMarker = useMemo(() => getMoodMarker(latestAssistantText), [latestAssistantText])

  const twinAvatarColors = useMemo(() => {
    const appearance = twinProfile.ai_personality_model?.avatar_appearance
    const headColor = /^#[0-9a-fA-F]{6}$/.test(appearance?.head_color || '')
      ? String(appearance?.head_color)
      : '#0d9488'
    const bodyColor = /^#[0-9a-fA-F]{6}$/.test(appearance?.body_color || '')
      ? String(appearance?.body_color)
      : '#0f766e'
    return { headColor, bodyColor }
  }, [twinProfile.ai_personality_model?.avatar_appearance])

  const twinSpeechRate = useMemo(() => {
    const value = twinProfile.ai_personality_model?.speech_rate
    if (typeof value !== 'number' || !Number.isFinite(value)) return 1
    return Math.min(1.3, Math.max(0.7, Number(value.toFixed(2))))
  }, [twinProfile.ai_personality_model?.speech_rate])

  const avatarExpression = useMemo(() => {
    if (error || voiceError) return 'shocked'
    if (isLoading) return 'thinking'
    if (isSpeaking) return 'talking'
    if (isListening) return 'neutral'

    const combinedContext = `${latestUserText} ${latestAssistantText}`
    const supportiveHealthContext =
      /father|mother|dad|mom|family|operation|surgery|hospital|recovery|recover|injury|health|pain/.test(
        combinedContext,
      )
    const reassuranceContext =
      /be okay|will be okay|be fine|will be fine|recover|recovery|stay strong|optimistic|positive|hopeful/.test(
        combinedContext,
      )
    const riskyChoiceContext =
      /watch(ing)?\s+a?\s*movie|netflix|reels|instagram|youtube|gaming|game|party|procrastinat|skip|later/.test(
        latestUserText,
      )

    const userWantsHappy =
      /(?:be|stay|look|act)\s+happy/.test(latestUserText) ||
      /(?:be|stay)\s+calm/.test(latestUserText) ||
      /smile|cheer up/.test(latestUserText) ||
      /don't be angry|dont be angry|don't be sad|dont be sad/.test(latestUserText)
    if (userWantsHappy) return 'happy'

    if (supportiveHealthContext && reassuranceContext) return 'happy'
    if (supportiveHealthContext) return 'sad'

    if (latestAssistantMoodMarker === 'dissatisfied' && riskyChoiceContext) return 'angry'

    const assistantAngryKeywords = ['angry', 'mad', 'annoyed', 'furious', 'hate', 'irritated']
    if (assistantAngryKeywords.some((keyword) => latestAssistantText.includes(keyword))) {
      return 'angry'
    }

    const sadKeywords = ['sad', 'down', 'stressed', 'stress', 'anxious', 'upset', 'lonely', 'tired']
    if (sadKeywords.some((keyword) => latestUserText.includes(keyword))) {
      return 'sad'
    }

    const shockKeywords = ['what', 'really', 'omg', 'wow', 'shocked', 'surprised']
    if (shockKeywords.some((keyword) => latestUserText.includes(keyword))) {
      return 'shocked'
    }

    return 'happy'
  }, [
    error,
    voiceError,
    isLoading,
    isSpeaking,
    isVoiceEnabled,
    isListening,
    latestUserText,
    latestAssistantText,
    latestAssistantMoodMarker,
  ])

  const emotionMeta = useMemo(() => {
    if (avatarExpression === 'thinking') {
      return { emotion: 'Thinking', intensity: 'Moderate', note: 'Processing your context' }
    }
    if (avatarExpression === 'talking' || avatarExpression === 'speaking') {
      return { emotion: 'Speaking', intensity: 'Moderate', note: 'Responding in voice mode' }
    }
    if (avatarExpression === 'angry') {
      if (latestAssistantMoodMarker === 'dissatisfied') {
        return {
          emotion: 'Disappointed',
          intensity: inferEmotionIntensity({
            expression: 'angry',
            userText: latestUserTextRaw,
            assistantText: latestAssistantTextRaw,
            assistantMoodMarker: latestAssistantMoodMarker,
          }),
          note: 'Pushing for better choices',
        }
      }
      return {
        emotion: 'Angry',
        intensity: inferEmotionIntensity({
          expression: 'angry',
          userText: latestUserTextRaw,
          assistantText: latestAssistantTextRaw,
          assistantMoodMarker: latestAssistantMoodMarker,
        }),
        note: 'Strong emotional response detected',
      }
    }
    if (avatarExpression === 'sad') {
      return {
        emotion: 'Sad',
        intensity: inferEmotionIntensity({
          expression: 'sad',
          userText: latestUserTextRaw,
          assistantText: latestAssistantTextRaw,
        }),
        note: 'Listening with empathy',
      }
    }
    if (avatarExpression === 'shocked') {
      return {
        emotion: 'Surprised',
        intensity: inferEmotionIntensity({
          expression: 'shocked',
          userText: latestUserTextRaw,
          assistantText: latestAssistantTextRaw,
        }),
        note: 'Unexpected moment detected',
      }
    }
    if (avatarExpression === 'happy') {
      return {
        emotion: 'Happy',
        intensity: inferEmotionIntensity({
          expression: 'happy',
          userText: latestUserTextRaw,
          assistantText: latestAssistantTextRaw,
        }),
        note: 'Ready to chat',
      }
    }
    return { emotion: 'Happy', intensity: 'Mild', note: 'Ready to chat' }
  }, [avatarExpression, latestAssistantMoodMarker, latestAssistantTextRaw, latestUserTextRaw])

  const spriteStatusLabel = useMemo(() => {
    return `${emotionMeta.emotion} - ${emotionMeta.intensity}`
  }, [emotionMeta])

  return (
    <div className="chat-pattern-bg flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/15">
          <AvatarPreview
            expression={avatarExpression}
            size="sm"
            mode="profile"
            headColor={twinAvatarColors.headColor}
            bodyColor={twinAvatarColors.bodyColor}
          />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
            {twinProfile.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? 'Thinking...' : 'Your digital twin'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleConversationMode}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isConversationMode
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-foreground hover:bg-muted/80'
            }`}
            title={isConversationMode ? 'Exit full conversation mode' : 'Enter full conversation mode'}
          >
            {isConversationMode ? 'Exit Conversation' : 'Full Conversation'}
          </button>
          <button
            onClick={() => {
              const next = !isVoiceEnabled
              if (!next && isConversationMode) {
                setVoiceError('Voice output stays on during Full Conversation mode.')
                return
              }
              setIsVoiceEnabled(next)
              if (!next) {
                stopSpeech()
              }
              setVoiceError(null)
            }}
            className={`p-2 rounded-lg transition-colors ${
              isVoiceEnabled
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted'
            }`}
            title={isVoiceEnabled ? 'Mute voice output' : 'Enable voice output'}
          >
            {isVoiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {isConversationMode ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <section className="flex w-full md:w-1/2 items-center justify-center bg-card/40 border-b md:border-b-0 md:border-r border-border p-6">
              <div className="w-full max-w-xl rounded-3xl border border-border bg-card/80 p-5 md:p-8">
                <div className="mx-auto flex h-[42vh] max-h-[480px] min-h-[260px] items-center justify-center rounded-3xl bg-background/80 ring-1 ring-primary/20">
                  <div className="h-[75%] w-[75%] max-h-[360px] max-w-[360px]">
                     <AvatarPreview expression={avatarExpression} size="lg" headColor={twinAvatarColors.headColor} bodyColor={twinAvatarColors.bodyColor} />
                  </div>
                </div>
                <div className="mt-4 text-center">
                  <h3 className="text-lg font-semibold text-foreground">{twinProfile.name}</h3>
                  <p className="mt-1 inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    {spriteStatusLabel}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">{emotionMeta.note}</p>
                </div>
              </div>
            </section>

            <section className="flex w-full md:w-1/2 flex-col min-h-0 bg-background">
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-semibold text-foreground">Live Captions</p>
                <p className="text-xs text-muted-foreground">Speech updates appear here in real time.</p>
              </div>

              <div className="space-y-3 border-b border-border px-4 py-4">
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">You</p>
                  <p className="mt-1 text-sm text-foreground">{liveUserCaption || (isListening ? 'Listening...' : 'Speak to begin')}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{twinProfile.name}</p>
                  <p className="mt-1 text-sm text-foreground">{liveAssistantCaption || (isLoading ? 'Thinking...' : 'Ready')}</p>
                </div>
                {voiceError && (
                  <div className="rounded-xl bg-amber-100 text-amber-900 px-3 py-2 text-xs">
                    {voiceError}
                  </div>
                )}
                {error && (
                  <div className="rounded-xl bg-destructive/10 text-destructive px-3 py-2 text-xs">
                    {error.message || 'Something went wrong during conversation mode.'}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-xl border px-3 py-2 text-sm ${
                      message.role === 'user'
                        ? 'border-primary/20 bg-primary/10 text-foreground'
                        : 'border-border bg-card text-foreground'
                    }`}
                  >
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                      {message.role === 'user' ? 'You' : twinProfile.name}
                    </p>
                    <p className="whitespace-pre-wrap">
                      {message.parts
                        ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
                        .map((p) => p.text)
                        .join('') || ''}
                    </p>
                  </div>
                ))}
                <div ref={conversationCaptionsEndRef} />
              </div>
            </section>
          </div>

          <div className="border-t border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={finalizeConversationInput}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl transition-colors ${
                  isListening
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground hover:bg-muted/80'
                }`}
                title={isListening ? 'Stop mic and send your message' : 'Start listening'}
              >
                {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                {isListening ? 'Stop & Send' : 'Start Mic'}
              </button>

              <button
                type="button"
                onClick={toggleConversationMode}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/15"
              >
                Exit Full Conversation
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
        <SpriteDock
          collapsed={isSpriteCollapsed}
          onToggleCollapse={() => setIsSpriteCollapsed((current) => !current)}
          expression={avatarExpression}
          statusLabel={spriteStatusLabel}
          twinName={twinProfile.name}
          headColor={twinAvatarColors.headColor}
          bodyColor={twinAvatarColors.bodyColor}
        />

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
              <div className="rounded-2xl border border-border bg-card/60 p-3 lg:hidden">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-background/70 ring-1 ring-primary/20 flex items-center justify-center">
                    <AvatarPreview expression={avatarExpression} size="sm" headColor={twinAvatarColors.headColor} bodyColor={twinAvatarColors.bodyColor} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{twinProfile.name}</p>
                    <p className="text-xs text-muted-foreground">{spriteStatusLabel}</p>
                  </div>
                </div>
              </div>

              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="w-24 h-24 mb-6">
                    <AvatarPreview expression="happy" size="md" headColor={twinAvatarColors.headColor} bodyColor={twinAvatarColors.bodyColor} />
                  </div>
                  <h2 className="text-xl font-semibold text-foreground mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                    Hi, I&apos;m {twinProfile.name}!
                  </h2>
                  <p className="text-muted-foreground max-w-md">
                    I&apos;m your digital twin, here to help you reflect, make decisions, and grow.
                    What&apos;s on your mind today?
                  </p>
                  <div className="mt-6 flex flex-wrap gap-2 justify-center">
                    {['How are you feeling?', 'Tell me about my goals', 'I need advice'].map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => {
                          setInput(suggestion)
                          inputRef.current?.focus()
                        }}
                        className="px-4 py-2 rounded-full bg-primary/10 text-primary text-sm hover:bg-primary/20 transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <AnimatePresence initial={false}>
                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    twinName={twinProfile.name}
                    isSpeaking={speakingMessageId === message.id}
                    isHighlighted={highlightedMessageId === message.id}
                    onToggleSpeech={handleMessageSpeechToggle}
                  />
                ))}
              </AnimatePresence>

              {error && (
                <div className="p-4 rounded-xl bg-destructive/10 text-destructive text-sm flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5" />
                    <p>{error.message || 'Something went wrong. Please try again.'}</p>
                  </div>
                  <button
                    onClick={handleRetry}
                    className="inline-flex items-center gap-1 text-destructive hover:underline"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Retry
                  </button>
                </div>
              )}

              {voiceError && (
                <div className="p-3 rounded-xl bg-amber-100 text-amber-900 text-sm">
                  {voiceError}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-border bg-card p-4">
              <form onSubmit={handleSubmit} className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`p-3 rounded-xl transition-colors ${
                    isListening
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                  title={isListening ? 'Stop listening' : 'Start voice input'}
                >
                  {isListening ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </button>

                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type a message..."
                  disabled={isLoading}
                  className="flex-1 px-4 py-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                />

                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="p-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

type EmotionExpression = 'happy' | 'sad' | 'angry' | 'shocked'
type EmotionIntensity = 'Mild' | 'Moderate' | 'High'

function inferEmotionIntensity({
  expression,
  userText,
  assistantText,
  assistantMoodMarker,
}: {
  expression: EmotionExpression
  userText: string
  assistantText: string
  assistantMoodMarker?: string | null
}): EmotionIntensity {
  const user = userText.toLowerCase()
  const assistant = assistantText.toLowerCase()
  const combined = `${user} ${assistant}`
  let score = 0

  if (/(.)\1{2,}/.test(userText) || /(.)\1{2,}/.test(assistantText)) score += 1
  if ((userText.match(/!/g)?.length || 0) >= 2 || (assistantText.match(/!/g)?.length || 0) >= 2) score += 1
  if (/\b[A-Z]{4,}\b/.test(userText) || /\b[A-Z]{4,}\b/.test(assistantText)) score += 1
  if (/\b(very|really|so|super|extremely|insanely|hugely)\b/.test(combined)) score += 1

  if (expression === 'happy') {
    if (/\b(won|winner|victory|achieved|selected|ranked|promotion|topper|olympiad|hackathon|medal|congratulations)\b/.test(combined)) score += 3
    if (/\b(happy|excited|thrilled|grateful|proud|amazing|awesome|fantastic|celebrate)\b/.test(combined)) score += 2
    if (score >= 5) return 'High'
    if (score >= 3) return 'Moderate'
    return 'Mild'
  }

  if (expression === 'sad') {
    if (/\b(devastated|heartbroken|depressed|crying|hopeless|burnt out|burned out)\b/.test(combined)) score += 3
    if (/\b(sad|down|low|stressed|anxious|upset|tired)\b/.test(combined)) score += 2
    if (score >= 5) return 'High'
    if (score >= 3) return 'Moderate'
    return 'Mild'
  }

  if (expression === 'angry') {
    if (assistantMoodMarker === 'dissatisfied') score += 2
    if (/\b(angry|furious|mad|annoyed|irritated|frustrated|unacceptable)\b/.test(combined)) score += 2
    if (score >= 5) return 'High'
    if (score >= 3) return 'Moderate'
    return 'Mild'
  }

  if (/\b(shocked|surprised|omg|what|no way|unexpected)\b/.test(combined)) score += 2
  if (score >= 5) return 'High'
  if (score >= 3) return 'Moderate'
  return 'Mild'
}

function SpriteDock({
  collapsed,
  onToggleCollapse,
  expression,
  statusLabel,
  twinName,
  headColor,
  bodyColor,
}: {
  collapsed: boolean
  onToggleCollapse: () => void
  expression: 'neutral' | 'happy' | 'thinking' | 'speaking' | 'talking' | 'shocked' | 'sad' | 'angry'
  statusLabel: string
  twinName: string
  headColor: string
  bodyColor: string
}) {
  return (
    <aside
      className={`hidden border-r border-border bg-card/70 px-3 py-4 transition-all duration-300 lg:flex lg:flex-col ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      <div className={`mb-4 flex ${collapsed ? 'justify-center' : 'justify-end'}`}>
        <button
          onClick={onToggleCollapse}
          className="rounded-lg border border-border bg-background p-2 text-muted-foreground hover:text-foreground"
          aria-label={collapsed ? 'Expand twin sprite panel' : 'Collapse twin sprite panel'}
          title={collapsed ? 'Expand sprite' : 'Collapse sprite'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <div className={`flex flex-1 flex-col items-center ${collapsed ? 'gap-4' : 'gap-6'}`}>
        <motion.div
          key={expression}
          initial={{ opacity: 0.85, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25 }}
          className={`${collapsed ? 'w-14 h-14' : 'w-40 h-40'} rounded-3xl bg-background/70 ring-1 ring-primary/20 flex items-center justify-center`}
        >
          <AvatarPreview expression={expression} size={collapsed ? 'sm' : 'lg'} headColor={headColor} bodyColor={bodyColor} />
        </motion.div>

        {!collapsed && (
        <div className="w-full rounded-2xl border border-border bg-background/70 p-3 text-center">
            <p className="text-sm font-semibold text-foreground">{twinName}</p>
            <p className="mt-1 inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
              {statusLabel}
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}

function MessageBubble({
  message,
  twinName,
  isSpeaking,
  isHighlighted,
  onToggleSpeech,
}: {
  message: UIMessage
  twinName: string
  isSpeaking: boolean
  isHighlighted: boolean
  onToggleSpeech: (message: UIMessage) => void
}) {
  const isUser = message.role === 'user'

  const textContent = message.parts
    ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('')
    .replace(/\[\[mood:[a-z_]+\]\]/gi, '')
    .trim() || ''

  return (
    <motion.div
      id={`chat-msg-${message.id}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${isHighlighted ? 'ring-2 ring-primary/40 rounded-2xl' : ''}`}
    >
      <div className={`flex items-start gap-3 max-w-[85%] ${isUser ? 'flex-row-reverse' : ''}`}>
        {!isUser && (
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Brain className="w-4 h-4 text-primary" />
          </div>
        )}
        <div
          className={`px-4 py-3 rounded-2xl ${
            isUser
              ? 'bg-primary text-primary-foreground rounded-br-md'
              : 'bg-card border border-border text-foreground rounded-bl-md'
          }`}
        >
          {!isUser && (
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs text-primary font-medium">{twinName}</p>
              <button
                type="button"
                onClick={() => onToggleSpeech(message)}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
                  isSpeaking
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
                }`}
                title={isSpeaking ? 'Stop reading aloud' : 'Read this message aloud'}
              >
                {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                {isSpeaking ? 'Stop audio' : 'Read aloud'}
              </button>
            </div>
          )}
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{textContent}</p>
        </div>
      </div>
    </motion.div>
  )
}
