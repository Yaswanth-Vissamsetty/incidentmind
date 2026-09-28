import 'dotenv/config';
import { HindsightClient } from '@vectorize-io/hindsight-client';

const BANK_ID = 'incidentmind';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

// The official client owns the documented Hindsight request format and auth flow.
function client() {
  return new HindsightClient({
    baseUrl: required('HINDSIGHT_BASE_URL'),
    apiKey: required('HINDSIGHT_API_KEY')
  });
}

export async function ensureBank() {
  const hindsight = client();
  try {
    await hindsight.createBank(BANK_ID, {
      name: 'IncidentMind',
      mission: 'Remember production incidents, evidence, failed mitigations, successful fixes, and runbooks. Prefer evidence-grounded incident response.',
      disposition: { skepticism: 4, literalism: 4, empathy: 3 }
    });
  } catch (error) {
    // A pre-existing bank is healthy; surface only unexpected failures to callers.
    if (!/already exists|conflict|409/i.test(error.message)) throw error;
  }
  return BANK_ID;
}

export async function retain(content, options = {}) {
  await ensureBank();
  return client().retain(BANK_ID, content, { async: false, ...options });
}

export async function retainBatch(items, options = {}) {
  await ensureBank();
  return client().retainBatch(BANK_ID, items, { async: false, ...options });
}

export async function recall(query, options = {}) {
  return client().recall(BANK_ID, query, { budget: 'mid', maxTokens: 3500, ...options });
}

export async function checkHindsight() {
  // Cloud deployments may not expose the optional version route; recall validates
  // the authenticated bank path used by IncidentMind itself.
  return client().recall(BANK_ID, 'IncidentMind health check', { maxTokens: 64, budget: 'low' });
}

export { BANK_ID };
