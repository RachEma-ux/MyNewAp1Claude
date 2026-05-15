/**
 * Extension framework contracts — V1+ Phase 18-α first slice.
 *
 * Closed taxonomies + record/input shapes. The taxonomy unions are
 * enforced at the service layer (Drizzle columns are varchar for
 * additive growth).
 *
 * Hard-rule compliance:
 *   - Extensions MUST use the wrapper `invokeFromExtension()` to
 *     reach the MCP dispatcher. Direct imports of
 *     `dispatchMcpToolCall` from extension code are source-scan
 *     forbidden (acceptance criterion #5).
 *   - Approval governance reuses `ags_approval_steps` (existing
 *     scaffolding from Cycle-4) — no parallel approval table.
 */

export const EXTENSION_GOVERNANCE_STATUSES = [
  "pending_approval",
  "approved",
  "rejected",
  "disabled",
  "revoked",
] as const;

export type ExtensionGovernanceStatus =
  (typeof EXTENSION_GOVERNANCE_STATUSES)[number];

export function isExtensionGovernanceStatus(
  s: unknown,
): s is ExtensionGovernanceStatus {
  return (
    typeof s === "string" &&
    (EXTENSION_GOVERNANCE_STATUSES as readonly string[]).includes(s)
  );
}

// ============================================================================
// Per-governance-status operator-facing metadata (T-X.1)
// ============================================================================

export interface ExtensionGovernanceStatusMetadata {
  /** Display label rendered in the extension registry UI. */
  readonly label: string;
  /** Short operator-facing description of what the status means. */
  readonly description: string;
  /** Whether the extension can be invoked (capability-pinned dispatch
   *  proceeds) — only `approved` extensions can invoke. */
  readonly invocable: boolean;
  /** Closed-taxonomy active/inactive classification:
   *  - `awaiting_decision`: operator hasn't acted yet
   *    (`pending_approval`).
   *  - `active`: extension is approved + enabled.
   *  - `dormant`: extension is approved but operator-disabled or
   *    pre-rejected — recoverable.
   *  - `revoked`: extension is hard-rejected by governance — terminal. */
  readonly lifecycle:
    | "awaiting_decision"
    | "active"
    | "dormant"
    | "revoked";
}

export const EXTENSION_GOVERNANCE_STATUS_METADATA: Readonly<
  Record<ExtensionGovernanceStatus, ExtensionGovernanceStatusMetadata>
> = {
  pending_approval: {
    label: "Pending Approval",
    description:
      "Extension install request is awaiting operator approval — manifest is parked; no capabilities are active.",
    invocable: false,
    lifecycle: "awaiting_decision",
  },
  approved: {
    label: "Approved",
    description:
      "Extension is approved and active — declared capabilities reach the RACT lane hooks; tool dispatches proceed.",
    invocable: true,
    lifecycle: "active",
  },
  rejected: {
    label: "Rejected",
    description:
      "Operator explicitly rejected the install request — extension remains dormant; manifest preserved for audit.",
    invocable: false,
    lifecycle: "dormant",
  },
  disabled: {
    label: "Disabled",
    description:
      "Approved extension has been temporarily disabled by an operator — capabilities are inactive but the row preserves state for re-enable.",
    invocable: false,
    lifecycle: "dormant",
  },
  revoked: {
    label: "Revoked",
    description:
      "Approved extension has been hard-revoked by governance — terminal; the extension key cannot be re-approved without a new manifest.",
    invocable: false,
    lifecycle: "revoked",
  },
};

export function getExtensionGovernanceStatusMetadata(
  status: ExtensionGovernanceStatus,
): ExtensionGovernanceStatusMetadata {
  return EXTENSION_GOVERNANCE_STATUS_METADATA[status];
}

export const EXTENSION_CAPABILITY_LANES = [
  "retrieve",
  "assemble",
  "compose",
  "tool",
] as const;

export type ExtensionCapabilityLane =
  (typeof EXTENSION_CAPABILITY_LANES)[number];

export function isExtensionCapabilityLane(
  s: unknown,
): s is ExtensionCapabilityLane {
  return (
    typeof s === "string" &&
    (EXTENSION_CAPABILITY_LANES as readonly string[]).includes(s)
  );
}

// ============================================================================
// Per-capability-lane operator-facing metadata (T-X.2)
// ============================================================================

export interface ExtensionCapabilityLaneMetadata {
  /** Display label rendered in the extension manifest UI / capability
   *  picker. */
  readonly label: string;
  /** Short operator-facing description of what the lane does in the
   *  RACT pipeline. */
  readonly description: string;
  /** Whether this lane invokes MCP tools (true) vs. produces / mutates
   *  in-memory state (false). Only the `tool` lane invokes tools — the
   *  others mutate retrieval / assembly / composition results. */
  readonly invokesTools: boolean;
  /** Stable RACT pipeline order index — used to determine the
   *  invocation order when an extension declares multiple lanes
   *  (retrieve = 1 → assemble = 2 → compose = 3 → tool = 4). */
  readonly pipelineOrder: 1 | 2 | 3 | 4;
}

