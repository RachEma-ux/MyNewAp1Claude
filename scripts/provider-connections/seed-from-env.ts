#!/usr/bin/env tsx
/**
 * Provider Connections — boot-time seed from environment variables.
 *
 * Plan v3 Phase 5 — the ONE legitimate reader of provider API keys
 * from `process.env`. Decision D1 (DECISION_RECORD.md) forbids
 * runtime code from reading provider keys; this script is a one-shot
 * boot/import path that:
 *
 *   1. Reads provider env vars (OPENAI_API_KEY, ANTHROPIC_API_KEY,
 *      GOOGLE_API_KEY, GROQ_API_KEY) from `process.env`.
 *   2. Validates each key against its provider (lightweight HTTP
 *      probe — `/v1/models` or equivalent).
 *   3. Creates an encrypted Provider Connection row through the
 *      Provider Connections public surface.
 *   4. Exits.
 *
 * Phase 5 status: stub only. The full implementation lands in Phase
 * 9–10 once the Provider Connections write-side surface is in place.
 * The file exists now so:
 *
 *   - `check:provider-key-env-boundary` has a concrete allowlisted
 *     path to whitelist (vs an aspirational reference).
 *   - The `_core/index.ts` `autoProvisionProviders` block has a
 *     visible target for extraction in Phase 10.
 *
 * Do NOT add any runtime code that reads provider env vars before
 * this script is fully implemented. The boundary check will fail
 * the build instead.
 */

async function main(): Promise<void> {
  console.error(
    "scripts/provider-connections/seed-from-env.ts is a Phase 5 stub. " +
      "Full implementation lands in Phase 9–10. Run the legacy " +
      "`server/_core/index.ts` autoProvisionProviders boot path until then.",
  );
  process.exit(2);
}

void main();
