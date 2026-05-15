/**
 * Phase-1 shim helper — resolve a draft's `workspaceId` via the
 * `agsAgentProviderBindings` escape hatch.
 *
 * The agent-tier tables (`agsAgents`, `agsAgentDrafts`,
 * `agsRuntimeRuns`, `agsPendingPermissionRequests`,
 * `agsRuntimePolicyEvents`) predate workspace scoping at the schema
 * level — no `workspaceId` column. This blocks Phase-1 Cat B→A
 * migrations for `services/approval/approval-gate.ts`,
 * `services/agent-studio/repository.ts`, and
 * `api/tool-approvals-router.ts` — see SOTU rev 2 §11 for the
 * complete gap diagnosis.
 *
 * **Path B** (indirect resolver) — `agsAgentProviderBindings` carries
 * `workspaceId` on every row, scoped by `(draftId, role)`. For any
 * draft that has at least one binding, we can derive workspaceId via
 * a single SELECT.
 *
 * **Limitation:** Drafts that have not yet been bound to a provider
 * (legacy drafts pre-Phase-11, or drafts in the binding-pending state
 * before the operator picks a provider) return `null` here. Callers
 * must handle that fall-through — typically by falling back to the
 * bootstrap `getAsDb()` handle so the FK constraint / not-found path
 * surfaces the original error.
 *
 * No `getAsDb()` or `getAsDbForWorkspace()` import in this file — the
 * caller supplies the handle to keep the helper Drizzle-shape-typed
 * without coupling to the shim. This also means tests can pass a
 * stub `db` for unit-level testing without booting ASDB.
 */

import { eq } from "drizzle-orm";

import { agsAgentProviderBindings } from "../../../../drizzle/tables/agent-studio";

/**
 * Minimum Drizzle-shape required from the caller. Locally typed so the
 * helper doesn't import the asdb connection module (which would
 * lazy-create a real pg pool at import time).
 */
export interface ResolveWorkspaceIdForDraftDb {
  select: (projection: { workspaceId: typeof agsAgentProviderBindings.workspaceId }) => {
    from: (table: typeof agsAgentProviderBindings) => {
      where: (predicate: ReturnType<typeof eq>) => {
        limit: (n: number) => Promise<{ workspaceId: number }[]>;
      };
    };
  };
}

/**
 * Returns the `workspaceId` for a draft's first matching binding, or
 * `null` when no binding exists for the draft (typically a legacy
 * pre-Phase-11 draft, or a draft whose binding hasn't been written
 * yet). The caller is responsible for falling back to the bootstrap
 * handle in the null case.
 *
 * The function reads at-most-one row (`limit(1)`) — if a draft has
 * multiple bindings across roles, we use whichever the planner
 * returns first. Phase-2 invariant: all bindings for a given draft
 * share the same workspaceId (workspace-scoped per Phase 11 contract).
 */
export async function resolveWorkspaceIdForDraft(
  db: ResolveWorkspaceIdForDraftDb,
  draftId: number,
): Promise<number | null> {
  const rows = await db
    .select({ workspaceId: agsAgentProviderBindings.workspaceId })
    .from(agsAgentProviderBindings)
    .where(eq(agsAgentProviderBindings.draftId, draftId))
    .limit(1);
  return rows[0]?.workspaceId ?? null;
}
