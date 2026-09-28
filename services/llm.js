import 'dotenv/config';

const MODELS = ['openai/gpt-oss-120b', 'qwen/qwen3-32b'];
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const TIMEOUT_MS = 20_000;

function stripAndParse(value) {
  const clean = String(value || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const candidate = clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1);
  return JSON.parse(candidate);
}

async function request(model, messages) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ model, messages, temperature: 0.15, response_format: { type: 'json_object' } })
    });
    if (!response.ok) throw new Error(`Groq returned ${response.status}`);
    const body = await response.json();
    return stripAndParse(body.choices?.[0]?.message?.content);
  } finally {
    clearTimeout(timeout);
  }
}

export async function completeJson(messages) {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is required');
  let lastError;
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const data = await request(model, messages);
        return { data, model };
      } catch (error) {
        lastError = error;
        console.warn(`[${new Date().toISOString()}] llm model=${model} attempt=${attempt + 1} failed: ${error.message}`);
      }
    }
  }
  throw new Error(`LLM unavailable after primary and fallback attempts: ${lastError?.message || 'unknown error'}`);
}

export async function checkGroq() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, signal: controller.signal
    });
    if (!response.ok) throw new Error(`Groq returned ${response.status}`);
    return true;
  } finally {
    clearTimeout(timeout);
  }
}
