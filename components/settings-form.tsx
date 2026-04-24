'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BellRing, Brain, Check, ChevronDown, ChevronUp, LogOut, RotateCcw, Save, Settings, Sparkles, Upload, User, Volume2, X } from 'lucide-react'
import { AvatarPreview } from '@/components/avatar-preview'
import { DashboardPageHeader, DashboardSection } from '@/components/dashboard-shell'
import type { AvatarHeadShape, Profile, TwinProfile } from '@/lib/types'

interface SettingsFormProps {
  profile: Profile | null
  twinProfile: TwinProfile
  userEmail: string
}

const PERSONALITY_TRAITS = [
  'Analytical', 'Creative', 'Empathetic', 'Ambitious', 'Curious',
  'Organized', 'Spontaneous', 'Introverted', 'Extroverted', 'Patient',
  'Adventurous', 'Practical', 'Optimistic', 'Detail-oriented', 'Adaptable',
]

const INTERESTS = [
  'Technology', 'Art & Design', 'Music', 'Sports', 'Reading',
  'Travel', 'Cooking', 'Gaming', 'Nature', 'Science',
  'Business', 'Health & Fitness', 'Photography', 'Writing', 'Movies',
]

const TWIN_COLOR_PRESETS = [
  { name: 'Teal', head: '#0d9488', body: '#0f766e' },
  { name: 'Sky', head: '#0284c7', body: '#0369a1' },
  { name: 'Violet', head: '#7c3aed', body: '#6d28d9' },
  { name: 'Rose', head: '#e11d48', body: '#be123c' },
  { name: 'Sunset', head: '#f97316', body: '#ea580c' },
  { name: 'Mint', head: '#10b981', body: '#059669' },
]

const HEAD_SHAPES: Array<{ value: AvatarHeadShape; label: string }> = [
  { value: 'circle', label: 'Circle' },
  { value: 'square', label: 'Square' },
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'cylinder', label: 'Cylinder' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'pentagon', label: 'Pentagon' },
  { value: 'star', label: 'Star' },
]

type Pan = { x: number; y: number }

