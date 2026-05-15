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
