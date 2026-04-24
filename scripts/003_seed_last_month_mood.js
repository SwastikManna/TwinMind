/* eslint-disable no-console */
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  const raw = fs.readFileSync(filePath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function dayKeyFromIso(iso) {
  return String(iso).slice(0, 10)
}

function hashNum(input) {
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h >>> 0)
}

function buildSyntheticMood(userId, dayIso, offset) {
  const seed = hashNum(`${userId}:${dayIso}`)
  const weeklyWave = Math.sin((offset / 7) * Math.PI * 2)
  const monthlyWave = Math.cos((offset / 30) * Math.PI * 2)
  const jitter = (seed % 13) - 6

  const happiness = clamp(Math.round(63 + weeklyWave * 11 + monthlyWave * 6 + jitter), 38, 92)
  const stress = clamp(Math.round(43 - weeklyWave * 8 + (monthlyWave < 0 ? 6 : -3) + ((seed >> 4) % 11) - 5), 18, 88)

  const moods = [
    'focused and steady',
    'motivated with some pressure',
    'calm and productive',
    'slightly stressed but improving',
    'energized and clear-minded',
    'tired but still progressing',
  ]
  const wins = [
    'made visible progress on goals',
    'showed up even on a low-energy day',
    'completed an important pending task',
    'stayed consistent with routine',
    'handled pressure better than before',
  ]
  const blockers = [
    'time split between multiple priorities',
    'mental fatigue in the afternoon',
    'small distractions reducing deep focus',
    'uncertainty around next best task',
  ]

  const moodText = moods[seed % moods.length]
  const winText = wins[(seed >> 3) % wins.length]
  const blockerText = blockers[(seed >> 6) % blockers.length]
  const reflection = `Felt ${moodText}. Main win: ${winText}. Blocker: ${blockerText}.`

  return {
    id: `seed-${dayIso}-${String(seed).slice(0, 6)}`,
    user_id: userId,
    source: 'checkin',
    reflection,
    happiness,
    stress,
    created_at: `${dayIso}T12:00:00.000Z`,
  }
}

async function main() {
  const root = process.cwd()
  loadEnvFile(path.join(root, '.env.local'))
  loadEnvFile(path.join(root, '.env'))

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase URL or service role key in environment.')
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: twins, error: twinsError } = await supabase
    .from('twin_profiles')
    .select('id,user_id,ai_personality_model')

  if (twinsError) throw new Error(`Failed to fetch twin profiles: ${twinsError.message}`)
  if (!twins || twins.length === 0) {
    console.log('No twin_profiles found. Nothing to seed.')
    return
  }

  let totalNewEntries = 0
  let totalUsersUpdated = 0

  for (const twin of twins) {
    const modelData =
      twin.ai_personality_model && typeof twin.ai_personality_model === 'object'
        ? { ...twin.ai_personality_model }
        : {}

    const existing = Array.isArray(modelData.mood_tracker_entries) ? [...modelData.mood_tracker_entries] : []
    const existingByDay = new Set(existing.map((entry) => dayKeyFromIso(entry.created_at)))

    const toAdd = []
    const now = new Date()
    now.setHours(12, 0, 0, 0)

    for (let offset = 30; offset >= 1; offset -= 1) {
      const day = new Date(now)
      day.setDate(day.getDate() - offset)
      const dayIso = day.toISOString().slice(0, 10)
      if (existingByDay.has(dayIso)) continue
      toAdd.push(buildSyntheticMood(twin.user_id, dayIso, offset))
    }

    if (toAdd.length === 0) continue

    const merged = [...toAdd, ...existing]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 360)

    const { error: updateError } = await supabase
      .from('twin_profiles')
      .update({
        ai_personality_model: {
          ...modelData,
          mood_tracker_entries: merged,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', twin.id)

    if (updateError) {
      throw new Error(`Failed updating twin ${twin.id}: ${updateError.message}`)
    }

    const memoryRows = toAdd.map((entry) => ({
      user_id: twin.user_id,
      content: `MOOD_TRACKER::${JSON.stringify(entry)}`,
      log_type: 'mood',
      sentiment: entry.happiness >= 60 ? 'positive' : entry.happiness <= 40 ? 'negative' : 'neutral',
      created_at: entry.created_at,
    }))

    const { error: memoryError } = await supabase.from('memory_logs').insert(memoryRows)
    if (memoryError) {
      const msg = String(memoryError.message || '').toLowerCase()
      const missingTable =
        msg.includes('could not find the table') || (msg.includes('relation') && msg.includes('does not exist'))
      if (!missingTable) {
        throw new Error(`Failed inserting memory logs for ${twin.user_id}: ${memoryError.message}`)
      }
    }

    totalNewEntries += toAdd.length
    totalUsersUpdated += 1
    console.log(`Seeded ${toAdd.length} day(s) for user ${twin.user_id}`)
  }

  console.log(`Done. Updated ${totalUsersUpdated} user(s), added ${totalNewEntries} mood day entries.`)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
