/**
 * Agent Studio — workspace default Provider Connection lookup.
 *
 * Phase 29.1b (D-WDB-1..8 in `docs/architecture/provider-model-binding/
 * WORKSPACE_DEFAULT_BINDING_DECISION.md`). Workspace-default Provider
 * Connection lookup keyed by `(workspaceId, role)` — consumed by the 4
 * deferred Phase 29 caller migrations (LR-02 / LR-03 / LR-04 / LR-08).
 *
 * Critical contracts (see ADR for full rationale):
 *
 *   - **No credential leakage** (D-WDB-3) — the result projection mirrors
 *     `ResolveForRunResult` — `providerConnectionId` + `providerCatalogEntryId`
 *     are returned but no apiKey-shaped field. Callers pass
 *     `providerConnectionId` to Model Access, which fetches the credential
 *     through `withProviderCredential`.
 *   - **No automatic system-default fallback** (D-WDB-3) — `null` row
 *     returns `ok=false`/`reason=default_not_set`. Callers decide whether
 *     to refuse the call or fall back to a built-in. Explicit-over-implicit
 *     avoids the "why is my call going to the wrong provider?" debug class.
 *   - **No `process.env` reads** (D-WDB-6) — this primitive does not
 *     consume environment variables; the boundary lint allowlist gets no
 *     new entry.
 *   - **Eligibility gating** — the read mirrors `resolveForRun`'s gate:
 *     pass through `getBindingEligibility` so disabled/unhealthy provider
 *     connections fail loudly with a typed reason.
 */

import { and, eq } from "drizzle-orm";
import { getAsDbForWorkspace } from "./db/connection";
import {
  agsWorkspaceDefaultProviderBindings,
  type AgsWorkspaceDefaultProviderBinding,
  type InsertAgsWorkspaceDefaultProviderBinding,
} from "../../drizzle/tables/agent-studio";
import { getBindingEligibility } from "../provider-connections/public-api";

// ─── Role lattice (D-WDB-4) ──────────────────────────────────────────

export type WorkspaceDefaultBindingRole =
  | "chat"
  | "embedding"
  | "tool"
  | "classifier";

export const WORKSPACE_DEFAULT_BINDING_ROLES: ReadonlyArray<WorkspaceDefaultBindingRole> =
  Object.freeze(["chat", "embedding", "tool", "classifier"] as const);

// ─── Read API ────────────────────────────────────────────────────────

export interface ResolveWorkspaceDefaultBindingInput {
  workspaceId: number;
  role: WorkspaceDefaultBindingRole;
}

export type WorkspaceDefaultBindingReason =
  | "default_not_set"
  | "provider_connection_missing"
  | "provider_connection_disabled"
  | "provider_connection_unhealthy";

export interface ResolveWorkspaceDefaultBindingResult {
  workspaceId: number;
  role: WorkspaceDefaultBindingRole;
  providerConnectionId: number;
  providerCatalogEntryId: number | null;
  modelRef: string;
  ok: boolean;
  reason?: WorkspaceDefaultBindingReason;
}

/**
 * Resolve the default Provider Connection for `(workspaceId, role)`.
 *
 * Returns `null` when no row exists; returns `{ok:false, reason}` when a
 * row exists but the linked Provider Connection failed eligibility (D-WDB-3
 * forbids automatic system-default fallback — this is the caller's decision
 * point). Returns `{ok:true}` when the lookup hit a healthy provider
 * connection.
 */
export async function resolveWorkspaceDefaultBinding(
  input: ResolveWorkspaceDefaultBindingInput,
): Promise<ResolveWorkspaceDefaultBindingResult | null> {
  // V1+ MR-3 twenty-seventh batch (PR-V1-95): workspaceId is required
  // on ResolveWorkspaceDefaultBindingInput. Phase-1 shim delegates to
  // getAsDb(); Phase-2 will route by region without caller changes.
  const db = getAsDbForWorkspace(input.workspaceId);
  const rows = await db
    .select()
    .from(agsWorkspaceDefaultProviderBindings)
    .where(
      and(
        eq(agsWorkspaceDefaultProviderBindings.workspaceId, input.workspaceId),
        eq(agsWorkspaceDefaultProviderBindings.role, input.role),
      ),
    );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];

  const eligibility = await getBindingEligibility({
    providerConnectionId: row.providerConnectionId,
  });

  if (!eligibility.ok) {
    const reason: WorkspaceDefaultBindingReason =
      eligibility.reason === "not_found"
        ? "provider_connection_missing"
        : eligibility.reason === "health_failed"
          ? "provider_connection_unhealthy"
          : "provider_connection_disabled";
    return {
      workspaceId: row.workspaceId,
      role: row.role as WorkspaceDefaultBindingRole,
      providerConnectionId: row.providerConnectionId,
      providerCatalogEntryId: row.providerCatalogEntryId ?? null,
      modelRef: row.modelRef,
      ok: false,
      reason,
    };
  }

  return {
    workspaceId: row.workspaceId,
    role: row.role as WorkspaceDefaultBindingRole,
    providerConnectionId: row.providerConnectionId,
    providerCatalogEntryId: row.providerCatalogEntryId ?? null,
    modelRef: row.modelRef,
    ok: true,
  };
}

