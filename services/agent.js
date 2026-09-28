import { recall, retain } from './hindsight.js';
import { completeJson } from './llm.js';

const schema = '{"root_cause":"string","confidence":"low|medium|high","fix_steps":["string"],"based_on":["INC-000"],"warnings":["string"],"reasoning":"string"}';

function fallback(message) {
  return { root_cause: 'Unable to determine root cause safely.', confidence: 'low', fix_steps: ['Check service health, recent deploys, and the alert evidence before making changes.'], based_on: [], warnings: [message], reasoning: 'The analysis service returned a safe fallback instead of an unverified diagnosis.' };
}

function uniqueMemories(results = []) {
  const incidentIds = new Set();
  const outcomeKeys = new Set();
  const incidents = results.filter((memory) => {
    const id = memory.metadata?.incident_id;
    if (!id || incidentIds.has(id)) return false;
    incidentIds.add(id);
    return true;
  });
  const outcomes = results.filter((memory) => {
    const key = memory.metadata?.outcome_id || memory.documentId || memory.text;
    if (memory.metadata?.kind !== 'outcome' || outcomeKeys.has(key)) return false;
    outcomeKeys.add(key);
    return true;
  });
  return [...incidents.slice(0, 6), ...outcomes.slice(0, 2)];
}

function normalizeAnalysis(value, allowedIds, historyWarnings = [], useMemory = false) {
  if (!value || typeof value !== 'object') return fallback('Malformed LLM response.');
  const confidence = ['low', 'medium', 'high'].includes(value.confidence) ? value.confidence : 'low';
  return {
    root_cause: String(value.root_cause || 'Insufficient evidence for a root cause.'),
    confidence,
    fix_steps: Array.isArray(value.fix_steps) ? value.fix_steps.map(String).slice(0, 6) : [],
    based_on: useMemory
      ? [...new Set([...(Array.isArray(value.based_on) ? value.based_on.filter((id) => allowedIds.has(id)) : []), ...[...allowedIds]])].slice(0, 3)
      : [],
    warnings: [...new Set([...(Array.isArray(value.warnings) ? value.warnings.map(String) : []), ...historyWarnings])].slice(0, 5),
    reasoning: String(value.reasoning || 'No reasoning returned.')
  };
}

export async function analyzeAlert({ service, alert, logs, useMemory }) {
  const started = Date.now();
  let recalled = [];
  let historyWarnings = [];
  try {
    if (useMemory) {
      const response = await recall(`${service}\nAlert: ${alert}\nKey logs:\n${logs}`, { maxTokens: 2800 });
      recalled = uniqueMemories(response.results);
      historyWarnings = response.results
        .filter((item) => item.metadata?.incident_id && /\bfailed\b/i.test(item.text || ''))
        .map((item) => `Past incident ${item.metadata.incident_id} recorded a failed mitigation: ${item.text}`)
        .slice(0, 3);
      const metadataWarnings = response.results
        .filter((item) => item.metadata?.incident_id && item.metadata.failed_fixes)
        .map((item) => `Past incident ${item.metadata.incident_id}: do not repeat without new evidence — ${item.metadata.failed_fixes} failed.`);
      historyWarnings = [...new Set([...historyWarnings, ...metadataWarnings])].slice(0, 3);
      console.log(`[${new Date().toISOString()}] recall count=${recalled.length} service=${service}`);
    }
    const allowedIds = new Set(recalled.map((item) => item.metadata.incident_id));
    const history = useMemory
      ? recalled.map((item) => item.metadata?.incident_id ? `[${item.metadata.incident_id}] ${item.text}` : `[OUTCOME LEARNING — ${item.metadata?.result || 'recorded'}] ${item.text}`).join('\n') || 'No close incident history was recalled.'
      : 'No incident history is available. Do not cite any incident IDs.';
    const messages = [
      { role: 'system', content: `You are an exacting senior SRE. Return JSON only matching ${schema}. ${useMemory ? 'Use recalled history as evidence. Cite only incident IDs shown in the history. Prefer fixes explicitly marked WORKED, warn about FAILED fixes, and lower confidence with weak matches.' : 'Give safe generic triage based only on the alert and logs. based_on must be empty; do not invent history.'}` },
      { role: 'user', content: `Service: ${service}\nAlert: ${alert}\nLogs:\n${logs}\n\nRecalled history:\n${history}` }
    ];
    const { data, model } = await completeJson(messages);
    const analysis = normalizeAnalysis(data, allowedIds, historyWarnings, useMemory);
    const latency_ms = Date.now() - started;
    console.log(`[${new Date().toISOString()}] analysis mode=${useMemory ? 'on' : 'off'} model=${model} latency_ms=${latency_ms}`);
    return { analysis, recalled, latency_ms, model };
  } catch (error) {
    const latency_ms = Date.now() - started;
    console.error(`[${new Date().toISOString()}] analysis failed: ${error.message}`);
    return { analysis: fallback('Analysis temporarily unavailable; no remediation was executed.'), recalled, latency_ms, model: null };
  }
}

export async function storeOutcome({ service, alert, recommended_fix, result, notes }) {
  const outcomeId = `outcome-${Date.now()}`;
  const content = `Outcome for alert '${alert}' on ${service}: recommended fix '${recommended_fix}' -> ${result.toUpperCase()}. Notes: ${notes || 'No notes supplied.'}. This outcome is operational evidence; ${result === 'failed' ? 'warn future responders not to repeat this failed fix without new evidence.' : 'future responders may use it as supporting evidence.'}`;
  await retain(content, { context: 'engineer feedback outcome', documentId: outcomeId, metadata: { kind: 'outcome', outcome_id: outcomeId, service, result } });
  console.log(`[${new Date().toISOString()}] outcome retained service=${service} result=${result}`);
}
