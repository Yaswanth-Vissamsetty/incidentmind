import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { retainBatch } from '../services/hindsight.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const incidents = JSON.parse(await readFile(join(root, 'data', 'incidents.json'), 'utf8'));

function narrative(incident) {
  const fixes = incident.attempted_fixes.map(({ step, result }) => `${result.toUpperCase()}: ${step}`).join('; ');
  return [
    `Incident ${incident.id} (${incident.severity}) occurred on ${incident.timestamp} in ${incident.service}.`,
    `Alert: ${incident.alert}.`,
    `Evidence: ${incident.logs.slice(0, 2).join(' | ')}.`,
    `Root cause: ${incident.root_cause}`,
    `Attempted fixes: ${fixes}.`,
    `Resolution: ${incident.resolution_steps.join(' → ')}.`,
    `Runbook: ${incident.runbook}. Resolved in ${incident.minutes_to_resolve} minutes by ${incident.engineer}.`
  ].join(' ');
}

export async function seedAll() {
  const items = incidents.map((incident) => ({
    content: narrative(incident),
    timestamp: incident.timestamp,
    context: `production incident for ${incident.service}`,
    documentId: incident.id,
    metadata: {
        incident_id: incident.id,
        service: incident.service,
        severity: incident.severity,
        runbook: incident.runbook,
        failed_fixes: incident.attempted_fixes.filter((fix) => fix.result === 'failed').map((fix) => fix.step).join(' | '),
        kind: 'seeded-incident'
    }
  }));
  await retainBatch(items);
  return incidents.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const count = await seedAll();
    console.log(`[seed] completed ${count} incidents; re-running safely replaces each document by incident ID.`);
  } catch (error) {
    console.error(`[seed] failed: ${error.message}`);
    process.exitCode = 1;
  }
}
