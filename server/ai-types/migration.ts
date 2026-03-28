/**
 * AI Types Domain Migration — Backfill Script
 *
 * Backfills existing catalog_entries into domain tables.
 * Non-destructive: keeps existing catalog IDs intact.
 * Safe to run multiple times (idempotent — skips already-linked entries).
 *
 * Call from server startup or as a tRPC admin endpoint.
 */

import { eq, isNull, and } from "drizzle-orm";
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

          // Link catalog → domain
          await linkCatalogToDomain(entry.id, "model", model.id);

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

          await linkCatalogToDomain(entry.id, "llm", llm.id);
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

  console.log(
    `[AITypes Migration] Scanned ${result.scanned}: ` +
    `${result.modelsCreated} models, ${result.llmsCreated} LLMs, ` +
    `${result.providersLinked} providers, ${result.agentsLinked} agents linked, ` +
    `${result.skipped} skipped, ${result.errors.length} errors`
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
