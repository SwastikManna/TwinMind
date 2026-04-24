'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import {
  Brain,
  CalendarDays,
  LayoutDashboard,
  MessageSquare,
  Target,
  Lightbulb,
  HeartPulse,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/theme-toggle'

interface DashboardNavProps {
  user: User
  profileName?: string
  profileImageUrl?: string | null
}

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/dashboard/chat', label: 'Chat with Twin', icon: MessageSquare },
  { href: '/dashboard/mood', label: 'Mood Tracker', icon: HeartPulse },
  { href: '/dashboard/goals', label: 'Goals', icon: Target },
  { href: '/dashboard/insights', label: 'Insights', icon: Lightbulb },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

export function DashboardNav({ user, profileName, profileImageUrl }: DashboardNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/')
    router.refresh()
  }

  return (
    <>
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border shadow-[0_8px_30px_rgb(0_0_0_/_0.16)]">
        <div className="flex items-center justify-between px-4 h-16">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Brain className="w-4 h-4 text-primary" />
            </div>
            <span className="font-bold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
              TwinMind
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-foreground"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="absolute top-16 left-0 right-0 bg-background border-b border-border p-4 space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl transition-colors',
                  pathname === item.href
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            ))}
            <button
              onClick={handleSignOut}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors w-full"
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </div>
        )}
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:bg-card lg:border-r lg:border-border shadow-[0_10px_34px_rgb(0_0_0_/_0.2)]">
        <div className="flex items-center justify-between px-6 h-16 border-b border-border">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Brain className="w-5 h-5 text-primary" />
            </div>
            <span className="font-bold text-xl text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
              TwinMind
            </span>
          </Link>
          <ThemeToggle />
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl transition-colors',
                pathname === item.href
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          <Link
            href="/dashboard/settings#account-section"
            className="group flex items-center gap-3 px-4 py-3 mb-2 rounded-xl hover:bg-muted transition-colors"
            title="Open account settings"
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden ring-1 ring-border">
              {profileImageUrl ? (
                <img src={profileImageUrl} alt="Profile photo" className="h-full w-full object-cover" />
              ) : (
                <span className="text-sm font-medium text-primary">
                  {(profileName || user.email || 'U').charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                {profileName || 'User'}
              </p>
              <p className="text-xs text-muted-foreground truncate">Private account</p>
            </div>
          </Link>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors w-full"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  )
}
