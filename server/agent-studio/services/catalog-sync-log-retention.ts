/**
 * Catalog Sync Log — retention sweep service.
 *
 * Phase 22 follow-up #633. The `ags_catalog_sync_log` table appends
 * one row per catalog lifecycle event from the AI Types subscriber
 * bus (`aiTypes.catalog.registered` / `published` / `deprecated`).
 * No retention before this PR — rows accumulate forever even though
 * the forensic value of week-old sync events is low.
 *
 * Mirrors pruneOldMcpTransitions (#629) shape — single timestamp +
 * optional union filters. Filters on `receivedAt` (column name on
 * this table, not `createdAt` or `ts`).
 *
 * Additional filter: `eventType` (registered/published/deprecated)
 * for callers who want to preserve `deprecated` events longer
 * (they're the rare-but-important lifecycle endpoints).
 */

import { and, eq, inArray, lt } from "drizzle-orm";
import { getAsDb } from "../db/connection.js";
import { agsCatalogSyncLog } from "../../../drizzle/tables/agent-studio.js";

export type CatalogSyncEventType =
  | "aiTypes.catalog.registered"
  | "aiTypes.catalog.published"
  | "aiTypes.catalog.deprecated";

export interface PruneOldCatalogSyncLogInput {
  readonly olderThan: Date;
  /**
   * Restrict to these event types. Default: all three (registered +
   * published + deprecated). Operators can pass a subset to preserve
   * `deprecated` events (rare lifecycle endpoints).
   *
   * Empty array short-circuits BEFORE the ASDB probe.
   */
  readonly eventTypes?: readonly CatalogSyncEventType[];
  /**
   * Restrict to a single sourceModule (`eq`) or a set (`inArray`).
   */
  readonly sourceModule?: string | readonly string[];
  /**
   * Restrict to a specific catalogEntryId. Single ID only — operators
   * cleaning up the sync trail for one promoted-then-rolled-back
   * entry use this.
   */
  readonly catalogEntryId?: number;
}

export interface PruneOldCatalogSyncLogResult {
  readonly deletedCount: number;
}

export interface PruneOldCatalogSyncLogOptions {
  readonly getDb?: typeof getAsDb;
}

export async function pruneOldCatalogSyncLog(
  input: PruneOldCatalogSyncLogInput,
  options: PruneOldCatalogSyncLogOptions = {},
): Promise<PruneOldCatalogSyncLogResult> {
  if (Array.isArray(input.eventTypes) && input.eventTypes.length === 0) {
    return { deletedCount: 0 };
  }
  if (
    Array.isArray(input.sourceModule) &&
    input.sourceModule.length === 0
  ) {
    return { deletedCount: 0 };
  }

  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return { deletedCount: 0 };

  const filters = [lt(agsCatalogSyncLog.receivedAt, input.olderThan)];

  const evtInput = input.eventTypes;
  if (evtInput !== undefined) {
    filters.push(
      inArray(agsCatalogSyncLog.eventType, evtInput as CatalogSyncEventType[]),
    );
  }
  const srcInput = input.sourceModule;
  if (srcInput !== undefined) {
    if (Array.isArray(srcInput)) {
      filters.push(inArray(agsCatalogSyncLog.sourceModule, srcInput));
    } else {
      filters.push(
        eq(agsCatalogSyncLog.sourceModule, srcInput as string),
      );
    }
  }
  if (input.catalogEntryId !== undefined) {
    filters.push(
      eq(agsCatalogSyncLog.catalogEntryId, input.catalogEntryId),
    );
  }

  const deleted = await db
    .delete(agsCatalogSyncLog)
    .where(and(...filters))
    .returning({ id: agsCatalogSyncLog.id });

  return { deletedCount: deleted.length };
}
