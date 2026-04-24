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
  profile_image_url?: string
  phone_number?: string
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
  speech_rate?: number
  avatar_appearance?: {
    head_color?: string
    body_color?: string
  }
  mood_tracker_entries?: Array<{
    id: string
    source: 'checkin' | 'chat'
    reflection: string
    happiness: number
    stress: number
    created_at: string
  }>
  goal_coach_plan?: {
    focus_goal: string
    weekly_tasks: Array<{
      day: string
      task: string
      why: string
    }>
    risk: string
    win_condition: string
    generated_at?: string
  }
  chat_history?: Array<{
    id?: string
    role: 'user' | 'assistant'
    content: string
    created_at: string
  }>
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