export function SettingsForm({ profile, twinProfile, userEmail }: SettingsFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragStateRef = useRef<{ active: boolean; startX: number; startY: number; panStartX: number; panStartY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    panStartX: 0,
    panStartY: 0,
  })

  const avatarConfig =
    profile?.avatar_config && typeof profile.avatar_config === 'object'
      ? (profile.avatar_config as Record<string, unknown>)
      : {}

  const initialProfileData = useMemo(
    () => ({
      name: profile?.name || '',
      phoneNumber: String(avatarConfig.phone_number || ''),
      profileImageUrl: String(avatarConfig.profile_image_url || ''),
      personalityTraits: twinProfile.personality_traits || [],
      interests: twinProfile.interests || [],
    }),
    [profile?.name, avatarConfig.phone_number, avatarConfig.profile_image_url, twinProfile.personality_traits, twinProfile.interests],
  )

  const initialTwinData = useMemo(
    () => ({
      twinName: twinProfile.name,
      age: twinProfile.age || '',
      voicePreference: twinProfile.voice_preference,
      communicationStyle: twinProfile.ai_personality_model?.communication_style || 'encouraging',
      decisionMakingStyle: twinProfile.ai_personality_model?.decision_making || 'collaborative',
      speechRate:
        typeof twinProfile.ai_personality_model?.speech_rate === 'number'
          ? String(clampSpeechRate(twinProfile.ai_personality_model.speech_rate))
          : '1',
      notificationsEnabled:
        twinProfile.ai_personality_model?.preferences?.global_notifications_enabled !== false,
      voiceTone: twinProfile.ai_personality_model?.voice_tone || 'warm',
      headColor: twinProfile.ai_personality_model?.avatar_appearance?.head_color || '#0d9488',
      bodyColor: twinProfile.ai_personality_model?.avatar_appearance?.body_color || '#0f766e',
      headShape: normalizeHeadShape(twinProfile.ai_personality_model?.avatar_appearance?.head_shape),
      goalsText: (twinProfile.goals || []).join('\n'),
      habitsText: (twinProfile.daily_habits || []).join('\n'),
    }),
    [
      twinProfile.name,
      twinProfile.age,
      twinProfile.voice_preference,
      twinProfile.ai_personality_model?.communication_style,
      twinProfile.ai_personality_model?.decision_making,
      twinProfile.ai_personality_model?.speech_rate,
      twinProfile.ai_personality_model?.preferences?.global_notifications_enabled,
      twinProfile.ai_personality_model?.voice_tone,
      twinProfile.ai_personality_model?.avatar_appearance?.head_color,
      twinProfile.ai_personality_model?.avatar_appearance?.body_color,
      twinProfile.ai_personality_model?.avatar_appearance?.head_shape,
      twinProfile.goals,
      twinProfile.daily_habits,
    ],
  )

  const [profileData, setProfileData] = useState(initialProfileData)
  const [twinData, setTwinData] = useState(initialTwinData)
  const [isEditingData, setIsEditingData] = useState(false)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isSavingTwin, setIsSavingTwin] = useState(false)
  const [isSavingPreferences, setIsSavingPreferences] = useState(false)
  const [isAccountOpen, setIsAccountOpen] = useState(true)
  const [isTwinCustomizeOpen, setIsTwinCustomizeOpen] = useState(false)
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(true)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isRunningDangerAction, setIsRunningDangerAction] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)

  const [showAvatarPreview, setShowAvatarPreview] = useState(false)
  const [showCropModal, setShowCropModal] = useState(false)
  const [cropSource, setCropSource] = useState<string | null>(null)
  const [cropZoom, setCropZoom] = useState(1)
  const [cropPan, setCropPan] = useState<Pan>({ x: 0, y: 0 })
  const [naturalSize, setNaturalSize] = useState({ width: 1000, height: 1000 })

  const currentAvatarUrl = profileData.profileImageUrl.trim()

  async function handleSaveProfile() {
    if (!profile || !isEditingData) return
    setSaveError(null)
    setSaveSuccess(null)
    setIsSavingProfile(true)

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        name: profileData.name.trim() || null,
        avatar_config: {
          ...avatarConfig,
          profile_image_url: profileData.profileImageUrl.trim() || null,
          phone_number: profileData.phoneNumber.trim() || null,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', profile.id)

    if (profileError) {
      setSaveError(profileError.message)
      setIsSavingProfile(false)
      return
    }

    const { error: twinError } = await supabase
      .from('twin_profiles')
      .update({
        personality_traits: profileData.personalityTraits,
        interests: profileData.interests,
        updated_at: new Date().toISOString(),
      })
      .eq('id', twinProfile.id)

    if (twinError) {
      setSaveError(twinError.message)
      setIsSavingProfile(false)
      return
    }

    setIsSavingProfile(false)
    setIsEditingData(false)
    setSaveSuccess('Profile updated.')
    router.refresh()
  }

  async function handleSaveTwinPersonalization() {
    setSaveError(null)
    setSaveSuccess(null)
    setIsSavingTwin(true)

    const headColor = normalizeHexColor(twinData.headColor, '#0d9488')
    const bodyColor = normalizeHexColor(twinData.bodyColor, '#0f766e')
    const speechRate = clampSpeechRate(Number(twinData.speechRate || 1))

    const { error } = await supabase
      .from('twin_profiles')
      .update({
        name: twinData.twinName.trim() || twinProfile.name,
        age: twinData.age ? parseInt(twinData.age.toString(), 10) : null,
        voice_preference: twinData.voicePreference,
        ai_personality_model: {
          ...twinProfile.ai_personality_model,
          communication_style: twinData.communicationStyle,
          decision_making: twinData.decisionMakingStyle,
          voice_tone: twinData.voiceTone,
          speech_rate: speechRate,
          avatar_appearance: {
            ...(twinProfile.ai_personality_model?.avatar_appearance || {}),
            head_color: headColor,
            body_color: bodyColor,
            head_shape: normalizeHeadShape(twinData.headShape),
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', twinProfile.id)

    setIsSavingTwin(false)

    if (error) {
      setSaveError(error.message)
      return
    }

    setSaveSuccess('Twin personalization updated.')
    router.refresh()
  }

  async function handleSavePreferences() {
    setSaveError(null)
    setSaveSuccess(null)
    setIsSavingPreferences(true)

    const parsedGoals = parseMultilineList(twinData.goalsText)
    const parsedHabits = parseMultilineList(twinData.habitsText)

    const { error } = await supabase
      .from('twin_profiles')
      .update({
        ai_personality_model: {
          ...twinProfile.ai_personality_model,
          preferences: {
            ...(twinProfile.ai_personality_model?.preferences || {}),
            global_notifications_enabled: Boolean(twinData.notificationsEnabled),
          },
        },
        goals: parsedGoals,
        daily_habits: parsedHabits,
        updated_at: new Date().toISOString(),
      })
      .eq('id', twinProfile.id)

    setIsSavingPreferences(false)
    if (error) {
      setSaveError(error.message)
      return
    }

    setSaveSuccess('Preferences updated.')
    router.refresh()
  }

  function handleCancelProfileEdit() {
    setProfileData(initialProfileData)
    setIsEditingData(false)
    setSaveError(null)
  }

  function toggleArrayItem(key: 'personalityTraits' | 'interests', item: string) {
    if (!isEditingData) return
    const current = profileData[key]
    if (current.includes(item)) {
      setProfileData({ ...profileData, [key]: current.filter((entry) => entry !== item) })
    } else {
      setProfileData({ ...profileData, [key]: [...current, item] })
    }
  }

  async function handleSignOut() {
    setIsSigningOut(true)
    await supabase.auth.signOut()
    router.replace('/')
    router.refresh()
  }

  async function runAccountAction(action: 'clear_history' | 'reset_personalization' | 'delete_account') {
    if (isRunningDangerAction) return
    setSaveError(null)

    const confirmMessage =
      action === 'clear_history'
        ? 'Delete all your chat/history data? This cannot be undone.'
        : action === 'reset_personalization'
        ? 'Reset all twin personalization (traits, interests, goals, habits, memory)?'
        : 'Delete your account permanently? This cannot be undone.'

    if (!window.confirm(confirmMessage)) return

    let confirmationText: string | undefined
    if (action === 'delete_account') {
      confirmationText = window.prompt('Type DELETE to permanently delete your account:', '') || ''
      if (confirmationText !== 'DELETE') {
        setSaveError('Account deletion cancelled. You must type DELETE exactly.')
        return
      }
    }

    setIsRunningDangerAction(true)
    try {
      const response = await fetch('/api/settings/account-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, confirmationText }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Action failed.')

      if (action === 'delete_account') {
        await supabase.auth.signOut()
        router.replace('/')
        router.refresh()
        return
      }

      setSaveSuccess(action === 'clear_history' ? 'History cleared.' : 'Twin personalization reset.')
      router.refresh()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Action failed.')
    } finally {
      setIsRunningDangerAction(false)
    }
  }

  function triggerUpload() {
    if (!isEditingData) return
    fileInputRef.current?.click()
  }

  function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const src = String(reader.result || '')
      if (!src) return
      const img = new Image()
      img.onload = () => {
        setNaturalSize({ width: img.naturalWidth || 1000, height: img.naturalHeight || 1000 })
      }
      img.src = src
      setCropSource(src)
      setCropZoom(1)
      setCropPan({ x: 0, y: 0 })
      setShowCropModal(true)
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  function resetCrop() {
    setCropZoom(1)
    setCropPan({ x: 0, y: 0 })
  }

  function onCropPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    dragStateRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      panStartX: cropPan.x,
      panStartY: cropPan.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onCropPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragStateRef.current.active) return
    const dx = event.clientX - dragStateRef.current.startX
    const dy = event.clientY - dragStateRef.current.startY
    const nextPan = {
      x: dragStateRef.current.panStartX + dx,
      y: dragStateRef.current.panStartY + dy,
    }
    setCropPan(clampPan(nextPan, cropZoom, naturalSize))
  }

  function onCropPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    dragStateRef.current.active = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  async function saveCroppedAvatar() {
    if (!cropSource) return
    const output = await renderCroppedAvatar({
      src: cropSource,
      pan: cropPan,
      zoom: cropZoom,
      naturalSize,
    })
    setProfileData((prev) => ({ ...prev, profileImageUrl: output }))
    setShowCropModal(false)
  }

  function handleRewatchTutorial() {
    window.dispatchEvent(new Event('saathi-open-tutorial'))
  }

  return (
    <div className="space-y-8">
      <DashboardPageHeader
        title="Settings"
        description="Manage account privacy and tune your twin with precise controls."
      />

      <section id="account-section" className="bg-card rounded-2xl border border-border p-5 md:p-6 space-y-6 tm-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            Account
          </h2>
          <button
            type="button"
            onClick={() => setIsAccountOpen((current) => !current)}
            className="inline-flex items-center gap-2 rounded-xl border border-primary/40 px-4 py-2 text-sm text-primary hover:bg-primary/10"
          >
            {isAccountOpen ? 'Collapse' : 'Expand'}
            {isAccountOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        {isAccountOpen && (
          <>
            <div className="flex flex-wrap gap-2">
              <PillButton onClick={() => setIsEditingData(true)} disabled={isEditingData}>
                Edit Data
              </PillButton>
              <PillButton onClick={triggerUpload} disabled={!isEditingData}>
                Upload Profile Photo
              </PillButton>
            </div>

            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileSelected} />

        <div className="flex items-center gap-4">
          <button
            onClick={() => currentAvatarUrl && setShowAvatarPreview(true)}
            className="h-20 w-20 rounded-full border border-border overflow-hidden bg-muted/40 shrink-0"
          >
            {currentAvatarUrl ? (
              <img src={currentAvatarUrl} alt="Profile avatar" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-lg font-semibold text-primary">
                {(profileData.name || userEmail || 'U').charAt(0).toUpperCase()}
              </div>
            )}
          </button>
          <div>
            <p className="text-sm text-muted-foreground">Profile Photo</p>
            <p className="text-sm text-foreground">Tap avatar to preview</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Your Name">
            <input
              type="text"
              readOnly={!isEditingData}
              value={profileData.name}
              onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
              className={inputClass(!isEditingData)}
            />
          </Field>
          <Field label="Phone Number">
            <input
              type="tel"
              readOnly={!isEditingData}
              value={profileData.phoneNumber}
              onChange={(e) => setProfileData({ ...profileData, phoneNumber: e.target.value })}
              placeholder="+91 ..."
              className={inputClass(!isEditingData)}
            />
          </Field>
        </div>

        <Field label="Email (Private)">
          <input type="email" value={userEmail} disabled className={inputClass(true)} />
        </Field>

        <div className="grid lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-medium text-foreground mb-3">Personality Traits</h3>
            <div className="flex flex-wrap gap-2">
              {PERSONALITY_TRAITS.map((trait) => (
                <Chip
                  key={trait}
                  active={profileData.personalityTraits.includes(trait)}
                  disabled={!isEditingData}
                  onClick={() => toggleArrayItem('personalityTraits', trait)}
                >
                  {trait}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground mb-3">Interests</h3>
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map((interest) => (
                <Chip
                  key={interest}
                  active={profileData.interests.includes(interest)}
                  disabled={!isEditingData}
                  onClick={() => toggleArrayItem('interests', interest)}
                >
                  {interest}
                </Chip>
              ))}
            </div>
          </div>
        </div>

            {isEditingData && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  onClick={handleCancelProfileEdit}
                  className="px-4 py-2 rounded-xl border border-border text-muted-foreground hover:text-foreground"
                >
                  Cancel Edit
                </button>
                <button
                  onClick={handleSaveProfile}
                  disabled={isSavingProfile}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {isSavingProfile ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <section className="bg-card rounded-2xl border border-border p-5 md:p-6 space-y-5 tm-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            Twin Personalization
          </h2>
          <button
            type="button"
            onClick={() => setIsTwinCustomizeOpen((current) => !current)}
            className="inline-flex items-center gap-2 rounded-xl border border-primary/40 px-4 py-2 text-sm text-primary hover:bg-primary/10"
          >
            Customize Twin
            {isTwinCustomizeOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        {isTwinCustomizeOpen && (
          <div className="space-y-6 rounded-2xl border border-border bg-background/35 p-4 md:p-5">
            <div className="rounded-2xl border border-border bg-card/70 p-4">
              <p className="mb-3 text-sm font-medium text-foreground">Live Twin Preview</p>
              <div className="mx-auto flex w-fit flex-col items-center gap-2">
                <div className="h-28 w-28 rounded-2xl bg-background/70 ring-1 ring-primary/20 flex items-center justify-center">
                  <AvatarPreview
                    expression="happy"
                    size="md"
                    headColor={normalizeHexColor(twinData.headColor, '#0d9488')}
                    bodyColor={normalizeHexColor(twinData.bodyColor, '#0f766e')}
                    headShape={normalizeHeadShape(twinData.headShape)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{twinData.twinName || 'Your twin'}</p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Twin Name">
                <input
                  type="text"
                  value={twinData.twinName}
                  onChange={(e) => setTwinData({ ...twinData, twinName: e.target.value })}
                  className={inputClass(false)}
                />
              </Field>
              <Field label="Age">
                <input
                  type="number"
                  min={13}
                  max={120}
                  value={twinData.age}
                  onChange={(e) => setTwinData({ ...twinData, age: e.target.value })}
                  className={inputClass(false)}
                />
              </Field>
            </div>

            <div>
              <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-primary" />
                Voice Preference
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <ChoiceButton
                  active={twinData.voicePreference === 'female'}
                  onClick={() => setTwinData({ ...twinData, voicePreference: 'female' })}
                  title="Female Voice"
                  subtitle="Warm and empathetic"
                />
                <ChoiceButton
                  active={twinData.voicePreference === 'male'}
                  onClick={() => setTwinData({ ...twinData, voicePreference: 'male' })}
                  title="Male Voice"
                  subtitle="Calm and supportive"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Voice Tone">
                <select
                  value={twinData.voiceTone}
                  onChange={(e) => setTwinData({ ...twinData, voiceTone: e.target.value as any })}
                  className={inputClass(false)}
                >
                  <option value="warm">Warm</option>
                  <option value="calm">Calm</option>
                  <option value="energetic">Energetic</option>
                  <option value="soft">Soft</option>
                  <option value="deep">Deep</option>
                </select>
              </Field>
              <Field label="Speech Rate">
                <div className="space-y-2">
                  <input
                    type="range"
                    min={0.7}
                    max={1.3}
                    step={0.05}
                    value={Number(twinData.speechRate || 1)}
                    onChange={(e) => setTwinData({ ...twinData, speechRate: e.target.value })}
                    className="w-full"
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Slower</span>
                    <span className="font-medium text-foreground">{Number(twinData.speechRate || 1).toFixed(2)}x</span>
                    <span>Faster</span>
                  </div>
                </div>
              </Field>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Communication Style">
                <select
                  value={twinData.communicationStyle}
                  onChange={(e) => setTwinData({ ...twinData, communicationStyle: e.target.value as any })}
                  className={inputClass(false)}
                >
                  <option value="encouraging">Encouraging</option>
                  <option value="casual">Casual</option>
                  <option value="formal">Formal</option>
                  <option value="direct">Direct</option>
                </select>
              </Field>
              <Field label="Decision Coaching Style">
                <select
                  value={twinData.decisionMakingStyle}
                  onChange={(e) => setTwinData({ ...twinData, decisionMakingStyle: e.target.value as any })}
                  className={inputClass(false)}
                >
                  <option value="collaborative">Collaborative</option>
                  <option value="analytical">Analytical</option>
                  <option value="intuitive">Intuitive</option>
                  <option value="decisive">Decisive</option>
                </select>
              </Field>
            </div>

            <Field label="Head Shape">
              <div className="flex flex-wrap gap-2">
                {HEAD_SHAPES.map((shape) => (
                  <button
                    key={shape.value}
                    type="button"
                    onClick={() => setTwinData({ ...twinData, headShape: shape.value })}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      normalizeHeadShape(twinData.headShape) === shape.value
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-border text-foreground hover:border-primary/50'
                    }`}
                  >
                    {shape.label}
                  </button>
                ))}
              </div>
            </Field>

            <div>
              <h3 className="text-sm font-medium text-foreground mb-3">Twin Color</h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                {TWIN_COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => setTwinData({ ...twinData, headColor: preset.head, bodyColor: preset.body })}
                    className="rounded-xl border border-border p-3 text-left hover:border-primary/60 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="h-6 w-6 rounded-full border border-border" style={{ backgroundColor: preset.head }} />
                      <span className="h-6 w-6 rounded-full border border-border" style={{ backgroundColor: preset.body }} />
                    </div>
                    <p className="text-sm font-medium text-foreground">{preset.name}</p>
                  </button>
                ))}
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Head Color">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={normalizeHexColor(twinData.headColor, '#0d9488')}
                      onChange={(e) => setTwinData({ ...twinData, headColor: e.target.value })}
                      className="h-10 w-12 rounded-lg border border-border bg-input p-1"
                    />
                    <input
                      type="text"
                      value={twinData.headColor}
                      onChange={(e) => setTwinData({ ...twinData, headColor: e.target.value })}
                      className={inputClass(false)}
                      placeholder="#0d9488"
                    />
                  </div>
                </Field>
                <Field label="Body Color">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={normalizeHexColor(twinData.bodyColor, '#0f766e')}
                      onChange={(e) => setTwinData({ ...twinData, bodyColor: e.target.value })}
                      className="h-10 w-12 rounded-lg border border-border bg-input p-1"
                    />
                    <input
                      type="text"
                      value={twinData.bodyColor}
                      onChange={(e) => setTwinData({ ...twinData, bodyColor: e.target.value })}
                      className={inputClass(false)}
                      placeholder="#0f766e"
                    />
                  </div>
                </Field>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleSaveTwinPersonalization}
                disabled={isSavingTwin}
                className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-primary-foreground transition-all ${
                  isSavingTwin
                    ? 'bg-primary/85 animate-pulse'
                    : 'bg-primary hover:bg-primary/90 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgb(var(--app-glow)_/_0.3)]'
                }`}
              >
                <Sparkles className={`w-4 h-4 ${isSavingTwin ? 'animate-spin' : ''}`} />
                {isSavingTwin ? 'Saving Twin...' : 'Save Twin'}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="bg-card rounded-2xl border border-border p-5 md:p-6 space-y-5 tm-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <BellRing className="w-5 h-5 text-primary" />
            Preferences
          </h2>
          <button
            type="button"
            onClick={() => setIsPreferencesOpen((current) => !current)}
            className="inline-flex items-center gap-2 rounded-xl border border-primary/40 px-4 py-2 text-sm text-primary hover:bg-primary/10"
          >
            {isPreferencesOpen ? 'Collapse' : 'Expand'}
            {isPreferencesOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        {isPreferencesOpen && (
          <>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/70 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-foreground">Global AI Reminders</p>
                <p className="text-xs text-muted-foreground">
                  Show top-right reminders for tomorrow&apos;s events and late-night rest prompts.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(twinData.notificationsEnabled)}
                onClick={() =>
                  setTwinData((current) => ({ ...current, notificationsEnabled: !current.notificationsEnabled }))
                }
                className={`relative h-7 w-12 rounded-full border transition-colors ${
                  twinData.notificationsEnabled ? 'border-primary/60 bg-primary/25' : 'border-border bg-muted'
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    twinData.notificationsEnabled ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>

            <div className="rounded-xl border border-border bg-background/35 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">Tutorial</p>
                  <p className="text-xs text-muted-foreground">Need a quick feature walkthrough again?</p>
                </div>
                <button
                  type="button"
                  onClick={handleRewatchTutorial}
                  className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-3 py-2 text-sm text-primary hover:bg-primary/10"
                >
                  <RotateCcw className="h-4 w-4" />
                  Rewatch Tutorial
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Goals (one per line)">
                <textarea
                  value={twinData.goalsText}
                  onChange={(e) => setTwinData({ ...twinData, goalsText: e.target.value })}
                  rows={6}
                  className={inputClass(false)}
                />
              </Field>
              <Field label="Daily Habits (one per line)">
                <textarea
                  value={twinData.habitsText}
                  onChange={(e) => setTwinData({ ...twinData, habitsText: e.target.value })}
                  rows={6}
                  className={inputClass(false)}
                />
              </Field>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleSavePreferences}
                disabled={isSavingPreferences}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Save className={`h-4 w-4 ${isSavingPreferences ? 'animate-spin' : ''}`} />
                {isSavingPreferences ? 'Saving Preferences...' : 'Save Preferences'}
              </button>
            </div>
          </>
        )}
      </section>

      <DashboardSection
        title="Account Actions"
        icon={Settings}
        collapsible
        defaultOpen={false}
      >
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleSignOut}
            disabled={isSigningOut || isRunningDangerAction}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
          >
            <LogOut className="w-4 h-4" />
            {isSigningOut ? 'Signing out...' : 'Sign Out'}
          </button>
          <button
            onClick={() => runAccountAction('clear_history')}
            disabled={isSigningOut || isRunningDangerAction}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
          >
            Clear Chats History
          </button>
          <button
            onClick={() => runAccountAction('reset_personalization')}
            disabled={isSigningOut || isRunningDangerAction}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
          >
            Reset Twin Personalization
          </button>
          <button
            onClick={() => runAccountAction('delete_account')}
            disabled={isSigningOut || isRunningDangerAction}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
          >
            Delete Account
          </button>
        </div>
      </DashboardSection>

      {(saveError || saveSuccess) && (
        <div className="text-sm">
          {saveError && <p className="rounded-lg bg-destructive/10 text-destructive px-3 py-2">{saveError}</p>}
          {saveSuccess && <p className="rounded-lg bg-primary/10 text-primary px-3 py-2">{saveSuccess}</p>}
        </div>
      )}

      {showAvatarPreview && currentAvatarUrl && (
        <ModalShell onClose={() => setShowAvatarPreview(false)}>
          <div className="w-full max-w-md bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">Profile Photo</h3>
              <button onClick={() => setShowAvatarPreview(false)} className="p-2 rounded-lg hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="w-full aspect-square rounded-2xl overflow-hidden border border-border bg-muted/30">
              <img src={currentAvatarUrl} alt="Avatar preview" className="h-full w-full object-cover" />
            </div>
          </div>
        </ModalShell>
      )}

      {showCropModal && cropSource && (
        <ModalShell onClose={() => setShowCropModal(false)}>
          <div className="w-full max-w-lg bg-card border border-border rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Crop Avatar</h3>
              <button onClick={() => setShowCropModal(false)} className="p-2 rounded-lg hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div
              className="relative mx-auto w-[280px] h-[280px] sm:w-[320px] sm:h-[320px] rounded-full overflow-hidden border border-border bg-muted/40 touch-none"
              onPointerDown={onCropPointerDown}
              onPointerMove={onCropPointerMove}
              onPointerUp={onCropPointerUp}
              onPointerCancel={onCropPointerUp}
            >
              <img
                src={cropSource}
                alt="Crop source"
                draggable={false}
                className="absolute inset-0 w-full h-full object-cover select-none"
                style={{
                  transform: `translate(${cropPan.x}px, ${cropPan.y}px) scale(${cropZoom})`,
                  transformOrigin: 'center center',
                }}
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Zoom</p>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={cropZoom}
                onChange={(e) => {
                  const nextZoom = Number(e.target.value)
                  setCropZoom(nextZoom)
                  setCropPan((current) => clampPan(current, nextZoom, naturalSize))
                }}
                className="w-full"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={resetCrop} className="px-4 py-2 rounded-xl border border-border text-muted-foreground hover:text-foreground">
                Reset
              </button>
              <button onClick={saveCroppedAvatar} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
                Save Avatar
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-foreground mb-2">{label}</span>
      {children}
    </label>
  )
}

function Chip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full border text-sm transition-all ${
        active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-foreground'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-primary/50'}`}
    >
      {active && <Check className="w-3.5 h-3.5 inline mr-1" />}
      {children}
    </button>
  )
}

function ChoiceButton({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean
  onClick: () => void
  title: string
  subtitle: string
}) {
  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-xl border-2 transition-all text-left ${
        active ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
      }`}
    >
      <p className="font-medium text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </button>
  )
}

function PillButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm ${
        disabled
          ? 'opacity-50 cursor-not-allowed border-border text-muted-foreground'
          : 'border-primary/40 text-primary hover:bg-primary/10'
      }`}
    >
      <Upload className="w-3.5 h-3.5" />
      {children}
    </button>
  )
}

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center" onClick={onClose}>
      <div onClick={(event) => event.stopPropagation()}>{children}</div>
    </div>
  )
}

function inputClass(readOnly: boolean) {
  return `w-full px-4 py-3 rounded-xl border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
    readOnly ? 'bg-muted text-muted-foreground' : 'bg-input'
  }`
}

function parseMultilineList(input: string) {
  return input
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 25)
}

function normalizeHexColor(value: string, fallback: string) {
  const hex = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex.toLowerCase()
  return fallback
}

function clampSpeechRate(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.min(1.3, Math.max(0.7, Number(value.toFixed(2))))
}

function normalizeHeadShape(value: unknown): AvatarHeadShape {
  const raw = String(value || '').toLowerCase()
  const allowed: AvatarHeadShape[] = ['circle', 'square', 'rectangle', 'cylinder', 'triangle', 'pentagon', 'star']
  return allowed.includes(raw as AvatarHeadShape) ? (raw as AvatarHeadShape) : 'circle'
}

function clampPan(pan: Pan, zoom: number, naturalSize: { width: number; height: number }) {
  const frame = 320
  const baseScale = Math.max(frame / naturalSize.width, frame / naturalSize.height)
  const displayedW = naturalSize.width * baseScale * zoom
  const displayedH = naturalSize.height * baseScale * zoom
  const maxX = Math.max(0, (displayedW - frame) / 2)
  const maxY = Math.max(0, (displayedH - frame) / 2)
  return {
    x: Math.max(-maxX, Math.min(maxX, pan.x)),
    y: Math.max(-maxY, Math.min(maxY, pan.y)),
  }
}

async function renderCroppedAvatar({
  src,
  pan,
  zoom,
  naturalSize,
}: {
  src: string
  pan: Pan
  zoom: number
  naturalSize: { width: number; height: number }
}) {
  const frame = 320
  const output = 640
  const image = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = output
  canvas.height = output
  const ctx = canvas.getContext('2d')
  if (!ctx) return src

  const baseScale = Math.max(frame / naturalSize.width, frame / naturalSize.height)
  const displayScale = baseScale * zoom
  const displayedW = naturalSize.width * displayScale
  const displayedH = naturalSize.height * displayScale
  const imageX = (frame - displayedW) / 2 + pan.x
  const imageY = (frame - displayedH) / 2 + pan.y

  const sx = -imageX / displayScale
  const sy = -imageY / displayScale
  const sw = frame / displayScale
  const sh = frame / displayScale

  ctx.clearRect(0, 0, output, output)
  ctx.beginPath()
  ctx.arc(output / 2, output / 2, output / 2, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, output, output)
  return canvas.toDataURL('image/png')
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
