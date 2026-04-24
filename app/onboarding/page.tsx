'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, ArrowRight, ArrowLeft, Sparkles, Check } from 'lucide-react'
import { AvatarPreview } from '@/components/avatar-preview'
import type { OnboardingData } from '@/lib/types'

const PERSONALITY_TRAITS = [
  'Analytical', 'Creative', 'Empathetic', 'Ambitious', 'Curious',
  'Organized', 'Spontaneous', 'Introverted', 'Extroverted', 'Patient',
  'Adventurous', 'Practical', 'Optimistic', 'Detail-oriented', 'Adaptable'
]

const INTERESTS = [
  'Technology', 'Art & Design', 'Music', 'Sports', 'Reading',
  'Travel', 'Cooking', 'Gaming', 'Nature', 'Science',
  'Business', 'Health & Fitness', 'Photography', 'Writing', 'Movies'
]

const HABITS = [
  'Morning exercise', 'Meditation', 'Journaling', 'Reading before bed',
  'Early riser', 'Night owl', 'Meal prepping', 'Daily walks',
  'Learning new skills', 'Social activities', 'Time blocking', 'Digital detox'
]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [data, setData] = useState<OnboardingData>({
    name: '',
    age: null,
    goals: [],
    personality_traits: [],
    daily_habits: [],
    interests: [],
    voice_preference: 'female',
  })

  const totalSteps = 5

  async function handleComplete() {
    const validationError = validateOnboardingData(data)
    if (validationError) {
      setFormError(validationError)
      return
    }

    setLoading(true)
    setFormError(null)
    const supabase = createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/auth/login')
      return
    }

    // Ensure the parent profile row exists before inserting twin_profiles.
    // Some users may have signed up before the DB trigger was created.
    const { error: profileUpsertError } = await supabase.from('profiles').upsert(
      {
        id: user.id,
        name: data.name || user.user_metadata?.name || null,
        email: user.email || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )

    if (profileUpsertError) {
      setFormError(`Profile setup failed: ${profileUpsertError.message}`)
      setLoading(false)
      return
    }

    const { error } = await supabase.from('twin_profiles').insert({
      user_id: user.id,
      name: data.name || user.user_metadata?.name || 'My Twin',
      age: data.age,
      goals: data.goals.slice(0, 20),
      personality_traits: data.personality_traits.slice(0, 10),
      daily_habits: data.daily_habits.slice(0, 20),
      interests: data.interests.slice(0, 10),
      voice_preference: data.voice_preference,
      ai_personality_model: {
        communication_style: 'encouraging',
        decision_making: 'collaborative',
      },
    })

    if (error) {
      console.error('Error creating twin profile:', error)
      setFormError(error.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  function handleNext() {
    if (step < totalSteps) {
      setFormError(null)
      setStep(step + 1)
    } else {
      handleComplete()
    }
  }

  function handleBack() {
    if (step > 1) {
      setStep(step - 1)
    }
  }

  function toggleArrayItem(array: string[], item: string, setter: (arr: string[]) => void) {
    if (array.includes(item)) {
      setter(array.filter((i) => i !== item))
    } else {
      setter([...array, item])
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Brain className="w-4 h-4 text-primary" />
          </div>
          <span className="brand-wordmark text-foreground text-2xl">
            Saathi
          </span>
        </div>
        <div className="flex items-center gap-2">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`w-8 h-1.5 rounded-full transition-colors ${
                i + 1 <= step ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-2xl">
          {formError && (
            <div className="mb-4 rounded-xl bg-destructive/10 text-destructive text-sm px-4 py-3">
              {formError}
            </div>
          )}
          <AnimatePresence mode="wait">
            {step === 1 && (
              <StepContainer key="step1">
                <div className="text-center mb-8">
                  <div className="w-32 h-32 mx-auto mb-6">
                    <AvatarPreview expression="happy" size="md" />
                  </div>
                  <h1 className="text-3xl font-bold text-foreground mb-3" style={{ fontFamily: 'var(--font-display)' }}>
                    Let&apos;s Create Your Twin
                  </h1>
                  <p className="text-muted-foreground">
                    First, tell us about yourself so your twin can understand you better.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      What should your twin call you?
                    </label>
                    <input
                      type="text"
                      value={data.name}
                      onChange={(e) => setData({ ...data, name: e.target.value })}
                      placeholder="Your name"
                      className="w-full px-4 py-3 rounded-xl bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      How old are you? (optional)
                    </label>
                    <input
                      type="number"
                      value={data.age || ''}
                      onChange={(e) => setData({ ...data, age: e.target.value ? parseInt(e.target.value) : null })}
                      placeholder="Age"
                      min={13}
                      max={120}
                      className="w-full px-4 py-3 rounded-xl bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
              </StepContainer>
            )}

            {step === 2 && (
              <StepContainer key="step2">
                <div className="text-center mb-8">
                  <h1 className="text-3xl font-bold text-foreground mb-3" style={{ fontFamily: 'var(--font-display)' }}>
                    Your Personality
                  </h1>
                  <p className="text-muted-foreground">
                    Select traits that describe you best. Choose as many as you like.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3 justify-center">
                  {PERSONALITY_TRAITS.map((trait) => (
                    <button
                      key={trait}
                      onClick={() => toggleArrayItem(data.personality_traits, trait, (arr) => setData({ ...data, personality_traits: arr }))}
                      className={`px-4 py-2 rounded-full border transition-all ${
                        data.personality_traits.includes(trait)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card border-border text-foreground hover:border-primary/50'
                      }`}
                    >
                      {data.personality_traits.includes(trait) && <Check className="w-4 h-4 inline mr-1" />}
                      {trait}
                    </button>
                  ))}
                </div>
              </StepContainer>
            )}

            {step === 3 && (
              <StepContainer key="step3">
                <div className="text-center mb-8">
                  <h1 className="text-3xl font-bold text-foreground mb-3" style={{ fontFamily: 'var(--font-display)' }}>
                    Your Interests
                  </h1>
                  <p className="text-muted-foreground">
                    What topics excite you? This helps your twin understand your world.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3 justify-center">
                  {INTERESTS.map((interest) => (
                    <button
                      key={interest}
                      onClick={() => toggleArrayItem(data.interests, interest, (arr) => setData({ ...data, interests: arr }))}
                      className={`px-4 py-2 rounded-full border transition-all ${
                        data.interests.includes(interest)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card border-border text-foreground hover:border-primary/50'
                      }`}
                    >
                      {data.interests.includes(interest) && <Check className="w-4 h-4 inline mr-1" />}
                      {interest}
                    </button>
                  ))}
                </div>
              </StepContainer>
            )}

            {step === 4 && (
              <StepContainer key="step4">
                <div className="text-center mb-8">
                  <h1 className="text-3xl font-bold text-foreground mb-3" style={{ fontFamily: 'var(--font-display)' }}>
                    Your Goals
                  </h1>
                  <p className="text-muted-foreground">
                    What are you working towards? Your twin will help you stay on track.
                  </p>
                </div>

                <GoalInput
                  goals={data.goals}
                  onChange={(goals) => setData({ ...data, goals })}
                />

                <div className="mt-6">
                  <p className="text-sm text-muted-foreground mb-3">Daily habits (optional)</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {HABITS.map((habit) => (
                      <button
                        key={habit}
                        onClick={() => toggleArrayItem(data.daily_habits, habit, (arr) => setData({ ...data, daily_habits: arr }))}
                        className={`px-3 py-1.5 rounded-lg border text-sm transition-all ${
                          data.daily_habits.includes(habit)
                            ? 'bg-accent/20 text-accent border-accent'
                            : 'bg-card border-border text-foreground hover:border-accent/50'
                        }`}
                      >
                        {habit}
                      </button>
                    ))}
                  </div>
                </div>
              </StepContainer>
            )}

            {step === 5 && (
              <StepContainer key="step5">
                <div className="text-center mb-8">
                  <h1 className="text-3xl font-bold text-foreground mb-3" style={{ fontFamily: 'var(--font-display)' }}>
                    Voice Preference
                  </h1>
                  <p className="text-muted-foreground">
                    Choose how your twin sounds when speaking to you.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                  <button
                    onClick={() => setData({ ...data, voice_preference: 'female' })}
                    className={`p-6 rounded-2xl border-2 transition-all ${
                      data.voice_preference === 'female'
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="text-2xl">👩</span>
                    </div>
                    <p className="font-medium text-foreground">Female Voice</p>
                    <p className="text-sm text-muted-foreground">Warm and empathetic</p>
                  </button>
                  <button
                    onClick={() => setData({ ...data, voice_preference: 'male' })}
                    className={`p-6 rounded-2xl border-2 transition-all ${
                      data.voice_preference === 'male'
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="text-2xl">👨</span>
                    </div>
                    <p className="font-medium text-foreground">Male Voice</p>
                    <p className="text-sm text-muted-foreground">Calm and supportive</p>
                  </button>
                </div>

                <div className="mt-8 text-center">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 text-accent">
                    <Sparkles className="w-4 h-4" />
                    Your twin is ready to meet you!
                  </div>
                </div>
              </StepContainer>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Footer Navigation */}
      <footer className="border-t border-border px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <button
            onClick={handleBack}
            disabled={step === 1}
            className="flex items-center gap-2 px-4 py-2 text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <button
            onClick={handleNext}
            disabled={loading || (step === 1 && !data.name)}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : step === totalSteps ? (
              <>
                <Sparkles className="w-4 h-4" />
                Create Twin
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </footer>
    </div>
  )
}

function validateOnboardingData(data: OnboardingData): string | null {
  if (!data.name.trim()) {
    return 'Please enter your name before creating your twin.'
  }

  if (data.name.trim().length > 80) {
    return 'Name should be 80 characters or less.'
  }

  if (data.age !== null && (data.age < 13 || data.age > 120)) {
    return 'Age must be between 13 and 120.'
  }

  if (data.goals.length > 20) {
    return 'Please keep goals to 20 or fewer.'
  }

  return null
}

function StepContainer({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  )
}

function GoalInput({ goals, onChange }: { goals: string[]; onChange: (goals: string[]) => void }) {
  const [input, setInput] = useState('')

  function addGoal() {
    if (input.trim() && !goals.includes(input.trim())) {
      onChange([...goals, input.trim()])
      setInput('')
    }
  }

  function removeGoal(goal: string) {
    onChange(goals.filter((g) => g !== goal))
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addGoal()}
          placeholder="Add a goal (e.g., Learn a new language)"
          className="flex-1 px-4 py-3 rounded-xl bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={addGoal}
          disabled={!input.trim()}
          className="px-4 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          Add
        </button>
      </div>
      {goals.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {goals.map((goal, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 text-primary"
            >
              <span className="text-sm">{goal}</span>
              <button
                onClick={() => removeGoal(goal)}
                className="w-4 h-4 rounded-full bg-primary/20 hover:bg-primary/30 flex items-center justify-center"
              >
                <span className="text-xs">×</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
