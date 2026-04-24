export interface Profile {
  id: string
  name: string | null
  email: string | null
  avatar_config: AvatarConfig
  created_at: string
  updated_at: string
}

export interface AvatarConfig {
  headColor?: string
  bodyColor?: string
  eyeColor?: string
  expression?: 'neutral' | 'happy' | 'thinking' | 'speaking'
}

export interface TwinProfile {
  id: string
  user_id: string
  name: string
  age: number | null
  goals: string[]
  personality_traits: string[]
  daily_habits: string[]
  interests: string[]
  ai_personality_model: AIPersonalityModel
  voice_preference: 'male' | 'female'
  created_at: string
  updated_at: string
}

export interface AIPersonalityModel {
  openness?: number
  conscientiousness?: number
  extraversion?: number
  agreeableness?: number
  neuroticism?: number
  communication_style?: 'formal' | 'casual' | 'encouraging' | 'direct'
  decision_making?: 'analytical' | 'intuitive' | 'collaborative' | 'decisive'
}

export interface MemoryLog {
  id: string
  user_id: string
  content: string
  log_type: 'daily' | 'reflection' | 'decision' | 'mood'
  sentiment: string | null
  processed: boolean
  created_at: string
}

export interface Insight {
  id: string
  user_id: string
  summary: string
  insight_type: 'behavior' | 'habit' | 'goal' | 'recommendation'
  data: Record<string, unknown>
  created_at: string
}

export interface ChatMessage {
  id: string
  user_id: string
  role: 'user' | 'assistant'
  content: string
  audio_url: string | null
  created_at: string
}

export interface OnboardingData {
  name: string
  age: number | null
  goals: string[]
  personality_traits: string[]
  daily_habits: string[]
  interests: string[]
  voice_preference: 'male' | 'female'
}
