# IncidentMind implementation plan

## Step 0 — Hindsight findings (verified 2026-09-28)

1. The official Node client exists: `@vectorize-io/hindsight-client`; initialize `new HindsightClient({ baseUrl })`.
2. A bank can be explicitly created with `client.createBank('incidentmind', { name, mission, disposition })`; retain also auto-creates a bank on first write.
3. Retain is `client.retain(bankId, content, { timestamp, context, metadata, documentId, async })`; `documentId` makes seeding idempotent.
4. Recall is `client.recall(bankId, query, { maxTokens, budget, types })`, returning `response.results` with `text`, `metadata`, and `documentId`.
5. Reflect is `client.reflect(bankId, query, { budget, context })`; it returns synthesized, memory-grounded text (optional stretch use only).
6. The documented HTTP paths are scoped under `/v1/default/banks/{bank_id}` and authenticated requests use `Authorization: Bearer <API key>`.
7. I will use the official client so its documented request shape and auth configuration are preserved rather than hand-rolling HTTP.

Sources: [Node SDK](https://hindsight.vectorize.io/sdks/nodejs), [Memory banks](https://hindsight.vectorize.io/developer/api/memory-banks), [Retain](https://hindsight.vectorize.io/developer/api/retain), [Recall](https://hindsight.vectorize.io/developer/api/recall), [Reflect](https://hindsight.vectorize.io/developer/api/reflect).

## Build order after approval

1. Create the Node/Express scaffold, `.gitignore`, `.env.example`, and Hindsight wrapper; run one isolated retain → recall round trip against the configured `incidentmind` bank and pause with the result.
2. Add exactly 18 realistic, linked incidents in `data/incidents.json` and an idempotent `scripts/seed.js` that retains one natural-language, metadata-tagged memory per incident.
3. Implement Groq JSON generation with 20-second aborts, two retries, fallback model, JSON fence repair, and safe error objects; connect the memory-aware agent and all requested API endpoints with validation and timestamped operational logs.
4. Exercise health, seed, Memory OFF/ON analysis, and compare endpoints from the terminal using the supplied checkout alert.
5. Build the responsive dark single-page dashboard, then test its full compare and recalled-memory presentation in the browser and capture the requested OFF/ON screenshots.
6. Test the feedback outcome loop end-to-end: save a worked outcome, recall it, and re-run the identical alert to confirm it appears as learning evidence.
7. Write the README (pitch, Mermaid architecture, setup, exact demo script, and memory lifecycle), then hand over run commands, demo curl, screenshots, and explicit assumptions.

## Scope and safeguards

- Plain ES-module JavaScript, Express, vanilla HTML/CSS/JS only; no auth, database, Docker, or auto-remediation.
- Secrets stay exclusively in `.env`, are loaded through `dotenv`, and never appear in logs, code, git, screenshots, or this plan.
- The agent will whitelist `INC-xxx` citations from recalled-memory metadata, preventing invented incident IDs.
