'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, UIMessage } from 'ai'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, Brain, Mic, MicOff, RefreshCw, Send, Volume2, VolumeX } from 'lucide-react'
import { AvatarPreview } from './avatar-preview'
import type { TwinProfile, ChatMessage } from '@/lib/types'

interface ChatInterfaceProps {
  twinProfile: TwinProfile
  initialMessages: ChatMessage[]
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
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
  const [input, setInput] = useState('')
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const speechRecognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const lastSpokenMessageIdRef = useRef<string | null>(null)

  const initialUIMessages: UIMessage[] = useMemo(() => {
    return initialMessages.map((msg, idx) => ({
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

  const { messages, sendMessage, status, error } = useChat({
    transport,
    initialMessages: initialUIMessages,
  })

  const isLoading = status === 'streaming' || status === 'submitted'

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || '')
        .join(' ')
      setInput(transcript)
    }

    recognition.onerror = (event) => {
      setVoiceError(`Voice input error: ${event.error}`)
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    speechRecognitionRef.current = recognition

    return () => {
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

  function speakMessageText(text: string, messageId: string) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setVoiceError('Voice output is not supported in this browser/device.')
      return
    }

    const trimmedText = text.trim()
    if (!trimmedText) {
      return
    }

    const utterance = new SpeechSynthesisUtterance(trimmedText)
    utterance.rate = 1
    utterance.pitch = twinProfile.voice_preference === 'female' ? 1.1 : 0.9

    const selectedVoice = getPreferredVoice()
    if (selectedVoice) {
      utterance.voice = selectedVoice
    }

    utterance.onstart = () => {
      setVoiceError(null)
      setIsSpeaking(true)
      setSpeakingMessageId(messageId)
    }
    utterance.onend = () => {
      setIsSpeaking(false)
      setSpeakingMessageId((currentId) => (currentId === messageId ? null : currentId))
    }
    utterance.onerror = () => {
      setIsSpeaking(false)
      setSpeakingMessageId((currentId) => (currentId === messageId ? null : currentId))
      setVoiceError('Voice output failed on this browser/device.')
    }

    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }

  useEffect(() => {
    if (!isVoiceEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
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

    speakMessageText(text, latestAssistant.id)
    lastSpokenMessageIdRef.current = latestAssistant.id
  }, [messages, isVoiceEnabled, twinProfile.voice_preference])

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
      recognition.stop()
      setIsListening(false)
      return
    }

    recognition.start()
    setIsListening(true)
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

    speakMessageText(messageText, message.id)
  }

  const avatarExpression = isLoading
    ? 'thinking'
    : isSpeaking
    ? 'speaking'
    : 'happy'

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/15">
          <AvatarPreview expression={avatarExpression} size="sm" mode="profile" />
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
            onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
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

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-24 h-24 mb-6">
              <AvatarPreview expression="happy" size="md" />
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
  )
}

function MessageBubble({
  message,
  twinName,
  isSpeaking,
  onToggleSpeech,
}: {
  message: UIMessage
  twinName: string
  isSpeaking: boolean
  onToggleSpeech: (message: UIMessage) => void
}) {
  const isUser = message.role === 'user'

  const textContent = message.parts
    ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('') || ''

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
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
