/* eslint-disable no-console */
const crypto = require('crypto')
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
    if (!(key in process.env)) process.env[key] = value
  }
}

function uid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function toIsoAt(dayOffset, hour, minute = 0, durationMin = 60) {
  const start = new Date()
  start.setHours(hour, minute, 0, 0)
  start.setDate(start.getDate() + dayOffset)
  const end = new Date(start.getTime() + durationMin * 60000)
  return { starts_at: start.toISOString(), ends_at: end.toISOString() }
}

function missingTableError(message) {
  const m = String(message || '').toLowerCase()
  return m.includes('could not find the table') || (m.includes('relation') && m.includes('does not exist'))
}

function buildSparseEventPlan() {
  // Sparse but realistic spread over ~4 weeks
  return [
    { day: 1, hour: 8, minute: 0, dur: 50, title: 'Morning Deep Work', tag: 'study', priority: 'high' },
    { day: 2, hour: 18, minute: 30, dur: 75, title: 'Evening Walk + Reset', tag: 'health', priority: 'medium' },
    { day: 4, hour: 10, minute: 0, dur: 90, title: 'Project Focus Block', tag: 'work', priority: 'high' },
    { day: 6, hour: 16, minute: 0, dur: 60, title: 'Casual Catch-up', tag: 'social', priority: 'low' },
    { day: 8, hour: 9, minute: 0, dur: 120, title: 'Revision Sprint', tag: 'study', priority: 'critical' },
    { day: 10, hour: 19, minute: 0, dur: 60, title: 'Light Fitness Session', tag: 'health', priority: 'medium' },
    { day: 12, hour: 11, minute: 0, dur: 75, title: 'Weekly Planning', tag: 'important', priority: 'high' },
    { day: 14, hour: 17, minute: 30, dur: 90, title: 'Movie Break', tag: 'casual', priority: 'low' },
    { day: 16, hour: 8, minute: 30, dur: 60, title: 'Interview Prep', tag: 'super_important', priority: 'critical' },
    { day: 19, hour: 15, minute: 0, dur: 60, title: 'Skill Practice', tag: 'study', priority: 'medium' },
    { day: 22, hour: 10, minute: 30, dur: 90, title: 'Major Submission Window', tag: 'super_important', priority: 'critical' },
    { day: 25, hour: 18, minute: 0, dur: 75, title: 'Friends & Recharge', tag: 'social', priority: 'low' },
    { day: 27, hour: 9, minute: 30, dur: 80, title: 'Goal Review + Adjustments', tag: 'important', priority: 'high' },
  ]
}

function normalizeEvent(userId, row, idx) {
  const time = toIsoAt(row.day, row.hour, row.minute, row.dur)
  return {
    id: uid(),
    user_id: userId,
    title: row.title,
    starts_at: time.starts_at,
    ends_at: time.ends_at,
    tag: row.tag,
    priority: row.priority,
    reminder_minutes: row.priority === 'critical' ? 180 : row.priority === 'high' ? 90 : 45,
    recurrence: 'none',
    location: null,
    notes: 'Seeded schedule event',
    completed: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

function isSameSeededTitle(title) {
  const known = new Set(buildSparseEventPlan().map((p) => p.title))
  return known.has(title)
}

async function seedForUser(supabase, twin) {
  const userId = twin.user_id
  const desired = buildSparseEventPlan().map((row, idx) => normalizeEvent(userId, row, idx))

  const { data: existingRows, error: existingErr } = await supabase
    .from('calendar_events')
    .select('id,title')
    .eq('user_id', userId)

  if (!existingErr) {
    const existingTitles = new Set((existingRows || []).map((r) => r.title))
    const toInsert = desired.filter((row) => !existingTitles.has(row.title))
    if (toInsert.length === 0) return { mode: 'table', added: 0 }

    const toInsertForTable = toInsert.map(({ id, ...rest }) => rest)
    const { error: insertErr } = await supabase.from('calendar_events').insert(toInsertForTable)
    if (insertErr) throw new Error(insertErr.message)
    return { mode: 'table', added: toInsert.length }
  }

  if (!missingTableError(existingErr.message)) {
    throw new Error(existingErr.message)
  }

  const modelData =
    twin.ai_personality_model && typeof twin.ai_personality_model === 'object'
      ? { ...twin.ai_personality_model }
      : {}
  const existingFallback = Array.isArray(modelData.calendar_events) ? [...modelData.calendar_events] : []
  const cleaned = existingFallback.filter((e) => !isSameSeededTitle(e.title))
  const merged = [...cleaned, ...desired].sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))

  const { error: updateErr } = await supabase
    .from('twin_profiles')
    .update({
      ai_personality_model: {
        ...modelData,
        calendar_events: merged,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', twin.id)

  if (updateErr) throw new Error(updateErr.message)
  return { mode: 'fallback', added: desired.length }
}

async function main() {
  const root = process.cwd()
  loadEnvFile(path.join(root, '.env.local'))
  loadEnvFile(path.join(root, '.env'))

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase credentials in env')

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: twins, error } = await supabase
    .from('twin_profiles')
    .select('id,user_id,ai_personality_model')

  if (error) throw new Error(`Failed to fetch twin profiles: ${error.message}`)
  if (!twins || twins.length === 0) {
    console.log('No twin profiles found.')
    return
  }

  let addedTotal = 0
  for (const twin of twins) {
    const result = await seedForUser(supabase, twin)
    addedTotal += result.added
    console.log(`User ${twin.user_id}: added ${result.added} event(s) via ${result.mode}.`)
  }

  console.log(`Done. Total events added: ${addedTotal}`)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
