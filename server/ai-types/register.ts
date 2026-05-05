/**
 * Plan v3 Phase 25 — `aiTypes.catalog.register` action.
 *
 * Canonical write path for catalog_entries. Replaces the ad-hoc pattern
 * where domain routers (`server/routers/agents.ts`, `server/llm/authority.ts`,
 * `server/modules/pmt/*`) called `createCatalogEntry()` directly.
 *
 * Flow:
 *   1. Run `checkDuplicateLegacyImport` against `(sourceType, sourceId)`.
 *      - `would_duplicate_legacy` → throw. Caller must use `aiTypes.catalog.update`
 *        (modern row) or `reconcileLegacyImport` (legacy unresolved).
 *      - `modern_row_update_path` → call `updateCatalogEntry` on the existing id.
 *      - `no_existing_row` → call `createCatalogEntry`.
 *   2. Return `{entryId, action, legacyImportState}` so callers can branch on
 *      whether they wrote a new row or updated an existing one.
 *
 * Receipt requirement: register is `medium`-risk + `receiptRequired: true` per
 * Phase 20's receipt policy. Internal AI Types code paths (publishing.ts,
 * projection.ts) bypass register and call `createCatalogEntry`/`updateCatalogEntry`
 * directly — those are intra-module and not subject to the boundary.
 */

import {
  checkDuplicateLegacyImport,
  type DuplicateGuardResult,
} from "./legacy-import";
import {
  createCatalogEntry,
  updateCatalogEntry,
  getCatalogEntryById,
  createCatalogAuditEvent,
} from "./db";
import { makeEnvelope, publishEvent } from "../platform/events";
import {
  AI_TYPES_EVENTS,
  type CatalogRegisteredPayload,
} from "./events";
import type { CatalogEntry, InsertCatalogEntry } from "../../drizzle/schema";

export interface RegisterCatalogEntryInput {
  /** Domain type the entry represents: llm | model | bot | agent | provider. */
  entryType: string;
  /** Source-of-record kind. Required — the register path is for source-linked entries only. */
  sourceType: string;
  /** Source-of-record row id. Required. */
  sourceId: number;
  /** All other catalog fields (name, displayName, description, config, tags, etc.). */
  fields: Omit<InsertCatalogEntry, "entryType" | "sourceType" | "sourceId">;
  /** User id (or system actor) who initiated the register call. */
  registeredBy: number;
  /**
   * Plan v3 Phase 39 — module that initiated the register call. Used as the
   * `sourceModule` field in the `aiTypes.catalog.registered` event payload.
   * When omitted, falls back to a value derived from `sourceType`
   * (`agent` → `agentStudio`, `provider`/`llm`/`model` → `providerConnections`,
   * everything else → `unknown`).
   */
  sourceModule?: string;
  /** Optional workspace context for the event payload. */
  workspaceId?: number | null;
  /** Optional correlation id threaded through from the upstream flow. */
  correlationId?: string | null;
  /** Actor type for the event payload. Defaults to `"user"`. */
  actorType?: "user" | "system";
  /** Initiator user id when distinct from the executing actor. Defaults to `registeredBy`. */
  initiatedByUserId?: number | null;
}

export interface RegisterCatalogEntryResult {
  entryId: number;
  action: "created" | "updated";
  /**
   * Mirrors the column the row carries after the register call. Always
   * `null` when `action="created"` (Plan v3-native rows). May be non-null
   * when `action="updated"` against a pre-existing modern row whose state
   * was already populated through other means.
   */
  legacyImportState: string | null;
  /** Echo of the duplicate-guard's outcome for logging/audit. */
  guardReason: string;
}

export class RegisterDuplicateError extends Error {
  readonly existingEntryId: number;
  readonly guardResult: DuplicateGuardResult;
  constructor(guardResult: DuplicateGuardResult) {
    super(
      `aiTypes.catalog.register refused: ${guardResult.reason} (existing entry id ${guardResult.existingEntryId}). ` +
        (guardResult.reason === "blocked_unresolved_use_reconcile"
          ? "Use reconcileLegacyImport for unresolved rows."
          : "Use aiTypes.catalog.update for modern rows you intend to modify."),
    );
    this.name = "RegisterDuplicateError";
    this.existingEntryId = guardResult.existingEntryId!;
    this.guardResult = guardResult;
  }
}

/**
 * Pure — DB handle is passed in so tests can inject a fake. The real
 * binding to the platform DB happens at the manifest/action layer.
 */
