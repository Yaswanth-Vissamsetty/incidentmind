import 'dotenv/config';
import { ensureBank, retain, recall } from '../services/hindsight.js';

const documentId = 'incidentmind-api-smoke-v1';
const marker = 'incidentmind-memory-smoke-20260928';

try {
  await ensureBank();
  await retain(`IncidentMind API verification: ${marker}. The memory bank can retain and recall a production incident note.`, {
    context: 'IncidentMind API smoke test',
    documentId,
    metadata: { kind: 'smoke-test', marker }
  });
  const response = await recall(marker, { maxTokens: 1000 });
  const matched = response.results?.some((result) => result.text?.includes(marker) || result.metadata?.marker === marker);
  if (!matched) throw new Error('Retain completed but the smoke-test marker was not recalled.');
  console.log(`Hindsight retain → recall succeeded (${response.results.length} memory result(s)).`);
} catch (error) {
  console.error(`Hindsight smoke test failed: ${error.message}`);
  process.exitCode = 1;
}
