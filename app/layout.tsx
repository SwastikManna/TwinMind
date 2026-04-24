import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans, Playfair_Display, Sora } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

const plusJakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-inter' })
const sora = Sora({ subsets: ['latin'], variable: '--font-space' })
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-brand', weight: ['700'] })

export const metadata: Metadata = {
  title: 'Saathi - Your AI Saathi',
  description: 'An AI-powered saathi that learns your personality, habits, and goals to provide personalized guidance and decision support.',
  generator: 'v0.app',
  icons: {
    icon: '/faviicon.png',
    shortcut: '/faviicon.png',
    apple: '/faviicon.png',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0d9488' },
    { media: '(prefers-color-scheme: dark)', color: '#0f766e' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background" suppressHydrationWarning>
      <body className={`${plusJakarta.variable} ${sora.variable} ${playfair.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange={false}
        >
          {children}
        </ThemeProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
