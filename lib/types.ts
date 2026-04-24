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
  preferences?: {
    global_notifications_enabled?: boolean
  }
  avatar_appearance?: {
    head_color?: string
    body_color?: string
  }
  calendar_events?: CalendarEvent[]
  mood_tracker_entries?: Array<{
    id: string
    source: 'checkin' | 'chat' | 'backfill'
    reflection: string
    happiness: number
    stress: number
    created_at: string
  }>
  behavior_points_history?: Array<{
    id: string
    type: 'study_near_event' | 'prepared_for_event' | 'healthy_break' | 'focused_choice' | 'risky_choice'
    points: number
    note: string
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

export type CalendarEventTag =
  | 'casual'
  | 'important'
  | 'super_important'
  | 'health'
  | 'study'
  | 'work'
  | 'social'

export type CalendarEventPriority = 'low' | 'medium' | 'high' | 'critical'
export type CalendarEventRecurrence = 'none' | 'daily' | 'weekly' | 'monthly'

export interface CalendarEvent {
  id: string
  user_id: string
  title: string
  starts_at: string
  ends_at: string
  tag: CalendarEventTag
  priority: CalendarEventPriority
  reminder_minutes: number
  recurrence: CalendarEventRecurrence
  location: string | null
  notes: string | null
  completed: boolean
  created_at: string
  updated_at: string
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
