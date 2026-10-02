export const AI_AGENT_CONFIG = {
  apiKey: process.env.GEMINI_API_KEY ?? '',
  model: 'gemini-3.8-flash',
  maxOutputTokens: 1024,
} as const;