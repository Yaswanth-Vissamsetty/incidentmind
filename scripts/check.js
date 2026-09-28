import 'dotenv/config';
import { recall, ensureBank } from '../services/hindsight.js';
import { checkGroq, completeJson } from '../services/llm.js';

const required = ['HINDSIGHT_API_KEY', 'HINDSIGHT_BASE_URL', 'GROQ_API_KEY'];
const checks = [];

function pass(label, ok, detail = '') {
  const status = ok ? 'PASS' : 'FAIL';
  checks.push({ label, status, detail });
  console.log(`${status} ${label}${detail ? ': ' + detail : ''}`);
}

async function main() {
  for (const key of required) {
    const ok = Boolean(process.env[key] && String(process.env[key]).trim());
    pass(`env ${key}`, ok, ok ? 'present' : 'missing');
  }

  try {
    await ensureBank();
    pass('hindsight bank ready', true, 'bank check passed');
  } catch (error) {
    pass('hindsight bank ready', false, error.message);
  }

  try {
    const ok = await checkGroq();
    pass('groq connectivity', ok, ok ? 'reachable' : 'not reachable');
  } catch (error) {
    pass('groq connectivity', false, error.message);
  }

  try {
    const response = await recall('connection pool exhausted after deploy', { maxTokens: 300, budget: 'low' });
    const found = Array.isArray(response?.results) && response.results.length > 0;
    pass('seeded memory recall', found, found ? `${response.results.length} results returned` : 'no results returned');
  } catch (error) {
    pass('seeded memory recall', false, error.message);
  }

  const failed = checks.some((item) => item.status === 'FAIL');
  if (failed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('FAIL runtime validation', error.message);
  process.exitCode = 1;
});
