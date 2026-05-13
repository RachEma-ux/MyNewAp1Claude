/**
 * Extension lane hook registry — V1+ Phase 18-β.
 *
 * Phase 18-α (#753) shipped the extension manifest + capability
 * check + the `invokeFromExtension` wrapper. For `lane="tool"` the
 * wrapper already routes through the MCP dispatcher. For the other
 * three lanes (`retrieve`, `assemble`, `compose`) the α slice's
 * wrapper does capability assertion + ledger recording only — no
 * execution path.
 *
 * This β slice ships the missing wire-up: a process-local registry
 * of lane → handler functions. The wrapper calls the registered
 * handler when one exists, otherwise falls back to the α behavior
 * (assert + ledger, no execution).
 *
 * Concrete lane handler implementations land in subsequent slices —
 * one per lane (retrieve → register a retrieval contributor;
 * assemble → register an assembler contributor; compose → register
 * a CAG block contributor). Those PRs add `registerLaneHook(...)`
 * calls at boot time.
 *
 * Hard-rule compliance (CLAUDE.md Non-Build List):
 *   - The wrapper still imports the MCP dispatcher; lane hooks are
 *     NOT a back-door around the dispatcher invariant — only
 *     lane="tool" reaches `dispatchMcpToolCall`. The hooks for
 *     retrieve/assemble/compose execute non-tool capabilities and
 *     return their own outcome shape.
 *   - Closed taxonomy preserved — the registry's typed keys are
 *     the four `ExtensionCapabilityLane` values.
 *   - No `credential-resolver` import. No raw `process.env.*_API_KEY`.
 *   - No `dispatchMcpToolCall` import in this file (the dispatcher
 *     stays scoped to `runtime.ts`). Source-scan tested.
 */

import type {
  ExtensionCapabilityLane,
  ExtensionRecord,
  InvokeFromExtensionInput,
} from "./contracts.js";

/**
 * Closed structural shape for a lane hook's result. Each lane's
 * concrete handler returns this; the wrapper ledgers it without
 * inspecting the lane-specific payload.
 */
export interface LaneHookOutcome {
  readonly succeeded: boolean;
  readonly errorMessage?: string;
  /** Lane-specific payload — opaque to the wrapper. The retrieve
   *  lane might return `{ sourceCandidates: [...] }`; assemble might
   *  return `{ contributedBlocks: [...] }`. */
  readonly details?: Record<string, unknown>;
}

/**
 * Lane hook signature. Receives the extension record + the original
 * invocation input + a per-call context the registrant can use to
 * thread call-scoped state (e.g. trace id) through.
 */
export type LaneHookFn = (params: {
  readonly extension: ExtensionRecord;
  readonly input: InvokeFromExtensionInput;
}) => Promise<LaneHookOutcome>;

// ============================================================================
// Process-local registry
// ============================================================================

const hooksByLane = new Map<ExtensionCapabilityLane, LaneHookFn>();

/**
 * Register a handler for an extension lane. Idempotent — re-
 * registration replaces the prior handler (the operator dashboard's
 * "reload extensions" flow uses this).
 *
 * Production callers register at boot from each lane-specific
 * module (retrieve / assemble / compose). The `tool` lane is
 * intentionally NOT supported here — `lane="tool"` always routes
 * through the MCP dispatcher in `runtime.ts`, never a lane hook.
 */
export function registerLaneHook(
  lane: ExtensionCapabilityLane,
  fn: LaneHookFn,
): void {
  if (lane === "tool") {
    throw new Error(
      `Lane="tool" is not registerable — tool invocations route through ` +
        `the MCP dispatcher in invokeFromExtension; registering a hook ` +
        `would create a parallel execution path.`,
    );
  }
  hooksByLane.set(lane, fn);
}

/**
 * Look up the registered hook for a lane. Returns undefined when no
 * hook is registered — callers fall back to the α "assert + ledger"
 * path in that case.
 */
export function getLaneHook(
  lane: ExtensionCapabilityLane,
): LaneHookFn | undefined {
  return hooksByLane.get(lane);
}

/**
 * Drop all registered hooks. Production code MUST NOT call this —
 * source-scan tests pin the visibility.
 */
export function __resetExtensionLaneHooksForTests(): void {
  hooksByLane.clear();
}

/**
 * Operator inspection — return the lanes that currently have a
 * hook registered. Future operator UI consumes this to surface
 * "which extension lanes are wired".
 */
export function listRegisteredLaneHookLanes(): ExtensionCapabilityLane[] {
  return [...hooksByLane.keys()];
}
