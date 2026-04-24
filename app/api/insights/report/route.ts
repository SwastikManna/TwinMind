import { createClient } from '@/lib/supabase/server'
import { aggregateMoodByDay } from '@/lib/mood'
import { fetchMoodEntries } from '@/lib/mood-storage'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const entries = await fetchMoodEntries(supabase, user.id)
    const daily = aggregateMoodByDay(entries)
    const last7 = sliceByDays(daily, 7)
    const prev7 = slicePrevWindow(daily, 7, 7)

    const avgHappiness = average(last7.map((row) => row.happiness))
    const avgStress = average(last7.map((row) => row.stress))
    const prevHappiness = average(prev7.map((row) => row.happiness))
    const prevStress = average(prev7.map((row) => row.stress))

    const happinessDelta = avgHappiness - prevHappiness
    const stressDelta = avgStress - prevStress
    const stressSpike = detectStressSpike(last7)

    const recommendation = buildRecommendation({
      avgHappiness,
      avgStress,
      happinessDelta,
      stressDelta,
      stressSpike,
    })

    return Response.json({
      report: {
        avgHappiness,
        avgStress,
        happinessDelta,
        stressDelta,
        stressSpike,
        recommendation,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not generate weekly report.'
    return Response.json({ error: message }, { status: 500 })
  }
}

function sliceByDays<T>(rows: T[], days: number) {
  return rows.slice(-days)
}

function slicePrevWindow<T>(rows: T[], days: number, offsetDays: number) {
  const end = rows.length - offsetDays
  const start = Math.max(0, end - days)
  if (end <= 0) return []
  return rows.slice(start, end)
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function detectStressSpike(last7: Array<{ stress: number; date: string }>) {
  if (last7.length < 4) return null
  const latest = last7[last7.length - 1]
  const baseline = average(last7.slice(0, -1).map((row) => row.stress))
  if (latest.stress - baseline >= 15) {
    return {
      date: latest.date,
      stress: latest.stress,
      baseline,
      severity: latest.stress - baseline,
    }
  }
  return null
}

function buildRecommendation({
  avgHappiness,
  avgStress,
  happinessDelta,
  stressDelta,
  stressSpike,
}: {
  avgHappiness: number
  avgStress: number
  happinessDelta: number
  stressDelta: number
  stressSpike: { date: string; stress: number; baseline: number; severity: number } | null
}) {
  if (stressSpike) {
    return `Stress spiked on ${stressSpike.date}. Schedule one 30-minute low-effort recovery block and reduce tomorrow's task list to one must-do item.`
  }
  if (avgStress >= 65) {
    return 'Your stress is elevated this week. Use a shorter daily plan (1 top task + 1 optional task) and close each day with a 5-minute shutdown ritual.'
  }
  if (avgHappiness >= 65 && happinessDelta > 0) {
    return 'You are trending upward. Lock in this momentum by repeating the routine that gave you your best day this week.'
  }
  if (stressDelta > 0 && happinessDelta < 0) {
    return 'This week felt heavier than last week. Protect your energy by removing one non-essential commitment for the next 3 days.'
  }
  return 'Progress is steady. Keep one consistent daily anchor habit and review your mood again after 3 days.'
}
