/**
 * Agent Studio — provider/model binding write & read path.
 *
 * Plan v3 Phase 11. Replaces the legacy `ags_agent_drafts.providerConfig`
 * jsonb shape with structured rows in `ags_agent_provider_bindings`.
 *
 * Critical contract (migration spec §7 — Phase 11 contract):
 *
 *   1. `upsertAgentProviderBinding` MUST call
 *      `providerConnections.getBindingEligibility` (Phase 8) before
 *      persisting `binding_v1`. If eligibility returns `ok=false` and
 *      the caller is not explicitly recording a `legacy_unresolved`
 *      placeholder, the upsert is rejected.
 *
 *   2. The function returns the resolved binding plus joined Provider
 *      Connection ref + AI Types catalog ref. Nothing in the returned
 *      shape carries credential material — audited by the test guard
 *      against `FORBIDDEN_BINDING_KEYS`.
 *
 *   3. The `legacyEnvVarHint` column carries an env var NAME captured
 *      during the Phase 10 migration. It is non-secret by definition;
 *      the runtime adapter (Phase 12) will use it to surface "this
 *      binding still references env-var X" to operators, not to read
 *      the value.
 */

import { eq, and } from "drizzle-orm";
import { getAsDb } from "./db/connection";
import {
  agsAgentProviderBindings,
  type AgsAgentProviderBinding,
  type InsertAgsAgentProviderBinding,
} from "../../drizzle/tables/agent-studio";
import {
  getBindingEligibility,
  type BindingEligibilityResult,
} from "../provider-connections/public-api";

// ─── Types ───────────────────────────────────────────────────────────

export type AgentProviderBindingStatus =
  | "binding_v1"
  | "legacy_unresolved"
  | "disabled"
  | "archived";

export type AgentProviderBindingStatusReason =
  | "legacy_raw_api_key"
  | "legacy_env_var"
  | "legacy_no_credential"
  | "provider_slug_unknown"
  | "migration_skipped";

export interface UpsertAgentProviderBindingInput {
  workspaceId: number;
  agentId: number;
  draftId: number;
  /** Defaults to "primary"; multi-role values reserved for Phase 11+. */
  role?: string;
  providerCatalogEntryId: number | null;
  modelCatalogEntryId: number | null;
  /**
   * Required for `binding_v1`. May be null only when the caller
   * explicitly records a `legacy_unresolved` row (status != "binding_v1")
   * OR when `kind=local` provider is bound (no credential needed).
   */
  providerConnectionId: number | null;
  modelRef: string;
  status: AgentProviderBindingStatus;
  statusReason?: AgentProviderBindingStatusReason | null;
  legacyEnvVarHint?: string | null;
  createdBy: number;
  /**
   * When false, skip the binding-eligibility gate. Reserved for the
   * Phase 10 migration script which writes `legacy_unresolved` rows
   * deliberately (no Provider Connection to verify yet).
   */
  enforceEligibility?: boolean;
}

export interface UpsertAgentProviderBindingResult {
  binding: AgentProviderBindingPublic;
  /** Eligibility check result — null when the gate was skipped. */
  eligibility: BindingEligibilityResult | null;
}

/**
 * Public, no-secret projection of an `ags_agent_provider_bindings`
 * row. Identical-shape to the table minus internal columns; explicitly
 * excludes anything that could leak a credential.
 */
