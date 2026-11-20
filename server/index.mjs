// Tiny API for the app. Run: npm run server   (Vite proxies /api -> :8787 in dev)
import express from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { extractSyllabusFacts, ExtractError } from './extractor.mjs'

const app = express()
app.use(express.json({ limit: '35mb' })) // API limit is 32 MB per request

const hasCredentials = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)

app.get('/api/health', (_req, res) => res.json({ ok: true, ai: hasCredentials() }))

app.post('/api/extract', async (req, res) => {
  const { pdfBase64, today, term } = req.body ?? {}
  if (!pdfBase64) return res.status(400).json({ error: 'Missing pdfBase64' })
  if (!hasCredentials()) return res.status(503).json({ error: 'AI extraction is off: add ANTHROPIC_API_KEY to .env, then restart `npm run server`. Or click Remove PDF and paste the syllabus text instead.' })
  try {
    const facts = await extractSyllabusFacts(pdfBase64, { today: today ?? new Date().toISOString().slice(0, 10), term: term ?? 'current' })
    res.json(facts)
  } catch (err) {
    if (err instanceof ExtractError) return res.status(err.status).json({ error: err.message })
    if (err instanceof Anthropic.AuthenticationError) return res.status(500).json({ error: 'Server has no valid ANTHROPIC_API_KEY.' })
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'Rate limited. Try again in a minute.' })
    if (err instanceof Anthropic.BadRequestError) return res.status(400).json({ error: `Claude API rejected the request: ${err.message}` })
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: `Claude API error ${err.status}: ${err.message}` })
    console.error(err)
    res.status(500).json({ error: 'Extraction failed. See server log.' })
  }
})

const PORT = process.env.PORT ?? 8787
app.listen(PORT, '127.0.0.1', () => console.log(`SemesterOS API on http://127.0.0.1:${PORT} (AI ${hasCredentials() ? 'enabled' : 'DISABLED: set ANTHROPIC_API_KEY in .env'})`))
