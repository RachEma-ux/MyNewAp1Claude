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

import {
  EXTENSION_CAPABILITY_LANES,
  type ExtensionCapabilityLane,
  type ExtensionRecord,
  type InvokeFromExtensionInput,
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

// ============================================================================
// Registry aggregator (T-X.5)
// ============================================================================

/**
 * Lanes that the registry accepts. `tool` is intentionally excluded —
 * it throws in `registerLaneHook`, so it can never be registered and
 * is reported separately on the summary's `notRegisterable` axis.
 */
export const REGISTERABLE_LANE_HOOK_LANES: readonly ExtensionCapabilityLane[] =
  EXTENSION_CAPABILITY_LANES.filter((l) => l !== "tool");

/**
 * Stable-shape summary of the lane-hook registry. Operator dashboards
 * + boot-time observability consume this to answer "which extension
 * lanes are wired" at a glance.
 *
 * Stable-shape guarantees (mirrors `summarizeLensRunnerRegistry` from
 * T-F.12 / #1068):
 *   - `registered[lane]` is a boolean for every registerable lane,
 *     even if zero hooks are registered (cold-boot stable shape).
 *   - `notRegisterable` lists the lanes the registry refuses by
 *     contract — currently `["tool"]`. The field exists even when
 *     empty (future-proofing).
 *   - `coveragePercent` is rounded to 1 decimal place; 0 on empty.
 *   - Iteration order follows `REGISTERABLE_LANE_HOOK_LANES`.
 */
export interface LaneHookRegistrySummary {
  /** Total count of lanes with a registered hook. */
  readonly totalRegistered: number;
  /** Total count of lanes that accept registration (currently 3). */
  readonly totalRegisterable: number;
  /** Per-registerable-lane boolean indicating whether a hook is
   *  registered. Iteration order matches `REGISTERABLE_LANE_HOOK_LANES`. */
  readonly registered: Readonly<Record<ExtensionCapabilityLane, boolean>>;
  /** Registerable lanes with no hook registered. Preserves declared
   *  order. */
  readonly missingLanes: readonly ExtensionCapabilityLane[];
  /** Lanes the registry refuses by contract (currently `["tool"]`). */
  readonly notRegisterable: readonly ExtensionCapabilityLane[];
  /** `totalRegistered / totalRegisterable * 100`, rounded to 1
   *  decimal. 0 when `totalRegisterable === 0` (defensive — the
   *  registerable set is fixed at 3 by the contract). */
  readonly coveragePercent: number;
}

/**
 * Build a `LaneHookRegistrySummary` from the current registry state.
 * Pure read; does not mutate. Safe to call on cold boot (returns
 * stable-shape "0% / all missing").
 */
export function summarizeLaneHookRegistry(): LaneHookRegistrySummary {
  const registered: Record<string, boolean> = {};
  const missingLanes: ExtensionCapabilityLane[] = [];
  let totalRegistered = 0;
  for (const lane of REGISTERABLE_LANE_HOOK_LANES) {
    const has = hooksByLane.has(lane);
    registered[lane] = has;
    if (has) {
      totalRegistered += 1;
    } else {
      missingLanes.push(lane);
    }
  }
  const totalRegisterable = REGISTERABLE_LANE_HOOK_LANES.length;
  const coveragePercent =
    totalRegisterable === 0
      ? 0
      : Math.round((totalRegistered / totalRegisterable) * 1000) / 10;
  return {
    totalRegistered,
    totalRegisterable,
    registered: registered as Readonly<
      Record<ExtensionCapabilityLane, boolean>
    >,
    missingLanes,
    notRegisterable: EXTENSION_CAPABILITY_LANES.filter((l) => l === "tool"),
    coveragePercent,
  };
}
