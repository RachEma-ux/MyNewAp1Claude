/**
 * Extension runtime entry point — the ONLY path extensions reach
 * the MCP dispatcher.
 *
 * V1+ Phase 18-α acceptance criterion #5:
 *   "Source-scan blockers — no extension code can import
 *    `dispatchMcpToolCall` directly; must use the wrapper
 *    `services/extensions/runtime.ts:invokeFromExtension()`."
 *
 * The wrapper:
 *   1. Loads the extension record
 *   2. Runs the capability check (pure)
 *   3. Records the invocation in `ags_extension_invocations`
 *   4. On `allowed`, dispatches through the MCP chokepoint
 *      (for lane=tool); for other lanes, the wrapper's job is
 *      capability assertion + logging only — the actual lane
 *      hooks are wired in subsequent V1+ slices.
 *
 * Hard-rule compliance:
 *   - `dispatchMcpToolCall` is imported ONLY here; the source-scan
 *     test `extension-dispatcher-boundary.test.ts` enforces this.
 *   - No raw env reads.
 *   - The invocation ledger always carries a row even on denial;
 *     operator forensics can audit "extension X tried tool Y but
 *     was denied because it wasn't declared".
 */

import { eq } from "drizzle-orm";

import { getAsDb, getAsDbForWorkspace } from "../../db/connection.js";
import {
  agsExtensions,
  agsExtensionInvocations,
} from "../../../../drizzle/tables/agent-studio-extensions.js";
import {
  dispatchMcpToolCall,
  type DispatchMcpToolCallInput,
  type DispatchMcpToolCallResult,
} from "../mcp/dispatcher.js";
import { evaluateCapability } from "./capability-check.js";
import {
  ExtensionLaneInvalidError,
  ExtensionNotFoundError,
  isExtensionCapabilityLane,
  type CapabilityCheckOutcome,
  type ExtensionCapabilityLane,
  type ExtensionRecord,
  type InvokeFromExtensionInput,
} from "./contracts.js";
import {
  getLaneHook,
  type LaneHookFn,
  type LaneHookOutcome,
} from "./lane-hooks.js";

function rowToExtension(r: Record<string, unknown>): ExtensionRecord {
  const status =
    r.governanceStatus === "approved" ||
    r.governanceStatus === "rejected" ||
    r.governanceStatus === "disabled" ||
    r.governanceStatus === "revoked"
      ? (r.governanceStatus as ExtensionRecord["governanceStatus"])
      : "pending_approval";
  return {
    id: Number(r.id),
    workspaceId: Number(r.workspaceId),
    extensionKey: String(r.extensionKey),
    name: String(r.name),
    version: String(r.version),
    signingKeyId: (r.signingKeyId as string | null) ?? null,
    governanceStatus: status,
    capabilityLanes:
      (Array.isArray(r.capabilityLanes)
        ? (r.capabilityLanes as ExtensionCapabilityLane[])
        : []),
    declaredToolNames: Array.isArray(r.declaredToolNames)
      ? (r.declaredToolNames as string[])
      : [],
    config: (r.config as Record<string, unknown> | null) ?? null,
    installedAt: r.installedAt as Date,
    approvedAt: (r.approvedAt as Date | null) ?? null,
    disabledAt: (r.disabledAt as Date | null) ?? null,
  };
}

async function loadExtensionById(id: number): Promise<ExtensionRecord> {
  // V1+ MR-3 seventy-sixth batch (PR-V1-146): Path-A read consumer.
  // Mirrors manifest.ts::getExtensionById (#894) — pre-projection
  // SELECT on agsExtensions.workspaceId, route the full SELECT.
  const lookupDb = getAsDb();
  if (!lookupDb) throw new ExtensionNotFoundError(id);
  const wsRows = await lookupDb
    .select({ workspaceId: agsExtensions.workspaceId })
    .from(agsExtensions)
    .where(eq(agsExtensions.id, id))
    .limit(1);
  if (wsRows.length === 0) throw new ExtensionNotFoundError(id);
  const db = getAsDbForWorkspace(wsRows[0].workspaceId) ?? lookupDb;
  const rows = await db
    .select()
    .from(agsExtensions)
    .where(eq(agsExtensions.id, id))
    .limit(1);
  if (!rows[0]) throw new ExtensionNotFoundError(id);
  return rowToExtension(rows[0] as Record<string, unknown>);
}

async function recordInvocation(
  input: {
    extensionId: number;
    lane: ExtensionCapabilityLane;
    toolName?: string;
    outcome: CapabilityCheckOutcome;
    succeeded?: boolean;
    errorMessage?: string;
    details?: Record<string, unknown>;
  },
  getDb: typeof getAsDb = getAsDb,
): Promise<void> {
  // V1+ MR-3 thirty-first batch (PR-V1-100): split-handle pattern via
  // the extension's workspaceId. `agsExtensionInvocations` doesn't
  // carry workspaceId directly, but the parent `agsExtensions` row
  // does (non-null). Discovery SELECT pulls it up, then the INSERT
  // routes via getAsDbForWorkspace. Soft-return on empty lookup
  // (matches the pre-existing fall-through semantics — observability
  // path, not source of truth). The getDb test seam wraps the
  // BOOTSTRAP lookup so tests passing `() => null` continue to no-op.
  const lookupDb = getDb();
  if (!lookupDb) return;
  const lookup = await lookupDb
    .select({ workspaceId: agsExtensions.workspaceId })
    .from(agsExtensions)
    .where(eq(agsExtensions.id, input.extensionId))
    .limit(1);
  if (lookup.length === 0) return;
  const db = getAsDbForWorkspace(lookup[0].workspaceId);
  if (!db) return;
  await db.insert(agsExtensionInvocations).values({
    extensionId: input.extensionId,
    lane: input.lane,
    invokedToolName: input.toolName ?? null,
    capabilityCheck: input.outcome.check,
    succeeded: input.succeeded ?? null,
    errorMessage: input.errorMessage ?? input.outcome.reason ?? null,
    details: input.details ?? null,
  });
}

