/**
 * AI Types Domain Migration — Backfill Script
 *
 * Backfills existing catalog_entries into domain tables.
 * Non-destructive: keeps existing catalog IDs intact.
 * Safe to run multiple times (idempotent — skips already-linked entries).
 *
 * Call from server startup or as a tRPC admin endpoint.
 */

import { eq, isNull, and, sql } from "drizzle-orm";
import { getDb } from "../db/connection";
import { catalogEntries, aiTypeModels, aiTypeLlms, providers } from "../../drizzle/schema";
import { linkCatalogToDomain, findCatalogEntryBySource } from "./projection";
import { resolveProviderId } from "./import-normalizer";

export interface MigrationResult {
  scanned: number;
  modelsCreated: number;
  llmsCreated: number;
  providersLinked: number;
  agentsLinked: number;
  skipped: number;
  errors: Array<{ entryId: number; name: string; error: string }>;
  /**
   * 2026-05-23 — count of catalog_entries rows whose `sourceType`
   * was reconciled from the pre-extension drifted value to the
   * canonical one (`"model"` → `"ai_type_model"` when pointing at
   * `ai_type_models.id`; same for `"llm"` → `"ai_type_llm"`). Per
   * `CATALOG_SOURCE_MAPPING.md` 2026-05-23 extension. Idempotent —
   * already-canonical rows are not counted.
   */
  sourceTypeReconciled: number;
}

/**
 * Backfill all catalog_entries that lack a sourceType/sourceId into domain tables.
 *
 * For each catalog_entry:
 * - entryType="model" with no sourceId → create ai_type_models record, set sourceType/sourceId
 * - entryType="llm" with no sourceId → create ai_type_llms record, set sourceType/sourceId
 * - entryType="provider" with no sourceId but has providerId → link to providers table
 * - entryType="agent" with no sourceId → verify agents table link
 */
