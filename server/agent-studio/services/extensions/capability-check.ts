/**
 * Extension capability-pinned dispatch — pure check.
 *
 * V1+ Phase 18-α acceptance criterion #4:
 *   "Extensions cannot bypass the MCP dispatcher. Each extension
 *    declares which tools it intends to invoke; runtime asserts
 *    the declared set matches actual calls."
 *
 * This is the pure side: given an extension record + lane +
 * toolName, return whether the invocation is permitted. The
 * decision does not touch the DB or the dispatcher.
 *
 * Branches:
 *   - extension status `disabled` / `revoked` → denied with the
 *     matching `denied_*` code.
 *   - status not `approved` (e.g. `pending_approval`, `rejected`)
 *     → denied with `denied_disabled` (the user-facing reason is
 *     "not currently approved"). Future revs may split this; the
 *     coarser bucket is fine for the first slice.
 *   - lane=tool with toolName not in `declaredToolNames` →
 *     `denied_undeclared`.
 *   - otherwise → `allowed`.
 */

import type {
  CapabilityCheckOutcome,
  ExtensionCapabilityLane,
  ExtensionRecord,
} from "./contracts.js";

export interface CapabilityCheckInput {
  readonly extension: ExtensionRecord;
  readonly lane: ExtensionCapabilityLane;
  readonly toolName?: string;
}

export function evaluateCapability(
  input: CapabilityCheckInput,
): CapabilityCheckOutcome {
  const { extension, lane, toolName } = input;
  if (extension.governanceStatus === "revoked") {
    return {
      check: "denied_revoked",
      reason: `Extension ${extension.extensionKey} is revoked.`,
    };
  }
  if (extension.governanceStatus === "disabled") {
    return {
      check: "denied_disabled",
      reason: `Extension ${extension.extensionKey} is disabled.`,
    };
  }
  if (extension.governanceStatus !== "approved") {
    return {
      check: "denied_disabled",
      reason: `Extension ${extension.extensionKey} is not approved (status=${extension.governanceStatus}).`,
    };
  }
  if (!extension.capabilityLanes.includes(lane)) {
    return {
      check: "denied_undeclared",
      reason: `Extension ${extension.extensionKey} did not declare lane "${lane}".`,
    };
  }
  if (lane === "tool") {
    if (!toolName) {
      return {
        check: "denied_undeclared",
        reason: `Tool invocations require an explicit toolName.`,
      };
    }
    if (!extension.declaredToolNames.includes(toolName)) {
      return {
        check: "denied_undeclared",
        reason: `Extension ${extension.extensionKey} did not declare tool "${toolName}".`,
      };
    }
  }
  return { check: "allowed", reason: "OK" };
}
