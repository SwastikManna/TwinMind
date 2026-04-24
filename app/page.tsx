import Link from 'next/link'
import { Brain, ArrowRight } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { createClient } from '@/lib/supabase/server'

export default async function LandingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const exploreHref = user ? '/dashboard' : '/auth/sign-up'

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-28 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-primary/18 blur-3xl" />
        <div className="absolute bottom-8 right-8 h-56 w-56 rounded-full bg-accent/14 blur-3xl" />
      </div>

      <header className="relative z-10 mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
        <Link href="/" className="inline-flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12 ring-1 ring-primary/25">
            <Brain className="h-5 w-5 text-primary" />
          </div>
          <span className="text-2xl font-bold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
            TwinMind
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="rounded-xl border border-border bg-background/75 px-4 py-2 text-base font-semibold text-foreground transition-colors hover:bg-muted"
              >
                Dashboard
              </Link>
              <Link
                href="/dashboard/chat"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Open Chat
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/auth/login"
                className="rounded-xl border border-border bg-background/75 px-4 py-2 text-base font-semibold text-foreground transition-colors hover:bg-muted"
              >
                Sign In
              </Link>
              <Link
                href="/auth/sign-up"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-7xl items-center px-5 pb-8 sm:px-8 lg:px-10">
        <section className="w-full max-w-5xl rounded-3xl border border-border bg-card/85 p-10 shadow-[0_20px_60px_rgb(0_0_0_/_0.24)] backdrop-blur-sm sm:p-14 lg:p-16">
          <p className="mb-4 inline-flex rounded-full border border-primary/35 bg-primary/10 px-4 py-1.5 text-sm font-semibold tracking-wide text-primary">
            Your AI Digital Twin
          </p>
          <h1
            className="text-[clamp(3rem,8vw,5.5rem)] font-bold leading-[1.02] text-foreground"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            TwinMind
          </h1>
          <p className="mt-6 max-w-4xl text-[clamp(1.2rem,2.2vw,1.7rem)] leading-relaxed text-muted-foreground">
            TwinMind is a personalized AI companion that learns your goals, mood patterns, and habits to help you
            make better decisions, stay consistent, and grow every day.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href={exploreHref}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-7 py-4 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Explore Website
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href={user ? '/dashboard/chat' : '/auth/login'}
              className="rounded-xl border border-border bg-background/75 px-7 py-4 text-base font-semibold text-foreground transition-colors hover:bg-muted"
            >
              {user ? 'Open Chat' : 'Sign In'}
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}
