import type { ReactNode } from 'react'
import { WeeklyBehaviorReport } from '@/lib/behavior'
import { Award, ShieldAlert, TrendingUp } from 'lucide-react'

export function BehaviorReportCard({ report }: { report: WeeklyBehaviorReport }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-6">
      <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <Award className="w-5 h-5 text-primary" />
        Weekly Behavior Report
      </h2>
      <div className="grid sm:grid-cols-4 gap-3">
        <Metric label="Grade" value={report.grade} icon={<Award className="w-4 h-4 text-primary" />} />
        <Metric label="Total Points" value={String(report.totalPoints)} icon={<TrendingUp className="w-4 h-4 text-accent" />} />
        <Metric label="Positive Acts" value={String(report.positiveActions)} icon={<TrendingUp className="w-4 h-4 text-chart-4" />} />
        <Metric label="Risky Acts" value={String(report.riskyActions)} icon={<ShieldAlert className="w-4 h-4 text-chart-3" />} />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Week: {report.weekStart} to {report.weekEnd}
      </p>
      <p className="mt-1 text-sm text-foreground">{report.summary}</p>
    </div>
  )
}

function Metric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-semibold text-foreground inline-flex items-center gap-1.5">
        {icon}
        {value}
      </p>
    </div>
  )
}
