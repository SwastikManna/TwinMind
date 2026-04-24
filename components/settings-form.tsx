'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Settings, User, Brain, Volume2, Save, Check } from 'lucide-react'
import type { Profile, TwinProfile } from '@/lib/types'

interface SettingsFormProps {
  profile: Profile | null
  twinProfile: TwinProfile
  userEmail: string
}

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

export function SettingsForm({ profile, twinProfile, userEmail }: SettingsFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    name: profile?.name || '',
    twinName: twinProfile.name,
    age: twinProfile.age || '',
    voicePreference: twinProfile.voice_preference,
    communicationStyle: twinProfile.ai_personality_model?.communication_style || 'encouraging',
    decisionMakingStyle: twinProfile.ai_personality_model?.decision_making || 'collaborative',
    personalityTraits: twinProfile.personality_traits,
    interests: twinProfile.interests,
  })

  async function handleSave() {
    const supabase = createClient()
    setSaveError(null)

    // Update profile
    if (profile) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          name: formData.name,
          updated_at: new Date().toISOString() 
        })
        .eq('id', profile.id)

      if (profileError) {
        setSaveError(profileError.message)
        return
      }
    }

    // Update twin profile
    const { error: twinError } = await supabase
      .from('twin_profiles')
      .update({
        name: formData.twinName,
        age: formData.age ? parseInt(formData.age.toString()) : null,
        voice_preference: formData.voicePreference,
        ai_personality_model: {
          ...twinProfile.ai_personality_model,
          communication_style: formData.communicationStyle,
          decision_making: formData.decisionMakingStyle,
        },
        personality_traits: formData.personalityTraits,
        interests: formData.interests,
        updated_at: new Date().toISOString(),
      })
      .eq('id', twinProfile.id)

    if (twinError) {
      setSaveError(twinError.message)
      return
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    startTransition(() => router.refresh())
  }

  function toggleArrayItem(key: 'personalityTraits' | 'interests', item: string) {
    const current = formData[key]
    if (current.includes(item)) {
      setFormData({ ...formData, [key]: current.filter(i => i !== item) })
    } else {
      setFormData({ ...formData, [key]: [...current, item] })
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
          Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Customize your profile and twin preferences
        </p>
      </div>

      {/* Account Settings */}
      <section className="bg-card rounded-2xl border border-border p-6">
        <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-primary" />
          Account
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Your Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-3 rounded-xl bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Email
            </label>
            <input
              type="email"
              value={userEmail}
              disabled
              className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-muted-foreground"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Email cannot be changed
            </p>
          </div>
        </div>
      </section>

      {/* Twin Settings */}
      <section className="bg-card rounded-2xl border border-border p-6">
        <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          Twin Profile
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Twin&apos;s Name
            </label>
            <input
              type="text"
              value={formData.twinName}
              onChange={(e) => setFormData({ ...formData, twinName: e.target.value })}
              className="w-full px-4 py-3 rounded-xl bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Your Age
            </label>
            <input
              type="number"
              value={formData.age}
              onChange={(e) => setFormData({ ...formData, age: e.target.value })}
              min={13}
              max={120}
              className="w-full px-4 py-3 rounded-xl bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      </section>

      {/* Voice Settings */}
      <section className="bg-card rounded-2xl border border-border p-6">
        <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Volume2 className="w-5 h-5 text-primary" />
          Voice Preference
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => setFormData({ ...formData, voicePreference: 'female' })}
            className={`p-4 rounded-xl border-2 transition-all ${
              formData.voicePreference === 'female'
                ? 'border-primary bg-primary/10'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <p className="font-medium text-foreground">Female Voice</p>
            <p className="text-sm text-muted-foreground">Warm and empathetic</p>
          </button>
          <button
            onClick={() => setFormData({ ...formData, voicePreference: 'male' })}
            className={`p-4 rounded-xl border-2 transition-all ${
              formData.voicePreference === 'male'
                ? 'border-primary bg-primary/10'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <p className="font-medium text-foreground">Male Voice</p>
            <p className="text-sm text-muted-foreground">Calm and supportive</p>
          </button>
        </div>
      </section>

      {/* AI Style Settings */}
      <section className="bg-card rounded-2xl border border-border p-6">
        <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          AI Communication Style
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              How your twin talks to you
            </label>
            <select
              value={formData.communicationStyle}
              onChange={(e) => setFormData({ ...formData, communicationStyle: e.target.value as 'formal' | 'casual' | 'encouraging' | 'direct' })}
              className="w-full px-4 py-3 rounded-xl bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="encouraging">Encouraging</option>
              <option value="casual">Casual</option>
              <option value="formal">Formal</option>
              <option value="direct">Direct</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Decision coaching style
            </label>
            <select
              value={formData.decisionMakingStyle}
              onChange={(e) => setFormData({ ...formData, decisionMakingStyle: e.target.value as 'analytical' | 'intuitive' | 'collaborative' | 'decisive' })}
              className="w-full px-4 py-3 rounded-xl bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="collaborative">Collaborative</option>
              <option value="analytical">Analytical</option>
              <option value="intuitive">Intuitive</option>
              <option value="decisive">Decisive</option>
            </select>
          </div>
        </div>
      </section>

      {/* Personality Traits */}
      <section className="bg-card rounded-2xl border border-border p-6">
        <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" />
          Personality Traits
        </h2>
        <div className="flex flex-wrap gap-2">
          {PERSONALITY_TRAITS.map((trait) => (
            <button
              key={trait}
              onClick={() => toggleArrayItem('personalityTraits', trait)}
              className={`px-4 py-2 rounded-full border transition-all ${
                formData.personalityTraits.includes(trait)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-foreground hover:border-primary/50'
              }`}
            >
              {formData.personalityTraits.includes(trait) && <Check className="w-4 h-4 inline mr-1" />}
              {trait}
            </button>
          ))}
        </div>
      </section>

      {/* Interests */}
      <section className="bg-card rounded-2xl border border-border p-6">
        <h2 className="font-semibold text-foreground mb-4">
          Interests
        </h2>
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map((interest) => (
            <button
              key={interest}
              onClick={() => toggleArrayItem('interests', interest)}
              className={`px-4 py-2 rounded-full border transition-all ${
                formData.interests.includes(interest)
                  ? 'bg-accent text-accent-foreground border-accent'
                  : 'bg-card border-border text-foreground hover:border-accent/50'
              }`}
            >
              {formData.interests.includes(interest) && <Check className="w-4 h-4 inline mr-1" />}
              {interest}
            </button>
          ))}
        </div>
      </section>

      {/* Save Button */}
      <div className="flex justify-end">
        {saveError && (
          <div className="mr-auto rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2">
            {saveError}
          </div>
        )}
        <button
          onClick={handleSave}
          disabled={isPending}
          className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saved ? (
            <>
              <Check className="w-5 h-5" />
              Saved!
            </>
          ) : isPending ? (
            <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
          ) : (
            <>
              <Save className="w-5 h-5" />
              Save Changes
            </>
          )}
        </button>
      </div>
    </div>
  )
}