export async function backfillDomainTables(): Promise<MigrationResult> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const result: MigrationResult = {
    scanned: 0,
    modelsCreated: 0,
    llmsCreated: 0,
    providersLinked: 0,
    agentsLinked: 0,
    skipped: 0,
    errors: [],
    sourceTypeReconciled: 0,
  };

  // Find all catalog entries without sourceId
  const unlinked = await db
    .select()
    .from(catalogEntries)
    .where(isNull(catalogEntries.sourceId));

  result.scanned = unlinked.length;

  for (const entry of unlinked) {
    try {
      const config = (entry.config as Record<string, any>) || {};

      switch (entry.entryType) {
        case "model": {
          // Resolve provider from config
          let providerId: number | null = null;
          if (entry.providerId) {
            providerId = entry.providerId;
          } else if (config.providerId) {
            providerId = await resolveProviderId(config.providerId, config.baseUrl);
          }

          // Create domain record
          const [model] = await db.insert(aiTypeModels).values({
            name: entry.name,
            displayName: entry.displayName ?? entry.name,
            description: entry.description,
            providerId,
            providerSlug: typeof config.providerId === "string" ? config.providerId : config.providerType ?? null,
            modelFamily: config.modelFamily ?? null,
            contextLength: config.contextLength ?? null,
            capabilities: entry.capabilities as string[] ?? null,
            apiModelId: config.model ?? entry.name,
            baseUrl: config.baseUrl ?? null,
            config: config,
            canonicalKey: config.providerId
              ? `${config.providerId}/${entry.name}`
              : null,
            status: entry.status ?? "active",
            createdBy: entry.createdBy,
          }).returning();

          // Link catalog → domain. Canonical sourceType per
          // CATALOG_SOURCE_MAPPING.md 2026-05-23 extension:
          // ai_type_models rows project as sourceType="ai_type_model"
          // (NOT the legacy "model" value, which references models.id).
          await linkCatalogToDomain(entry.id, "ai_type_model", model.id);

          // Also set providerId on catalog entry if we resolved one
          if (providerId && !entry.providerId) {
            await db.update(catalogEntries)
              .set({ providerId })
              .where(eq(catalogEntries.id, entry.id));
          }

          result.modelsCreated++;
          break;
        }

        case "llm": {
          let providerId: number | null = entry.providerId ?? null;
          if (!providerId && config.providerId) {
            providerId = await resolveProviderId(config.providerId, config.baseUrl);
          }

          const [llm] = await db.insert(aiTypeLlms).values({
            name: entry.name,
            displayName: entry.displayName ?? entry.name,
            description: entry.description,
            providerId,
            modelId: null,
            role: config.role ?? null,
            config: config,
            canonicalKey: null,
            status: entry.status ?? "active",
            createdBy: entry.createdBy,
          }).returning();

          // Canonical sourceType per CATALOG_SOURCE_MAPPING.md
          // 2026-05-23 extension: ai_type_llms rows project as
          // sourceType="ai_type_llm".
          await linkCatalogToDomain(entry.id, "ai_type_llm", llm.id);
          result.llmsCreated++;
          break;
        }

        case "provider": {
          // Provider entries should link to the providers table.
          // Try to find matching provider by providerId, name, or config.registryId
          let matchedProviderId: number | null = entry.providerId ?? null;

          if (!matchedProviderId) {
            const allProviders = await db.select().from(providers);
            const match = allProviders.find(p =>
              p.name?.toLowerCase() === entry.name?.toLowerCase() ||
              p.type === (config.registryId || config.providerType)
            );
            if (match) matchedProviderId = match.id;
          }

          if (matchedProviderId) {
            await linkCatalogToDomain(entry.id, "provider", matchedProviderId);

            if (!entry.providerId) {
              await db.update(catalogEntries)
                .set({ providerId: matchedProviderId })
                .where(eq(catalogEntries.id, entry.id));
            }

            result.providersLinked++;
          } else {
            result.skipped++;
          }
          break;
        }

        case "agent": {
          // Agent entries should link to the agents table.
          // Look for matching agent by config.sourceAgentId or name
          const sourceAgentId = config.sourceAgentId;
          if (sourceAgentId && typeof sourceAgentId === "number") {
            await linkCatalogToDomain(entry.id, "agent", sourceAgentId);
            result.agentsLinked++;
          } else {
            result.skipped++;
          }
          break;
        }

        case "bot": {
          // Bot entries — similar to agent
          const sourceBotId = config.sourceBotId;
          if (sourceBotId && typeof sourceBotId === "number") {
            await linkCatalogToDomain(entry.id, "bot", sourceBotId);
          }
          result.skipped++;
          break;
        }

        default:
          result.skipped++;
          break;
      }
    } catch (e: any) {
      result.errors.push({
        entryId: entry.id,
        name: entry.name,
        error: e.message,
      });
    }
  }

  // 2026-05-23 — sourceType reconciliation step. Renames rows
  // pre-existing this extension that wrote `sourceType="model"` /
  // `"llm"` while pointing at `ai_type_models.id` / `ai_type_llms.id`
  // — the conflation the spec extension at the end of
  // `docs/architecture/provider-model-binding/CATALOG_SOURCE_MAPPING.md`
  // corrects. Idempotent: after the rename, the legacy values won't
  // match the WHERE clause on the next run. Safe vs the legitimate
  // `sourceType="model"`/`"llm"` mapping to legacy `models.id` /
  // `llm_authority.id` — the inner-join filter ensures we only
  // rename rows whose sourceId actually resolves to the AI Types
  // domain table.
  // Column names match the live schema's quoted-camelCase columns
  // ("sourceType", "entryType", "sourceId"). Drizzle's `sql\`...\``
  // does NOT auto-translate camelCase → snake_case here — that's
  // only the table-definition mapping. Raw SQL must use the
  // physical column names as quoted identifiers.
  try {
    const modelRename = await db.execute(
      sql`UPDATE catalog_entries
          SET "sourceType" = 'ai_type_model'
          WHERE "sourceType" = 'model'
            AND "entryType" = 'model'
            AND "sourceId" IS NOT NULL
            AND "sourceId" IN (SELECT id FROM ai_type_models)`,
    );
    result.sourceTypeReconciled +=
      (modelRename as unknown as { rowCount?: number }).rowCount ?? 0;
  } catch (e: any) {
    result.errors.push({
      entryId: -1,
      name: "sourceType reconciliation: model → ai_type_model",
      error: e.message,
    });
  }

  try {
    const llmRename = await db.execute(
      sql`UPDATE catalog_entries
          SET "sourceType" = 'ai_type_llm'
          WHERE "sourceType" = 'llm'
            AND "entryType" = 'llm'
            AND "sourceId" IS NOT NULL
            AND "sourceId" IN (SELECT id FROM ai_type_llms)`,
    );
    result.sourceTypeReconciled +=
      (llmRename as unknown as { rowCount?: number }).rowCount ?? 0;
  } catch (e: any) {
    result.errors.push({
      entryId: -1,
      name: "sourceType reconciliation: llm → ai_type_llm",
      error: e.message,
    });
  }

  console.log(
    `[AITypes Migration] Scanned ${result.scanned}: ` +
    `${result.modelsCreated} models, ${result.llmsCreated} LLMs, ` +
    `${result.providersLinked} providers, ${result.agentsLinked} agents linked, ` +
    `${result.skipped} skipped, ${result.errors.length} errors, ` +
    `${result.sourceTypeReconciled} sourceType reconciled`
  );

  return result;
}

/**
 * Verify domain links — check that all sourceType/sourceId references
 * point to existing domain records. Useful for post-migration audit.
 */
export async function verifyDomainLinks(): Promise<{
  total: number;
  linked: number;
  broken: Array<{ entryId: number; name: string; sourceType: string; sourceId: number }>;
}> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const all = await db.select().from(catalogEntries);
  const linked = all.filter(e => e.sourceType && e.sourceId);
  const broken: Array<{ entryId: number; name: string; sourceType: string; sourceId: number }> = [];

  for (const entry of linked) {
    const found = await findCatalogEntryBySource(
      entry.sourceType as any,
      entry.sourceId!
    );
    // findCatalogEntryBySource finds catalog entries, but we want to check domain tables
    // Let's verify the domain table directly
    let exists = false;
    switch (entry.sourceType) {
      case "model": {
        const [m] = await db.select({ id: aiTypeModels.id }).from(aiTypeModels).where(eq(aiTypeModels.id, entry.sourceId!)).limit(1);
        exists = !!m;
        break;
      }
      case "llm": {
        const [l] = await db.select({ id: aiTypeLlms.id }).from(aiTypeLlms).where(eq(aiTypeLlms.id, entry.sourceId!)).limit(1);
        exists = !!l;
        break;
      }
      case "provider": {
        const [p] = await db.select({ id: providers.id }).from(providers).where(eq(providers.id, entry.sourceId!)).limit(1);
        exists = !!p;
        break;
      }
      default:
        exists = true; // agents/bots — assume ok if linked
        break;
    }

    if (!exists) {
      broken.push({
        entryId: entry.id,
        name: entry.name,
        sourceType: entry.sourceType!,
        sourceId: entry.sourceId!,
      });
    }
  }

  return {
    total: all.length,
    linked: linked.length,
    broken,
  };
}