export interface InvokeFromExtensionOutcome {
  readonly capability: CapabilityCheckOutcome;
  readonly dispatched: boolean;
  readonly dispatchResult: DispatchMcpToolCallResult | null;
  /** Set by V1+ Phase 18-β when a non-tool lane hook executes. */
  readonly laneHookOutcome?: LaneHookOutcome;
}

export interface InvokeFromExtensionOptions {
  /** Test seam — supply a stub dispatcher. The default uses the
   *  real `dispatchMcpToolCall`. */
  readonly dispatch?: (
    input: DispatchMcpToolCallInput,
  ) => Promise<DispatchMcpToolCallResult>;
  /** Test seam — supply a stub extension loader. */
  readonly loadExtension?: (id: number) => Promise<ExtensionRecord>;
  /** Required for `lane="tool"` — full dispatcher input. The
   *  wrapper only fills in audit fields; the caller still supplies
   *  the tool name + args + source identification. */
  readonly dispatchInput?: DispatchMcpToolCallInput;
  /** V1+ Phase 18-β test seam — substitute the lane-hook lookup. */
  readonly resolveLaneHook?: (
    lane: ExtensionCapabilityLane,
  ) => LaneHookFn | undefined;
  /** Test seam for ledger writes — substitute `getAsDb`. Tests pass
   *  `() => null` to take the no-op fall-through path. */
  readonly getDb?: typeof getAsDb;
}

/**
 * The single entry point extensions use to reach the MCP
 * dispatcher. Returns a structured outcome whether or not the
 * capability check allowed the invocation.
 */
export async function invokeFromExtension(
  input: InvokeFromExtensionInput,
  options: InvokeFromExtensionOptions = {},
): Promise<InvokeFromExtensionOutcome> {
  if (!isExtensionCapabilityLane(input.lane)) {
    throw new ExtensionLaneInvalidError(input.lane);
  }
  const loader = options.loadExtension ?? loadExtensionById;
  const extension = await loader(input.extensionId);
  const capability = evaluateCapability({
    extension,
    lane: input.lane,
    toolName: input.toolName,
  });
  const getDb = options.getDb ?? getAsDb;

  if (capability.check !== "allowed") {
    await recordInvocation(
      {
        extensionId: extension.id,
        lane: input.lane,
        toolName: input.toolName,
        outcome: capability,
        succeeded: false,
      },
      getDb,
    );
    return { capability, dispatched: false, dispatchResult: null };
  }

  // V1+ Phase 18-β (#767): non-tool lanes look up a registered
  // hook. When present, the hook executes the lane's concrete
  // capability and its outcome is ledgered. Otherwise the wrapper
  // falls back to the α behavior (assert + ledger, no execution).
  if (input.lane !== "tool" || !options.dispatchInput) {
    const resolveHook = options.resolveLaneHook ?? getLaneHook;
    const hook = resolveHook(input.lane);
    if (hook) {
      let hookOutcome: LaneHookOutcome;
      try {
        hookOutcome = await hook({ extension, input });
      } catch (err) {
        hookOutcome = {
          succeeded: false,
          errorMessage: err instanceof Error ? err.message : String(err),
        };
      }
      await recordInvocation(
        {
          extensionId: extension.id,
          lane: input.lane,
          toolName: input.toolName,
          outcome: capability,
          succeeded: hookOutcome.succeeded,
          errorMessage: hookOutcome.errorMessage,
          details: hookOutcome.details,
        },
        getDb,
      );
      return {
        capability,
        dispatched: false,
        dispatchResult: null,
        laneHookOutcome: hookOutcome,
      };
    }
    // No hook registered — α fall-through.
    await recordInvocation(
      {
        extensionId: extension.id,
        lane: input.lane,
        toolName: input.toolName,
        outcome: capability,
        succeeded: true,
      },
      getDb,
    );
    return { capability, dispatched: false, dispatchResult: null };
  }

  // Lane = "tool": route through the MCP dispatcher.
  const dispatch = options.dispatch ?? dispatchMcpToolCall;
  let result: DispatchMcpToolCallResult;
  try {
    result = await dispatch(options.dispatchInput);
    await recordInvocation(
      {
        extensionId: extension.id,
        lane: input.lane,
        toolName: input.toolName,
        outcome: capability,
        succeeded: result.ok === true,
        errorMessage: result.ok === false ? result.errorCode : undefined,
      },
      getDb,
    );
    return { capability, dispatched: true, dispatchResult: result };
  } catch (err) {
    await recordInvocation(
      {
        extensionId: extension.id,
        lane: input.lane,
        toolName: input.toolName,
        outcome: capability,
        succeeded: false,
        errorMessage: err instanceof Error ? err.message : String(err),
      },
      getDb,
    );
    throw err;
  }
}
