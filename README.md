# TwinMind

TwinMind is a Next.js app for a personalized AI "digital twin" experience with:
- Supabase auth and user data
- Personalized chat endpoint powered by OpenAI
- Goals, memory logs, and insights dashboards

## Local Setup

1. Install dependencies:
```bash
pnpm install
```

2. Create local env file:
```bash
cp .env.example .env.local
```

3. Fill required variables in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- One AI key:
  - `GROQ_API_KEY` (recommended for free-tier usage)
  - or `OPENAI_API_KEY`

4. Run the database schema in Supabase SQL Editor:
- `scripts/001_create_twinmind_schema.sql`

5. Start development:
```bash
pnpm dev
```

## Vercel + Supabase Integration

This repo supports Vercel Marketplace Supabase integration.

### Link project
```bash
vercel link --yes --scope <team> --project <project-name>
```

### Install and connect Supabase integration
```bash
vercel integration add supabase --scope <team>
```

### Pull env vars from Vercel
```bash
vercel env pull .env.local --yes
```

### Add missing OpenAI key in Vercel
```bash
vercel env add OPENAI_API_KEY production preview development
```

### Or add Groq key (free tier)
```bash
vercel env add GROQ_API_KEY production preview development
```

### Deploy
```bash
vercel --prod
```
