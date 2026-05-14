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
import { getAsDb, getAsDbForWorkspace } from "./db/connection";
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
  /**
   * Plan v3 Phase 15 — last successful policy validation timestamp.
   * Null means never validated since Phase 15 landed (treated as
   * stale on first read).
   */
  lastValidatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Plan v3 Phase 15 — staleness threshold. A binding whose
 * `lastValidatedAt` is older than this is treated as `degraded`
 * with `validation_stale`. Default: 5 minutes (matches the
 * Plan v3 Phase 15 spec). Tunable via env for tests.
 */
export const VALIDATION_STALENESS_MS = (() => {
  const raw = process.env.PMB_VALIDATION_STALENESS_MS;
  if (raw && /^\d+$/.test(raw)) return Number(raw);
  return 5 * 60 * 1000;
})();

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
    lastValidatedAt: row.lastValidatedAt ?? null,
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

  // V1+ MR-3 twenty-eighth batch (PR-V1-96): workspaceId is required
  // on UpsertAgentProviderBindingInput. Phase-1 shim delegates to
  // getAsDb(); Phase-2 will route by region without caller changes.
  const db = getAsDbForWorkspace(input.workspaceId);
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

/**
 * Remove a binding row. Returns true iff a row was deleted. Idempotent.
 */
export async function removeAgentProviderBinding(
  draftId: number,
  role: string = "primary",
): Promise<boolean> {
  const db = getAsDb();
  const result = await db
    .delete(agsAgentProviderBindings)
    .where(
      and(
        eq(agsAgentProviderBindings.draftId, draftId),
        eq(agsAgentProviderBindings.role, role),
      ),
    )
    .returning({ id: agsAgentProviderBindings.id });
  return result.length > 0;
}

// ─── Phase 12 — validateBindingPolicy + resolveForRun ────────────────
//
// Plan v3 Phase 13 separates these two validators:
//
//   - `validateBindingPolicy` (this file) — REFERENCE/policy validation.
//     Confirms the binding row exists, the Provider Connection is
//     bind-eligible (Phase 8), and the AI Types catalog entry is
//     available (Phase 7). Cheap; no upstream HTTP. Called by the
//     binding picker UI before save.
//   - `openRouter.modelAccess.validateBinding` (Phase 4) — RUNTIME
//     execution validation. Probes the upstream provider for /v1/models.
//
// Phase 13 will add UI-label disambiguation; Phase 12 lands both.

export type BindingPolicyReason =
  | "binding_not_found"
  | "provider_connection_ineligible"
  | "model_not_available"
  | "legacy_unresolved"
  | "binding_disabled"
  /** Plan v3 Phase 15 — last validation older than VALIDATION_STALENESS_MS. */
  | "validation_stale";

export interface ValidateBindingPolicyResult {
  draftId: number;
  role: string;
  ok: boolean;
  reason?: BindingPolicyReason;
  /** Eligibility result from Phase 8 — null when binding is local-provider. */
  eligibility?: BindingEligibilityResult | null;
  /**
   * AI Types governance check — null when no catalog entry was provided
   * (legacy-unresolved bindings) or when the catalog could not be
   * consulted in this environment (e.g. test sandbox without DB).
   */
  catalogAvailable?: boolean | null;
  /**
   * Plan v3 Phase 15 — `lastValidatedAt` echoed back so the UI can
   * render "Last validated at" without a second round-trip. Updated
   * to `now` when this call sets ok=true.
   */
  lastValidatedAt?: Date | null;
  /**
   * Plan v3 Phase 15 — true iff the prior `lastValidatedAt` is older
   * than VALIDATION_STALENESS_MS. Independent of `ok`; the caller
   * decides whether stale-and-otherwise-ok counts as ok (see
   * `staleAsDegraded`).
   */
  staleAtCallTime?: boolean;
}

export interface ValidateBindingPolicyOptions {
  /**
   * Plan v3 Phase 15. When true (default), refresh `lastValidatedAt`
   * on a successful validation. When false (operator clicked "view
   * status", we just want to read the stored timestamp), leave it
   * untouched.
   */
  refreshTimestamp?: boolean;
  /**
   * When true (default), treat staleness as a blocker — a binding
   * whose `lastValidatedAt` is older than VALIDATION_STALENESS_MS
   * returns ok=false with reason=`validation_stale` UNLESS this call
   * is itself going to refresh the timestamp (refreshTimestamp=true).
   * The runtime preflight passes `staleAsDegraded: true`; the UI
   * status chip passes `staleAsDegraded: false` to render a warning
   * without blocking the picker.
   */
  staleAsDegraded?: boolean;
}

