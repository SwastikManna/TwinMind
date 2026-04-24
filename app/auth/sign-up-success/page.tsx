import Link from 'next/link'
import { Brain, Mail, ArrowRight } from 'lucide-react'

export default function SignUpSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-6">
          <Mail className="w-10 h-10 text-primary" />
        </div>
        
        <h1 className="text-3xl font-bold text-foreground mb-3" style={{ fontFamily: 'var(--font-display)' }}>
          Check Your Email
        </h1>
        
        <p className="text-muted-foreground mb-8 leading-relaxed">
          We&apos;ve sent you a confirmation link. Click the link in your email to activate your account and start creating your digital twin.
        </p>

        <div className="bg-card rounded-2xl p-6 shadow-lg border border-border mb-6">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
              <Brain className="w-6 h-6 text-accent" />
            </div>
            <div className="text-left">
              <p className="font-medium text-foreground">What happens next?</p>
              <p className="text-sm text-muted-foreground">
                After confirming, you&apos;ll set up your twin&apos;s personality
              </p>
            </div>
          </div>
        </div>

        <Link
          href="/auth/login"
          className="inline-flex items-center gap-2 text-primary hover:underline font-medium"
        >
          Back to login
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
