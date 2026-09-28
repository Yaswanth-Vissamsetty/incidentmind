import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeAlert, storeOutcome } from './services/agent.js';
import { checkHindsight } from './services/hindsight.js';
import { checkGroq } from './services/llm.js';
import { seedAll } from './scripts/seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const REQUIRED_ENV = ['HINDSIGHT_API_KEY', 'HINDSIGHT_BASE_URL', 'GROQ_API_KEY'];
const rateLimitWindowMs = 60_000;
const rateLimitMax = 30;
const requestBuckets = new Map();

function missingEnvVars() {
  return REQUIRED_ENV.filter((name) => !process.env[name] || !String(process.env[name]).trim());
}

function rateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const bucket = requestBuckets.get(ip) || [];
  const recent = bucket.filter((timestamp) => now - timestamp < rateLimitWindowMs);
  if (recent.length >= rateLimitMax) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and retry.' });
  }
  recent.push(now);
  requestBuckets.set(ip, recent);
  next();
}

function validAlert(body) {
  return body && ['checkout-service', 'auth-service', 'payments-gateway', 'search-api', 'inventory-db'].includes(body.service) && typeof body.alert === 'string' && body.alert.trim().length >= 5 && typeof body.logs === 'string' && body.logs.trim().length >= 5;
}

const missing = missingEnvVars();
if (missing.length > 0) {
  console.error(`[startup] Missing required environment variable(s): ${missing.join(', ')}. Set them before starting the app.`);
  process.exit(1);
}

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.get('/api/health', async (_req, res) => {
  const [hindsight, groq] = await Promise.allSettled([checkHindsight(), checkGroq()]);
  const healthy = hindsight.status === 'fulfilled' && groq.status === 'fulfilled';
  res.status(healthy ? 200 : 503).json({ healthy, hindsight: hindsight.status, groq: groq.status });
});

app.post('/api/analyze', rateLimit, async (req, res) => {
  if (!validAlert(req.body)) return res.status(400).json({ error: 'service, alert (5+ chars), and logs (5+ chars) are required.' });
  try {
    const useMemory = req.query.memory !== 'off';
    const result = await analyzeAlert({ ...req.body, useMemory });
    res.json({ mode: useMemory ? 'on' : 'off', analysis: result.analysis, recalled: useMemory ? result.recalled : [], latency_ms: result.latency_ms });
  } catch (_error) {
    res.status(502).json({ error: 'Unable to analyze the alert. Please try again.' });
  }
});

app.post('/api/compare', rateLimit, async (req, res) => {
  if (!validAlert(req.body)) return res.status(400).json({ error: 'service, alert (5+ chars), and logs (5+ chars) are required.' });
  try {
    const [off, on] = await Promise.all([analyzeAlert({ ...req.body, useMemory: false }), analyzeAlert({ ...req.body, useMemory: true })]);
    res.json({ off: { mode: 'off', analysis: off.analysis, recalled: [], latency_ms: off.latency_ms }, on: { mode: 'on', analysis: on.analysis, recalled: on.recalled, latency_ms: on.latency_ms } });
  } catch (_error) {
    res.status(502).json({ error: 'Unable to compare memory modes. Please try again.' });
  }
});

app.post('/api/outcome', rateLimit, async (req, res) => {
  const { service, alert, recommended_fix, result, notes = '' } = req.body || {};
  if (!['checkout-service', 'auth-service', 'payments-gateway', 'search-api', 'inventory-db'].includes(service) || !alert || !recommended_fix || !['worked', 'partial', 'failed'].includes(result) || typeof notes !== 'string') return res.status(400).json({ error: 'service, alert, recommended_fix, result (worked|partial|failed), and optional notes are required.' });
  try {
    await storeOutcome({ service, alert, recommended_fix, result, notes });
    res.status(201).json({ saved: true, message: 'Saved to Hindsight memory.' });
  } catch (_error) {
    res.status(502).json({ error: 'Unable to save outcome. Please try again.' });
  }
});

app.post('/api/seed', async (_req, res) => {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== 'true') {
    return res.status(403).json({ error: 'Seeding is disabled in production. Set ALLOW_SEED=true to enable it.' });
  }
  try {
    const count = await seedAll();
    res.json({ seeded: count, idempotent: true });
  } catch (_error) {
    res.status(502).json({ error: 'Unable to seed Hindsight. Please try again.' });
  }
});

app.listen(port, '0.0.0.0', () => console.log(`[${new Date().toISOString()}] IncidentMind listening on http://0.0.0.0:${port}`));