export interface ResolveForRunInput {
  draftId: number;
  /** Defaults to "primary". */
  role?: string;
}

/**
 * Reference projection used by the runtime/router resolver. Carries
 * everything the runtime needs to construct an `openRouter.modelAccess.execute`
 * call EXCEPT the credential — which lives behind
 * `withProviderCredential` and is fetched separately by Model Access.
 *
 * Forbidden keys (apiKey, pat, Authorization, etc.) are intentionally
 * absent — guarded by FORBIDDEN_BINDING_KEYS.
 */
export interface ResolveForRunResult {
  binding: AgentProviderBindingPublic;
  /**
   * Resolved Provider Connection reference (no secrets). Null when the
   * binding is local-provider (no credential needed).
   */
  providerConnection: {
    providerConnectionId: number;
    providerCatalogEntryId: number;
    workspaceId: number;
    lifecycleStatus: string;
    healthStatus: string | null;
    selectable: boolean;
  } | null;
  /**
   * Status flag — true iff every gate (eligibility, catalog) passed.
   * False forces the runtime to refuse the call with `reason`.
   */
  ok: boolean;
  reason?: BindingPolicyReason;
}

/**
 * Reference/policy validation. Cheap; no upstream HTTP.
 *
 * - Binding must exist (`binding_not_found` if not).
 * - Status must be `binding_v1` (`legacy_unresolved` / `disabled` blocked).
 * - For non-local-provider bindings: `getBindingEligibility` must pass.
 *
 * Plan v3 Phase 15 — staleness:
 *   - `staleAtCallTime` is computed against the row's `lastValidatedAt`.
 *   - When `options.staleAsDegraded === true` (default for runtime
 *     preflight) AND the row is stale, the call returns ok=false with
 *     reason=`validation_stale` UNLESS the call itself is going to
 *     refresh the timestamp (`refreshTimestamp !== false`).
 *   - When the result is otherwise ok and `refreshTimestamp !== false`,
 *     the row's `lastValidatedAt` is updated to `now`.
 *
 * AI Types catalog availability is deferred to a future Phase 12.b
 * tightening — Phase 12 returns `catalogAvailable: null` when the
 * model catalog ref is missing, leaving room for a future opt-in
 * cross-check via `aiTypes.providerModels.listAvailable`.
 */
export async function validateBindingPolicy(
  draftId: number,
  role: string = "primary",
  options: ValidateBindingPolicyOptions = {},
): Promise<ValidateBindingPolicyResult> {
  const refreshTimestamp = options.refreshTimestamp ?? true;
  const staleAsDegraded = options.staleAsDegraded ?? true;

  const binding = await getAgentProviderBinding(draftId, role);
  if (!binding) {
    return {
      draftId,
      role,
      ok: false,
      reason: "binding_not_found",
    };
  }

  const priorValidatedAt = binding.lastValidatedAt ?? null;
  const nowMs = Date.now();
  const staleAtCallTime =
    priorValidatedAt === null ||
    nowMs - priorValidatedAt.getTime() > VALIDATION_STALENESS_MS;

  if (binding.status === "legacy_unresolved") {
    return {
      draftId,
      role,
      ok: false,
      reason: "legacy_unresolved",
      lastValidatedAt: priorValidatedAt,
      staleAtCallTime,
    };
  }
  if (binding.status === "disabled" || binding.status === "archived") {
    return {
      draftId,
      role,
      ok: false,
      reason: "binding_disabled",
      lastValidatedAt: priorValidatedAt,
      staleAtCallTime,
    };
  }

  let eligibility: BindingEligibilityResult | null = null;
  if (binding.providerConnectionId !== null) {
    eligibility = await getBindingEligibility({
      providerConnectionId: binding.providerConnectionId,
    });
    if (!eligibility.ok) {
      return {
        draftId,
        role,
        ok: false,
        reason: "provider_connection_ineligible",
        eligibility,
        lastValidatedAt: priorValidatedAt,
        staleAtCallTime,
      };
    }
  }

  // Stale-as-degraded gate: only blocks when the caller will NOT
  // refresh the timestamp itself. Runtime preflight passes
  // staleAsDegraded=true with refreshTimestamp=false, blocking until
  // an operator clicks Refresh in the UI.
  if (staleAsDegraded && staleAtCallTime && !refreshTimestamp) {
    return {
      draftId,
      role,
      ok: false,
      reason: "validation_stale",
      eligibility,
      lastValidatedAt: priorValidatedAt,
      staleAtCallTime,
    };
  }

  let writtenAt: Date | null = priorValidatedAt;
  if (refreshTimestamp) {
    const now = new Date();
    // V1+ MR-3 twenty-ninth batch (PR-V1-97): split-handle via the
    // already-loaded binding. `getAgentProviderBinding` returned the
    // binding row, which carries `workspaceId` (it's a non-null
    // column on agsAgentProviderBindings). Route the UPDATE via
    // getAsDbForWorkspace(binding.workspaceId) — no extra round-trip
    // because workspaceId was already pulled in the earlier SELECT.
    const db = getAsDbForWorkspace(binding.workspaceId);
    await db
      .update(agsAgentProviderBindings)
      .set({ lastValidatedAt: now, updatedAt: now })
      .where(eq(agsAgentProviderBindings.id, binding.id));
    writtenAt = now;
  }

  return {
    draftId,
    role,
    ok: true,
    eligibility,
    catalogAvailable: null,
    lastValidatedAt: writtenAt,
    staleAtCallTime,
  };
}

