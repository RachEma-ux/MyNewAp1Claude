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

import { getAsDb } from "../../db/connection.js";
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
  const db = getAsDb();
  if (!db) throw new ExtensionNotFoundError(id);
  const rows = await db
    .select()
    .from(agsExtensions)
    .where(eq(agsExtensions.id, id))
    .limit(1);
  if (!rows[0]) throw new ExtensionNotFoundError(id);
  return rowToExtension(rows[0] as Record<string, unknown>);
}

async function recordInvocation(input: {
  extensionId: number;
  lane: ExtensionCapabilityLane;
  toolName?: string;
  outcome: CapabilityCheckOutcome;
  succeeded?: boolean;
  errorMessage?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const db = getAsDb();
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

  if (capability.check !== "allowed") {
    await recordInvocation({
      extensionId: extension.id,
      lane: input.lane,
      toolName: input.toolName,
      outcome: capability,
      succeeded: false,
    });
    return { capability, dispatched: false, dispatchResult: null };
  }

  // For non-tool lanes, the wrapper's job is capability assertion +
  // ledger recording. Lane-specific hook execution lands in the
  // next V1+ slice (one per lane).
  if (input.lane !== "tool" || !options.dispatchInput) {
    await recordInvocation({
      extensionId: extension.id,
      lane: input.lane,
      toolName: input.toolName,
      outcome: capability,
      succeeded: true,
    });
    return { capability, dispatched: false, dispatchResult: null };
  }

  // Lane = "tool": route through the MCP dispatcher.
  const dispatch = options.dispatch ?? dispatchMcpToolCall;
  let result: DispatchMcpToolCallResult;
  try {
    result = await dispatch(options.dispatchInput);
    await recordInvocation({
      extensionId: extension.id,
      lane: input.lane,
      toolName: input.toolName,
      outcome: capability,
      succeeded: result.ok === true,
      errorMessage: result.ok === false ? result.errorCode : undefined,
    });
    return { capability, dispatched: true, dispatchResult: result };
  } catch (err) {
    await recordInvocation({
      extensionId: extension.id,
      lane: input.lane,
      toolName: input.toolName,
      outcome: capability,
      succeeded: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
