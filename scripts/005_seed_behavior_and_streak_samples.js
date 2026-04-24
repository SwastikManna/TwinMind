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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function hashNum(input) {
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h >>> 0)
}

function buildMoodEntry(userId, dayIso, source, reflection, happiness, stress, suffix) {
  return {
    id: `sample-mood-${dayIso}-${suffix}`,
    user_id: userId,
    source,
    reflection,
    happiness: clamp(Math.round(happiness), 0, 100),
    stress: clamp(Math.round(stress), 0, 100),
    created_at: `${dayIso}T12:00:00.000Z`,
  }
}

function buildBehaviorEntry(userId, dayIso, type, points, note, suffix) {
  return {
    id: `sample-behavior-${dayIso}-${suffix}`,
    type,
    points,
    note,
    created_at: `${dayIso}T18:00:00.000Z`,
  }
}

function generateSampleData(userId) {
  const now = new Date()
  now.setHours(12, 0, 0, 0)
  const moodEntries = []
  const behaviorEntries = []

  for (let offset = 60; offset >= 1; offset -= 1) {
    const day = new Date(now)
    day.setDate(day.getDate() - offset)
    const dayIso = day.toISOString().slice(0, 10)
    const seed = hashNum(`${userId}-${dayIso}`)
    const isRecent30 = offset <= 30

    // Older 30 days: intentionally broken streak pattern
    // Keep entries on selective days only so blue-fire/cross streaks are visible.
    const olderKeep =
      offset >= 45
        ? [60, 59, 58, 56, 55, 54, 51, 50, 49, 47, 46, 45].includes(offset)
        : [44, 43, 41, 40, 38, 37, 36, 34, 33, 31].includes(offset)

    if (isRecent30 || olderKeep) {
      const happinessBase = isRecent30 ? 68 : 57
      const stressBase = isRecent30 ? 37 : 49
      const happiness = happinessBase + ((seed % 15) - 7)
      const stress = stressBase + (((seed >> 4) % 13) - 6)
      moodEntries.push(
        buildMoodEntry(
          userId,
          dayIso,
          'checkin',
          isRecent30
            ? 'Stayed focused and moved key work forward.'
            : 'Mixed day with uneven focus; still showed up.',
          happiness,
          stress,
          `a${offset}`,
        ),
      )
    }

    // Behavior points across all 60 days with denser positives in recent 30.
    const cycle = seed % 7
    if (isRecent30) {
      if (cycle <= 2) {
        behaviorEntries.push(
          buildBehaviorEntry(userId, dayIso, 'study_near_event', 12, 'Prepared ahead for an important event.', `p${offset}`),
        )
      } else if (cycle <= 4) {
        behaviorEntries.push(
          buildBehaviorEntry(userId, dayIso, 'healthy_break', 6, 'Took a healthy break as suggested.', `p${offset}`),
        )
      } else {
        behaviorEntries.push(
          buildBehaviorEntry(userId, dayIso, 'prepared_for_event', 9, 'Planned and prioritized tasks early.', `p${offset}`),
        )
      }
      if (cycle === 6) {
        behaviorEntries.push(
          buildBehaviorEntry(userId, dayIso, 'risky_choice', -5, 'Minor distraction before focus block.', `n${offset}`),
        )
      }
    } else {
      if (cycle <= 1) {
        behaviorEntries.push(
          buildBehaviorEntry(userId, dayIso, 'focused_choice', 7, 'Made a focused choice and stayed consistent.', `o${offset}`),
        )
      } else if (cycle === 2) {
        behaviorEntries.push(
          buildBehaviorEntry(userId, dayIso, 'risky_choice', -7, 'Chose a distraction near a key task.', `o${offset}`),
        )
      }
    }
  }

  return { moodEntries, behaviorEntries }
}

async function main() {
  const root = process.cwd()
  loadEnvFile(path.join(root, '.env.local'))
  loadEnvFile(path.join(root, '.env'))

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase credentials')

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: twins, error } = await supabase
    .from('twin_profiles')
    .select('id,user_id,ai_personality_model')

  if (error) throw new Error(error.message)
  if (!twins || twins.length === 0) {
    console.log('No twin profiles found.')
    return
  }

  for (const twin of twins) {
    const modelData =
      twin.ai_personality_model && typeof twin.ai_personality_model === 'object'
        ? { ...twin.ai_personality_model }
        : {}
    const existingMood = Array.isArray(modelData.mood_tracker_entries) ? [...modelData.mood_tracker_entries] : []
    const existingBehavior = Array.isArray(modelData.behavior_points_history) ? [...modelData.behavior_points_history] : []

    const cleanMood = existingMood.filter((entry) => !String(entry.id || '').startsWith('sample-mood-'))
    const cleanBehavior = existingBehavior.filter((entry) => !String(entry.id || '').startsWith('sample-behavior-'))

    const { moodEntries, behaviorEntries } = generateSampleData(twin.user_id)
    const nextMood = [...moodEntries, ...cleanMood].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 420)
    const nextBehavior = [...behaviorEntries, ...cleanBehavior]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 420)

    const { error: updateError } = await supabase
      .from('twin_profiles')
      .update({
        ai_personality_model: {
          ...modelData,
          mood_tracker_entries: nextMood,
          behavior_points_history: nextBehavior,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', twin.id)

    if (updateError) throw new Error(updateError.message)
    console.log(`Seeded user ${twin.user_id}: mood=${moodEntries.length}, behavior=${behaviorEntries.length}`)
  }

  console.log('Done seeding behavior points + streak sample data.')
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
