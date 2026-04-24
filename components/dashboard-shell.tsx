'use client'

import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronDown, ChevronUp } from 'lucide-react'

import { cn } from '@/lib/utils'

export function DashboardPageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-4 pb-1', className)}>
      <div className="space-y-1">
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
          {title}
        </h1>
        {description ? <p className="text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function DashboardSection({
  title,
  description,
  icon: Icon,
  right,
  children,
  collapsible = false,
  defaultOpen = true,
  className,
  contentClassName,
}: {
  title: string
  description?: string
  icon?: LucideIcon
  right?: React.ReactNode
  children: React.ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
  className?: string
  contentClassName?: string
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <section className={cn('rounded-2xl border border-border bg-card p-5 md:p-6 tm-panel', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {Icon ? <Icon className="h-4 w-4 text-primary" /> : null}
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
          </div>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {right}
          {collapsible ? (
            <button
              type="button"
              onClick={() => setIsOpen((current) => !current)}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/70 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {isOpen ? 'Collapse' : 'Expand'}
              {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          ) : null}
        </div>
      </div>
      {(!collapsible || isOpen) && <div className={cn('mt-4', contentClassName)}>{children}</div>}
    </section>
  )
}