export interface AgentProviderBindingPublic {
  id: number;
  workspaceId: number;
  agentId: number;
  draftId: number;
  role: string;
  providerCatalogEntryId: number | null;
  modelCatalogEntryId: number | null;
  providerConnectionId: number | null;
  modelRef: string;
  status: AgentProviderBindingStatus;
  statusReason: AgentProviderBindingStatusReason | null;
  legacyEnvVarHint: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Forbidden field list — same shape guard as Phase 7's catalog
 * availability and Phase 2's connection ref. Tests assert nothing in
 * `AgentProviderBindingPublic` carries any of these keys.
 */
export const FORBIDDEN_BINDING_KEYS: ReadonlyArray<string> = [
  "apiKey",
  "api_key",
  "pat",
  "encryptedPat",
  "encrypted_pat",
  "secret",
  "Authorization",
  "authorization",
  "x-api-key",
  "Bearer",
  "apiKeyEnvVar", // renamed to legacyEnvVarHint on purpose
];

export class BindingEligibilityError extends Error {
  readonly code = "binding_not_eligible";
  constructor(
    public readonly providerConnectionId: number,
    public readonly reason: BindingEligibilityResult["reason"],
  ) {
    super(
      `Binding rejected for providerConnectionId=${providerConnectionId}: reason=${reason ?? "unknown"}`,
    );
    this.name = "BindingEligibilityError";
  }
}

// ─── Implementation ──────────────────────────────────────────────────

function toPublicBinding(
  row: AgsAgentProviderBinding,
): AgentProviderBindingPublic {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    agentId: row.agentId,
    draftId: row.draftId,
    role: row.role,
    providerCatalogEntryId: row.providerCatalogEntryId,
    modelCatalogEntryId: row.modelCatalogEntryId,
    providerConnectionId: row.providerConnectionId,
    modelRef: row.modelRef,
    status: row.status as AgentProviderBindingStatus,
    statusReason: (row.statusReason ?? null) as AgentProviderBindingStatusReason | null,
    legacyEnvVarHint: row.legacyEnvVarHint ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Upsert a binding row for `(draftId, role)`. New rows are inserted;
 * existing rows are updated by the unique index. The function returns
 * the persisted row in its public no-secret projection.
 *
 * Eligibility gate:
 *   - For `status="binding_v1"` AND `providerConnectionId !== null` AND
 *     `enforceEligibility !== false`: calls `getBindingEligibility`. A
 *     non-ok result throws `BindingEligibilityError`.
 *   - For `legacy_unresolved` / local-provider rows: the gate is
 *     skipped (the migration script + the local-provider path both
 *     legitimately have no Provider Connection to check).
 */
export async function upsertAgentProviderBinding(
  input: UpsertAgentProviderBindingInput,
): Promise<UpsertAgentProviderBindingResult> {
  const role = input.role ?? "primary";

  let eligibility: BindingEligibilityResult | null = null;
  const shouldGate =
    input.status === "binding_v1" &&
    input.providerConnectionId !== null &&
    input.enforceEligibility !== false;
  if (shouldGate) {
    eligibility = await getBindingEligibility({
      providerConnectionId: input.providerConnectionId!,
    });
    if (!eligibility.ok) {
      throw new BindingEligibilityError(
        input.providerConnectionId!,
        eligibility.reason,
      );
    }
  }

  const db = getAsDb();
  const now = new Date();

  const insertRow: InsertAgsAgentProviderBinding = {
    workspaceId: input.workspaceId,
    agentId: input.agentId,
    draftId: input.draftId,
    role,
    providerCatalogEntryId: input.providerCatalogEntryId,
    modelCatalogEntryId: input.modelCatalogEntryId,
    providerConnectionId: input.providerConnectionId,
    modelRef: input.modelRef,
    status: input.status,
    statusReason: input.statusReason ?? null,
    legacyEnvVarHint: input.legacyEnvVarHint ?? null,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  // Try insert first; on unique-violation (draft_id, role) update in place.
  const existing = await db
    .select()
    .from(agsAgentProviderBindings)
    .where(
      and(
        eq(agsAgentProviderBindings.draftId, input.draftId),
        eq(agsAgentProviderBindings.role, role),
      ),
    );

  let row: AgsAgentProviderBinding;
  if (existing.length === 0) {
    const [inserted] = await db
      .insert(agsAgentProviderBindings)
      .values(insertRow)
      .returning();
    row = inserted;
  } else {
    const [updated] = await db
      .update(agsAgentProviderBindings)
      .set({
        workspaceId: input.workspaceId,
        agentId: input.agentId,
        providerCatalogEntryId: input.providerCatalogEntryId,
        modelCatalogEntryId: input.modelCatalogEntryId,
        providerConnectionId: input.providerConnectionId,
        modelRef: input.modelRef,
        status: input.status,
        statusReason: input.statusReason ?? null,
        legacyEnvVarHint: input.legacyEnvVarHint ?? null,
        updatedAt: now,
      })
      .where(eq(agsAgentProviderBindings.id, existing[0].id))
      .returning();
    row = updated;
  }

  return { binding: toPublicBinding(row), eligibility };
}

/**
 * Read the binding for `(draftId, role)`. Returns null when no row
 * exists — caller decides whether that is "no binding yet" (UI shows
 * picker) or "missing for runtime" (Phase 12 adapter throws).
 */
export async function getAgentProviderBinding(
  draftId: number,
  role: string = "primary",
): Promise<AgentProviderBindingPublic | null> {
  const db = getAsDb();
  const rows = await db
    .select()
    .from(agsAgentProviderBindings)
    .where(
      and(
        eq(agsAgentProviderBindings.draftId, draftId),
        eq(agsAgentProviderBindings.role, role),
      ),
    );
  if (rows.length === 0) return null;
  return toPublicBinding(rows[0]);
}

/**
 * List all bindings for an agent (across draft revisions, all roles).
 * Returns the public no-secret projection.
 */
export async function listBindingsForAgent(
  agentId: number,
): Promise<AgentProviderBindingPublic[]> {
  const db = getAsDb();
  const rows = await db
    .select()
    .from(agsAgentProviderBindings)
    .where(eq(agsAgentProviderBindings.agentId, agentId));
  return rows.map(toPublicBinding);
}