// ─── Internal write helpers ──────────────────────────────────────────
//
// These are server-internal upsert/delete primitives intended for
// admin-facing surfaces (gateway action + tRPC + admin UI) that ship in
// a follow-up PR. Until that follow-up lands, admins set defaults via
// direct SQL or by calling these functions from a one-off script. The
// 4 Phase 29 caller migrations only need the READ API above; the write
// surface is intentionally minimal to keep 29.1b's PR tight.

export interface UpsertWorkspaceDefaultBindingInput {
  workspaceId: number;
  role: WorkspaceDefaultBindingRole;
  providerConnectionId: number;
  providerCatalogEntryId?: number | null;
  modelRef: string;
  updatedBy?: number | null;
}

export interface UpsertWorkspaceDefaultBindingResult {
  ok: boolean;
  reason?:
    | "provider_connection_missing"
    | "provider_connection_unhealthy"
    | "provider_connection_disabled";
  binding?: AgsWorkspaceDefaultProviderBinding;
}

/**
 * Upsert the default for `(workspaceId, role)`. Verifies the linked
 * Provider Connection passes `getBindingEligibility` before persisting —
 * mirrors the `upsertAgentProviderBinding` Phase 11 contract (write path
 * MUST gate on eligibility).
 */
export async function upsertWorkspaceDefaultBinding(
  input: UpsertWorkspaceDefaultBindingInput,
): Promise<UpsertWorkspaceDefaultBindingResult> {
  const eligibility = await getBindingEligibility({
    providerConnectionId: input.providerConnectionId,
  });
  if (!eligibility.ok) {
    const reason: UpsertWorkspaceDefaultBindingResult["reason"] =
      eligibility.reason === "not_found"
        ? "provider_connection_missing"
        : eligibility.reason === "health_failed"
          ? "provider_connection_unhealthy"
          : "provider_connection_disabled";
    return { ok: false, reason };
  }

  // V1+ MR-3 twenty-seventh batch (PR-V1-95).
  const db = getAsDbForWorkspace(input.workspaceId);
  const insertRow: InsertAgsWorkspaceDefaultProviderBinding = {
    workspaceId: input.workspaceId,
    role: input.role,
    providerConnectionId: input.providerConnectionId,
    providerCatalogEntryId: input.providerCatalogEntryId ?? null,
    modelRef: input.modelRef,
    updatedBy: input.updatedBy ?? null,
  };

  const [persisted] = await db
    .insert(agsWorkspaceDefaultProviderBindings)
    .values(insertRow)
    .onConflictDoUpdate({
      target: [
        agsWorkspaceDefaultProviderBindings.workspaceId,
        agsWorkspaceDefaultProviderBindings.role,
      ],
      set: {
        providerConnectionId: insertRow.providerConnectionId,
        providerCatalogEntryId: insertRow.providerCatalogEntryId,
        modelRef: insertRow.modelRef,
        updatedAt: new Date(),
        updatedBy: insertRow.updatedBy,
      },
    })
    .returning();

  return { ok: true, binding: persisted };
}

/**
 * Delete the default for `(workspaceId, role)`. Idempotent. Returns
 * true iff a row was deleted.
 */
export async function deleteWorkspaceDefaultBinding(
  input: ResolveWorkspaceDefaultBindingInput,
): Promise<boolean> {
  // V1+ MR-3 twenty-seventh batch (PR-V1-95).
  const db = getAsDbForWorkspace(input.workspaceId);
  const result = await db
    .delete(agsWorkspaceDefaultProviderBindings)
    .where(
      and(
        eq(agsWorkspaceDefaultProviderBindings.workspaceId, input.workspaceId),
        eq(agsWorkspaceDefaultProviderBindings.role, input.role),
      ),
    )
    .returning({ id: agsWorkspaceDefaultProviderBindings.id });
  return result.length > 0;
}

/**
 * List all defaults for a workspace (across roles).
 */
export async function listWorkspaceDefaultBindings(
  workspaceId: number,
): Promise<AgsWorkspaceDefaultProviderBinding[]> {
  // V1+ MR-3 twenty-seventh batch (PR-V1-95).
  const db = getAsDbForWorkspace(workspaceId);
  return db
    .select()
    .from(agsWorkspaceDefaultProviderBindings)
    .where(eq(agsWorkspaceDefaultProviderBindings.workspaceId, workspaceId));
}
