import { createOpenAI } from '@ai-sdk/openai'
import { createGroq } from '@ai-sdk/groq'

const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5'

export function getLanguageModel() {
  const groqKey = process.env.GROQ_API_KEY
  if (groqKey) {
    const groq = createGroq({ apiKey: groqKey })
    return groq(DEFAULT_GROQ_MODEL)
  }

  const openaiKey = process.env.OPENAI_API_KEY
  if (openaiKey) {
    const openai = createOpenAI({ apiKey: openaiKey })
    return openai(DEFAULT_OPENAI_MODEL)
  }

  throw new Error(
    'No AI provider configured. Set GROQ_API_KEY (recommended free tier) or OPENAI_API_KEY.',
  )
}

export function getObjectGenerationProviderOptions() {
  if (process.env.GROQ_API_KEY) {
    return {
      groq: {
        structuredOutputs: false,
      },
    }
  }

  return undefined
}
