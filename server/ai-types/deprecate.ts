/**
 * AI Types Catalog Deprecate Service
 *
 * Direction B B2b — formal deprecate transition for `catalog_entries`.
 * Locked by `docs/architecture/ai-types/CATALOG_LIFECYCLE_EVENT_DECISION.md`
 * (D-LC-3 / D-LC-4).
 *
 * Owns the only path that emits `aiTypes.catalog.deprecated`. Bare
 * `updateCatalogEntry({ status: "deprecated" })` writes remain possible
 * but do NOT emit. Callers that want subscribers (Agent Studio sync)
 * to react MUST go through `deprecateCatalogEntry`.
 *
 * Server-internal for B2b — no Module Gateway action, no tRPC procedure,
 * no UI button (D-LC-5). The first concrete cross-module caller will
 * land in B3 or later.
 */

import {
  getCatalogEntryById,
  updateCatalogEntry,
  createCatalogAuditEvent,
} from "./db";
import { deriveSourceModule } from "./register";
import {
  AI_TYPES_EVENTS,
  type CatalogDeprecatedPayload,
} from "./events";
import { makeEnvelope, publishEvent } from "../platform/events";

export interface DeprecateCatalogEntryInput {
  catalogEntryId: number;
  deprecatedBy: number;
  /** Free-form reason or short reason code; persisted on the audit row and on the event payload. */
  reason?: string;
}

export interface DeprecateCatalogEntryResult {
  catalogEntryId: number;
  /** True when this call performed the transition; false when the row was already deprecated (no-op). */
  transitioned: boolean;
  priorStatus: string | null;
}

/**
 * Deprecate a catalog entry. Throws if the entry does not exist.
 *
 * Idempotent: if `entry.status === "deprecated"` already, returns
 * `{ transitioned: false }` without writing a DB row, audit event, or
 * emitting the bus event. This prevents subscriber storms when retries
 * land on the same entry.
 */
export async function deprecateCatalogEntry(
  input: DeprecateCatalogEntryInput,
): Promise<DeprecateCatalogEntryResult> {
  const entry = await getCatalogEntryById(input.catalogEntryId);
  if (!entry) {
    throw new Error(`Catalog entry ${input.catalogEntryId} not found`);
  }

  if (entry.status === "deprecated") {
    return {
      catalogEntryId: input.catalogEntryId,
      transitioned: false,
      priorStatus: "deprecated",
    };
  }

  const priorStatus = entry.status;

  await updateCatalogEntry(
    input.catalogEntryId,
    { status: "deprecated" },
    input.deprecatedBy,
  );

  await createCatalogAuditEvent({
    eventType: "catalog.deprecate",
    catalogEntryId: input.catalogEntryId,
    actor: input.deprecatedBy,
    actorType: "user",
    payload: { reason: input.reason ?? null, priorStatus },
  });

  const payload: CatalogDeprecatedPayload = {
    catalogEntryId: input.catalogEntryId,
    reason: input.reason ?? null,
    sourceModule: deriveSourceModule(entry.sourceType ?? ""),
    sourceRefId: entry.sourceId ?? null,
    performedByActorId: input.deprecatedBy,
    performedByActorType: "user",
    workspaceId: null,
    deprecatedAt: new Date().toISOString(),
  };
  try {
    await publishEvent(
      makeEnvelope({
        eventType: AI_TYPES_EVENTS.catalogDeprecated,
        sourceModule: "aiTypes",
        workspaceId: null,
        actorId: input.deprecatedBy,
        payload,
      }),
    );
  } catch (err) {
    console.warn(
      `[deprecate] event '${AI_TYPES_EVENTS.catalogDeprecated}' failed for entry ${input.catalogEntryId}:`,
      err instanceof Error ? err.message : err,
    );
  }

  return {
    catalogEntryId: input.catalogEntryId,
    transitioned: true,
    priorStatus,
  };
}
