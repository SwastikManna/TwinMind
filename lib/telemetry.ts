type TelemetryLevel = 'info' | 'warn' | 'error'

interface TelemetryEvent {
  name: string
  level?: TelemetryLevel
  userId?: string
  metadata?: Record<string, unknown>
}

export function logTelemetryEvent(event: TelemetryEvent) {
  const payload = {
    ts: new Date().toISOString(),
    level: event.level || 'info',
    name: event.name,
    userId: event.userId || null,
    metadata: event.metadata || {},
  }

  const line = JSON.stringify(payload)
  if (payload.level === 'error') {
    console.error(line)
    return
  }
  if (payload.level === 'warn') {
    console.warn(line)
    return
  }
  console.log(line)
}