/**
 * Plan v3 Phase 15 — operator-triggered refresh. Wraps
 * `validateBindingPolicy` with `refreshTimestamp=true,
 * staleAsDegraded=false` so a stale-but-otherwise-ok binding flips
 * back to fresh on a successful re-check.
 */
export async function refreshBindingValidation(
  draftId: number,
  role: string = "primary",
): Promise<ValidateBindingPolicyResult> {
  return validateBindingPolicy(draftId, role, {
    refreshTimestamp: true,
    staleAsDegraded: false,
  });
}

/**
 * Resolve a binding for runtime use. Returns the binding plus the
 * Provider Connection reference (no secrets). The runtime adapter
 * then passes `providerConnectionId` to `openRouter.modelAccess.execute`,
 * which fetches the credential through `withProviderCredential`
 * inside the Model Access boundary.
 *
 * If any gate fails, returns `ok=false` with a reason — the runtime
 * MUST refuse to call. Local-provider bindings (`providerConnectionId=null`)
 * pass through with `providerConnection=null`.
 */
export async function resolveForRun(
  input: ResolveForRunInput,
): Promise<ResolveForRunResult> {
  const role = input.role ?? "primary";
  // Runtime preflight: do NOT refresh `lastValidatedAt` (that requires
  // an operator action), and DO treat staleness as degraded.
  const policy = await validateBindingPolicy(input.draftId, role, {
    refreshTimestamp: false,
    staleAsDegraded: true,
  });
  if (!policy.ok) {
    const binding = await getAgentProviderBinding(input.draftId, role);
    return {
      binding:
        binding ??
        ({
          id: -1,
          workspaceId: -1,
          agentId: -1,
          draftId: input.draftId,
          role,
          providerCatalogEntryId: null,
          modelCatalogEntryId: null,
          providerConnectionId: null,
          modelRef: "",
          status: "legacy_unresolved",
          statusReason: null,
          legacyEnvVarHint: null,
          lastValidatedAt: null,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        } satisfies AgentProviderBindingPublic),
      providerConnection: null,
      ok: false,
      reason: policy.reason,
    };
  }

  const binding = (await getAgentProviderBinding(input.draftId, role))!;

  let providerConnection: ResolveForRunResult["providerConnection"] = null;
  if (binding.providerConnectionId !== null && policy.eligibility) {
    providerConnection = {
      providerConnectionId: binding.providerConnectionId,
      providerCatalogEntryId: binding.providerCatalogEntryId ?? -1,
      workspaceId: binding.workspaceId,
      lifecycleStatus: policy.eligibility.lifecycleStatus ?? "active",
      healthStatus: policy.eligibility.healthStatus ?? null,
      selectable: policy.eligibility.ok,
    };
  }

  return { binding, providerConnection, ok: true };
}
