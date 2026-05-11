/**
 * Phase 15 — boot-time row seeds for blessed vault templates.
 *
 * Wires the pure seed-data module `services/vault/seed-default-
 * templates.ts` to the §1 `createTemplate()` writer for the global
 * scope (vaultId=null). Idempotent on every call — `createTemplate`
 * returns the existing row when `(vaultId, templateKey)` already
 * matches, so re-running this seeder is a no-op other than logging.
 *
 * Boot call site: `bootAgentStudio()` after `seedAsDb()` provisions
 * the underlying tables. Failures per-row are logged but do not
 * abort boot.
 *
 * ADR: docs/architecture/agent-studio-markdown-profile.md
 */

import { getAsDb } from "./connection.js";
import { DEFAULT_VAULT_TEMPLATES } from "../services/vault/seed-default-templates.js";
import { createTemplate } from "../services/vault/templates.js";

export interface VaultTemplateSeedResult {
  inserted: number;
  alreadyExisting: number;
  failed: number;
}

export async function seedVaultTemplateRows(): Promise<VaultTemplateSeedResult> {
  const result: VaultTemplateSeedResult = {
    inserted: 0,
    alreadyExisting: 0,
    failed: 0,
  };

  const db = getAsDb();
  if (!db) {
    // Skip silently — boot.ts logs the pool-missing case once at
    // the `seedAsDb()` step, no need to re-warn here.
    return result;
  }

  for (const seed of DEFAULT_VAULT_TEMPLATES) {
    try {
      const row = await createTemplate({
        vaultId: null,
        templateKey: seed.templateKey,
        name: seed.name,
        contentMd: seed.contentMd,
        frontmatterDefaults: seed.frontmatterDefaults ?? null,
      });
      if (row.created) result.inserted++;
      else result.alreadyExisting++;
    } catch (e) {
      result.failed++;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(
        `[ASDB] Vault template seed failed for "${seed.templateKey}" — ${msg}`,
      );
    }
  }

  return result;
}
