/**
 * Provider Connections — Public API surface
 *
 * Per Plan v3 Decision D2: Provider Connections has a public no-secret
 * surface (this file) and an internal credential resolver surface
 * (`server/provider-connections/internal/credential-resolver.ts`).
 *
 * The internal resolver is reachable ONLY from
 * `server/openrouter/model-access/**` (enforced by
 * `scripts/check-provider-credential-resolver-boundary.ts` in Phase 3).
 *
 * Public outputs MUST never include:
 *   - PAT
 *   - API key
 *   - encrypted secret payload
 *   - decrypted secret payload
 *   - secret env-var values
 *
 * The `ProviderConnectionRef` shape below is the canonical no-secret
 * reference returned by every public read action. It is what
 * Agent Studio, AI Types, and the frontend consume.
 */

import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { providerConnections } from "../../drizzle/schema";

export { providerConnectionsManifest } from "./manifest";

// ─── No-secret reference shape ───────────────────────────────────────

export interface ProviderConnectionRef {
  providerConnectionId: number;
  providerCatalogEntryId: number;
  workspaceId: number;
  /**
   * Lifecycle status of the connection. Per Plan v3 Decision D7,
   * Agent Studio binding (Phase 12+) must accept only "active";
   * "validated" connections are visible but not selectable for
   * runtime binding.
   */
  lifecycleStatus: "active" | "validated";
  healthStatus: "ok" | "unreachable" | "unknown";
  modelCount: number;
  capabilities: string[];
}

export interface ConnectionStatusSummary {
  providerConnectionId: number;
  lifecycleStatus: string;
  healthStatus: string | null;
  lastHealthCheck: Date | null;
  modelCount: number | null;
  capabilities: string[] | null;
}

// ─── Public read actions (the input/output contracts) ────────────────

export interface ListActiveForProviderInput {
  workspaceId: number;
  providerCatalogEntryId: number;
}

export interface GetConnectionStatusInput {
  providerConnectionId: number;
}

export interface ValidateConnectionInput {
  providerConnectionId: number;
}

export interface ValidateConnectionResult {
  providerConnectionId: number;
  ok: boolean;
  /** When `ok = false`, why the connection cannot be used right now. */
  reason?:
    | "not_found"
    | "not_active"
    | "secret_missing"
    | "health_unknown"
    | "health_failed";
  lifecycleStatus?: string;
  healthStatus?: string | null;
}

// ─── Implementations ─────────────────────────────────────────────────
// These are the exact functions invoked by the registered gateway
// actions in `manifest.ts`. They are intentionally narrow: each one
// returns only the no-secret `ProviderConnectionRef` / status shape.

const VISIBLE_LIFECYCLE_STATUSES = ["active", "validated"] as const;

/**
 * List provider connections that are usable references for the given
 * provider catalog entry. Active and validated rows are returned;
 * disabled/failed rows are filtered out at the API boundary so they
 * cannot accidentally surface in pickers.
 */
export async function listActiveForProvider(
  input: ListActiveForProviderInput,
): Promise<ProviderConnectionRef[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(providerConnections)
    .where(
      and(
        eq(providerConnections.workspaceId, input.workspaceId),
        eq(providerConnections.providerId, input.providerCatalogEntryId),
        inArray(providerConnections.lifecycleStatus, [
          ...VISIBLE_LIFECYCLE_STATUSES,
        ]),
      ),
    );

  return rows.map(toProviderConnectionRef);
}

export async function getConnectionStatus(
  input: GetConnectionStatusInput,
): Promise<ConnectionStatusSummary | null> {
  const db = getDb();
  if (!db) return null;

  const [row] = await db
    .select()
    .from(providerConnections)
    .where(eq(providerConnections.id, input.providerConnectionId));

  if (!row) return null;

  return {
    providerConnectionId: row.id,
    lifecycleStatus: row.lifecycleStatus,
    healthStatus: row.healthStatus,
    lastHealthCheck: row.lastHealthCheck ?? null,
    modelCount: row.modelCount ?? null,
    capabilities: row.capabilities ?? null,
  };
}

/**
 * Reference-shape validation only: does the connection exist, is it
 * active, does it have a stored secret? Does NOT perform a runtime
 * provider HTTP probe — that lives at
 * `openRouter.modelAccess.validateBinding` (Phase 4) per Plan v3 Fix N5.
 *
 * Returns no secret material in any branch.
 */
export async function validateConnection(
  input: ValidateConnectionInput,
): Promise<ValidateConnectionResult> {
  const db = getDb();
  if (!db) {
    return {
      providerConnectionId: input.providerConnectionId,
      ok: false,
      reason: "not_found",
    };
  }

  const [row] = await db
    .select()
    .from(providerConnections)
    .where(eq(providerConnections.id, input.providerConnectionId));

  if (!row) {
    return {
      providerConnectionId: input.providerConnectionId,
      ok: false,
      reason: "not_found",
    };
  }

  if (row.lifecycleStatus !== "active") {
    return {
      providerConnectionId: row.id,
      ok: false,
      reason: "not_active",
      lifecycleStatus: row.lifecycleStatus,
      healthStatus: row.healthStatus ?? null,
    };
  }

  // Confirm a secret row exists (lazy-import to avoid pulling internals
  // into this barrel — public-api should not transitively expose
  // `internal/*`). A stored secret is necessary for resolution; the
  // payload is never inspected here.
  const { getLatestSecret } = await import("./db");
  const secret = await getLatestSecret(row.id);
  if (!secret) {
    return {
      providerConnectionId: row.id,
      ok: false,
      reason: "secret_missing",
      lifecycleStatus: row.lifecycleStatus,
      healthStatus: row.healthStatus ?? null,
    };
  }

  return {
    providerConnectionId: row.id,
    ok: true,
    lifecycleStatus: row.lifecycleStatus,
    healthStatus: row.healthStatus ?? null,
  };
}

// ─── Internal mapper — strips DB columns not in the public shape ─────

function toProviderConnectionRef(
  row: typeof providerConnections.$inferSelect,
): ProviderConnectionRef {
  // Health status normalization: DB column is nullable string, the
  // public type pins it to "ok" | "unreachable" | "unknown".
  const healthStatus: ProviderConnectionRef["healthStatus"] =
    row.healthStatus === "ok" || row.healthStatus === "unreachable"
      ? row.healthStatus
      : "unknown";

  // Lifecycle is one of "active" | "validated" by construction
  // (the SELECT WHERE clause in listActiveForProvider). Narrow it.
  const lifecycleStatus: ProviderConnectionRef["lifecycleStatus"] =
    row.lifecycleStatus === "active" ? "active" : "validated";

  return {
    providerConnectionId: row.id,
    providerCatalogEntryId: row.providerId,
    workspaceId: row.workspaceId,
    lifecycleStatus,
    healthStatus,
    modelCount: row.modelCount ?? 0,
    capabilities: row.capabilities ?? [],
  };
}