export async function registerCatalogEntry(
  db: any,
  input: RegisterCatalogEntryInput,
): Promise<RegisterCatalogEntryResult> {
  const guard = await checkDuplicateLegacyImport(db, {
    sourceType: input.sourceType,
    sourceId: input.sourceId,
  });

  if (!guard.ok) {
    // Both "would_duplicate_legacy" and "blocked_unresolved_use_reconcile"
    // refuse the register; the error class carries the reason for the caller.
    throw new RegisterDuplicateError(guard);
  }

  if (guard.existingEntryId != null) {
    // Modern row exists at (sourceType, sourceId) — this is an update.
    await updateCatalogEntry(
      guard.existingEntryId,
      input.fields as any,
      input.registeredBy,
    );
    const updated = await getCatalogEntryById(guard.existingEntryId);
    // Plan v3 Phase 38 — audit event for the register/update action.
    // Best-effort: a failed audit insert must NOT roll back the catalog
    // write (the catalog state is the source of truth; audit is forensics).
    await emitRegisterAudit(
      guard.existingEntryId,
      "catalog.register.updated",
      input,
      guard,
    );
    // Plan v3 Phase 39 — emit `aiTypes.catalog.registered` event.
    await emitCatalogRegisteredEvent({
      catalogEntryId: guard.existingEntryId,
      action: "updated",
      activeSourceVersionId:
        ((updated as any)?.activeSourceVersionId as number | null) ?? null,
      input,
    });
    return {
      entryId: guard.existingEntryId,
      action: "updated",
      legacyImportState: (updated?.legacyImportState as string | null) ?? null,
      guardReason: guard.reason,
    };
  }

  // No existing row → create.
  const created = await createCatalogEntry({
    ...input.fields,
    entryType: input.entryType,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    createdBy: input.registeredBy,
  } as InsertCatalogEntry);

  // Plan v3 Phase 38 — audit event.
  await emitRegisterAudit(
    (created as CatalogEntry).id,
    "catalog.register.created",
    input,
    guard,
  );

  // Plan v3 Phase 39 — emit `aiTypes.catalog.registered` event.
  await emitCatalogRegisteredEvent({
    catalogEntryId: (created as CatalogEntry).id,
    action: "created",
    activeSourceVersionId:
      ((input.fields as any)?.activeSourceVersionId as number | null) ?? null,
    input,
  });

  return {
    entryId: (created as CatalogEntry).id,
    action: "created",
    legacyImportState: null,
    guardReason: guard.reason,
  };
}

async function emitRegisterAudit(
  catalogEntryId: number,
  eventType: "catalog.register.created" | "catalog.register.updated",
  input: RegisterCatalogEntryInput,
  guard: DuplicateGuardResult,
): Promise<void> {
  try {
    await createCatalogAuditEvent({
      eventType,
      catalogEntryId,
      actor: input.registeredBy,
      actorType: "user",
      payload: {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        entryType: input.entryType,
        guardReason: guard.reason,
      },
    } as any);
  } catch (err) {
    // Audit must not block the register; surface the failure on stderr only.
    // The catalog row is already written and is the source of truth.
    console.warn(
      `[register] audit event '${eventType}' failed for entry ${catalogEntryId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Plan v3 Phase 39 — fallback `sourceModule` derivation for callers that
 * don't pass it explicitly. The Phase 30 export-catalog gateway path passes
 * `sourceModule="agentStudio"` directly, and direct router callers (Provider
 * Connections, internal admin scripts) should also pass it. This keeps the
 * register call site self-contained when a caller forgets.
 */
export function deriveSourceModule(sourceType: string): string {
  switch (sourceType) {
    case "agent":
      return "agentStudio";
    case "provider":
    case "llm":
    case "model":
      return "providerConnections";
    default:
      return "unknown";
  }
}

/**
 * Plan v3 Phase 39 — emits `aiTypes.catalog.registered` after the catalog
 * row is written. Best-effort: bus failures must NOT roll back the catalog
 * write. Failures log to stderr for forensic follow-up.
 */
async function emitCatalogRegisteredEvent(args: {
  catalogEntryId: number;
  action: "created" | "updated";
  activeSourceVersionId: number | null;
  input: RegisterCatalogEntryInput;
}): Promise<void> {
  const { catalogEntryId, action, activeSourceVersionId, input } = args;
  const performedByActorType: "user" | "system" = input.actorType ?? "user";
  const sourceModule =
    input.sourceModule ?? deriveSourceModule(input.sourceType);
  const initiatedByUserId =
    input.initiatedByUserId === undefined
      ? input.registeredBy
      : input.initiatedByUserId;
  const correlationId = input.correlationId ?? null;
  const workspaceId = input.workspaceId ?? null;
  const registeredAt = new Date().toISOString();

  const payload: CatalogRegisteredPayload = {
    catalogEntryId,
    entryType: input.entryType,
    sourceModule,
    sourceRefId: input.sourceId,
    activeSourceVersionId,
    initiatedByUserId,
    performedByActorId: input.registeredBy,
    performedByActorType,
    workspaceId,
    correlationId,
    registeredAt,
    action,
  };

  try {
    await publishEvent(
      makeEnvelope({
        eventType: AI_TYPES_EVENTS.catalogRegistered,
        sourceModule: "aiTypes",
        workspaceId,
        actorId: input.registeredBy,
        correlationId: correlationId ?? undefined,
        payload,
      }),
    );
  } catch (err) {
    console.warn(
      `[register] event '${AI_TYPES_EVENTS.catalogRegistered}' failed for entry ${catalogEntryId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
