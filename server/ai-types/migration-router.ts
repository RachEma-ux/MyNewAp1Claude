/**
 * AI Types Migration Router
 *
 * Operator-callable surface for the AI Types domain backfill. Mirrors
 * the existing `taxonomy.seedTaxonomy` pattern — an `adminProcedure`
 * mutation that calls into the module's pure migration code.
 *
 * Namespace: trpc.aiTypes.migration.*
 *
 * Boot-time invocation lives in `./boot.ts`; this router exists so
 * operators can re-run the backfill from `/ai-types/overview`
 * without restarting the server (e.g. after manually inserting
 * `catalog_entries` rows). The fn is idempotent per its doc-comment,
 * so both call sites are safe to invoke repeatedly.
 */

import { adminProcedure, router } from "../_core/trpc";
import { backfillDomainTables } from "./migration";

export const migrationRouter = router({
  /**
   * Backfill `ai_type_models` / `ai_type_llms` from existing
   * `catalog_entries` rows that lack a `sourceType`/`sourceId` link.
   * Returns the per-pass summary so the UI can render a result card.
   */
  backfillDomainTables: adminProcedure.mutation(async () => {
    return await backfillDomainTables();
  }),
});