export const EXTENSION_CAPABILITY_LANE_METADATA: Readonly<
  Record<ExtensionCapabilityLane, ExtensionCapabilityLaneMetadata>
> = {
  retrieve: {
    label: "Retrieve",
    description:
      "Hooks the RAC retrieval phase — extension can inject additional retrieval sources or annotate retrieval results.",
    invokesTools: false,
    pipelineOrder: 1,
  },
  assemble: {
    label: "Assemble",
    description:
      "Hooks the RAC assembly phase — extension can reshape the assembled prompt / context block before model invocation.",
    invokesTools: false,
    pipelineOrder: 2,
  },
  compose: {
    label: "Compose",
    description:
      "Hooks the RAC composition phase — extension can post-process the model's response (citation rewrites, redactions, formatters).",
    invokesTools: false,
    pipelineOrder: 3,
  },
  tool: {
    label: "Tool",
    description:
      "Declares MCP tool invocations — capability-pinned dispatch routes named tools to the extension's handler.",
    invokesTools: true,
    pipelineOrder: 4,
  },
};

export function getExtensionCapabilityLaneMetadata(
  lane: ExtensionCapabilityLane,
): ExtensionCapabilityLaneMetadata {
  return EXTENSION_CAPABILITY_LANE_METADATA[lane];
}

export const EXTENSION_CAPABILITY_CHECKS = [
  "allowed",
  "denied_undeclared",
  "denied_revoked",
  "denied_disabled",
] as const;

export type ExtensionCapabilityCheck =
  (typeof EXTENSION_CAPABILITY_CHECKS)[number];

/**
 * Extension manifest — the static identity + capability declaration
 * an operator (or signing system) provides when installing.
 */
export interface ExtensionManifest {
  /** Stable identity slug (e.g. `"slack-broadcaster"`). */
  readonly extensionKey: string;
  readonly name: string;
  readonly version: string;
  readonly signingKeyId?: string;
  /** RACT lanes the extension intends to hook. */
  readonly capabilityLanes: ReadonlyArray<ExtensionCapabilityLane>;
  /** Tool names the extension intends to invoke (capability-pinned
   *  dispatch contract). For lanes other than "tool" this can be
   *  an empty array. */
  readonly declaredToolNames: ReadonlyArray<string>;
  /** Operator-tunable per-extension config. */
  readonly config?: Record<string, unknown>;
}

export interface ExtensionRecord {
  readonly id: number;
  readonly workspaceId: number;
  readonly extensionKey: string;
  readonly name: string;
  readonly version: string;
  readonly signingKeyId: string | null;
  readonly governanceStatus: ExtensionGovernanceStatus;
  readonly capabilityLanes: ReadonlyArray<ExtensionCapabilityLane>;
  readonly declaredToolNames: ReadonlyArray<string>;
  readonly config: Record<string, unknown> | null;
  readonly installedAt: Date;
  readonly approvedAt: Date | null;
  readonly disabledAt: Date | null;
  /**
   * PR-V1-195: actor-audit fields. Already written by
   * `installExtension` / `approveExtension` / `setExtensionStatus`
   * but were not exposed on the read shape. Surfacing them here so
   * the admin panel can render "who installed / approved / disabled
   * this" without an extra fetch.
   */
  readonly installedByUserId: number | null;
  readonly approvedByUserId: number | null;
  readonly disabledByUserId: number | null;
}

export interface InstallExtensionInput {
  readonly workspaceId: number;
  readonly manifest: ExtensionManifest;
  readonly installedByUserId?: number;
}

export interface ApproveExtensionInput {
  readonly extensionId: number;
  readonly approvedByUserId: number;
}

export interface CapabilityCheckOutcome {
  readonly check: ExtensionCapabilityCheck;
  readonly reason: string;
}

export interface InvokeFromExtensionInput {
  readonly extensionId: number;
  readonly lane: ExtensionCapabilityLane;
  /** Required for `lane="tool"`; ignored for other lanes. */
  readonly toolName?: string;
  /** Caller-supplied invocation payload. Forwarded to the
   *  dispatcher when the capability check passes; otherwise the
   *  invocation is recorded as denied and short-circuits. */
  readonly payload?: Record<string, unknown>;
}

export class ExtensionNotFoundError extends Error {
  readonly code = "extension_not_found";
  constructor(id: number | string) {
    super(`Extension not found: ${String(id)}`);
    this.name = "ExtensionNotFoundError";
  }
}

export class ExtensionStatusInvalidError extends Error {
  readonly code = "extension_status_invalid";
  constructor(value: unknown) {
    super(
      `Invalid extension governance status: ${String(value)}. ` +
        `Allowed: ${EXTENSION_GOVERNANCE_STATUSES.join(" | ")}.`,
    );
    this.name = "ExtensionStatusInvalidError";
  }
}

export class ExtensionLaneInvalidError extends Error {
  readonly code = "extension_lane_invalid";
  constructor(value: unknown) {
    super(
      `Invalid extension capability lane: ${String(value)}. ` +
        `Allowed: ${EXTENSION_CAPABILITY_LANES.join(" | ")}.`,
    );
    this.name = "ExtensionLaneInvalidError";
  }
}
