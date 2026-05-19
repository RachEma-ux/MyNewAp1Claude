/**
 * Cross-region access guard — V2 Phase MR-1 Phase-2 tenth slice.
 * PR-V1-158.
 *
 * Closes the "Cross-region read denial middleware" SOU §5 deferred
 * item. Pure functional guard that callers wire either as a tRPC
 * middleware (downstream slice; see comment below) or invoke
 * directly from a procedure body.
 *
 * Semantics:
 *   - Each running process has a regionKey (env var
 *     `AGS_PROCESS_REGION_KEY`). Default null = no enforcement
 *     (single-region operational baseline).
 *   - When the guard is enabled (process regionKey set + the
 *     workspace has a pin), the workspace's pinned region must
 *     equal the process regionKey OR the pin must be flagged
 *     `isReplicated`. Otherwise throw `CrossRegionAccessDeniedError`.
 *
 * Permissive defaults so single-region operators are unaffected:
 *   - Process regionKey unset: guard is a no-op.
 *   - Workspace has no pin: guard is a no-op (the workspace routes
 *     to the primary region; primary is local by construction).
 *   - Cache is cold: guard is a no-op (no information to compare;
 *     other code paths fall back to bootstrap, which is local).
 *
 * Wiring options (both shipped as additive surfaces):
 *   - tRPC middleware factory (`services/region/cross-region-middleware.ts`)
 *     extracts `workspaceId` from `ctx` or `input` and calls this
 *     guard before the handler runs.
 *   - Per-procedure manual call: `guardCrossRegionAccess(
 *     input.workspaceId)` at the top of any procedure that touches
 *     workspace-scoped data.
 *
 * Hard-rule compliance:
 *   - The single env read is the process regionKey (operator-set,
 *     not a secret).
 *   - No `credential-resolver` / `dispatchMcpToolCall` /
 *     `neo4j-driver` imports.
 */

import { getCachedRegionKeyForWorkspace } from "./workspace-region-cache.js";
import {
  CrossRegionAccessDeniedError,
} from "./types.js";

/**
 * Read the process regionKey from the environment. Cached in
 * module scope after first read. `null` means "no enforcement"
 * (single-region operational baseline).
 *
 * Exposed as a function rather than a top-level constant so tests
 * can reset via `__resetProcessRegionKeyForTests`.
 */
let _processRegionKeyCache: string | null | undefined = undefined;

export function getProcessRegionKey(): string | null {
  if (_processRegionKeyCache === undefined) {
    const raw = process.env.AGS_PROCESS_REGION_KEY;
    _processRegionKeyCache = raw && raw.length > 0 ? raw : null;
  }
  return _processRegionKeyCache;
}

export function __resetProcessRegionKeyForTests(): void {
  _processRegionKeyCache = undefined;
}

export interface CrossRegionGuardContext {
  /** Test seam — override the workspace pin lookup. */
  readonly getCachedRegionKey?: (workspaceId: number) => string | null;
  /** Test seam — override the per-pin `isReplicated` lookup.
   *  Default null = treat as not-replicated (deny). */
  readonly isWorkspaceReplicated?: (workspaceId: number) => boolean;
  /** Test seam — override the process regionKey. */
  readonly processRegionKey?: string | null;
}

/**
 * Throws `CrossRegionAccessDeniedError` when a workspace pinned
 * to a region OTHER than the process's regionKey accesses this
 * process's data plane AND is not flagged `isReplicated`.
 *
 * No-op when:
 *   - The process regionKey is unset (`AGS_PROCESS_REGION_KEY`).
 *   - The workspace has no cached pin (falls back to primary).
 *   - The pin matches the process regionKey.
 *   - The pin is flagged `isReplicated`.
 */
export function guardCrossRegionAccess(
  workspaceId: number,
  ctx: CrossRegionGuardContext = {},
): void {
  const processKey = ctx.processRegionKey ?? getProcessRegionKey();
  if (!processKey) return; // single-region baseline
  const lookup = ctx.getCachedRegionKey ?? getCachedRegionKeyForWorkspace;
  const pinned = lookup(workspaceId);
  if (!pinned) return; // no pin → primary fallback
  if (pinned === processKey) return; // same region
  const isReplicated = ctx.isWorkspaceReplicated?.(workspaceId) ?? false;
  if (isReplicated) return; // explicit cross-region read allowed
  throw new CrossRegionAccessDeniedError(pinned, processKey, workspaceId);
}
