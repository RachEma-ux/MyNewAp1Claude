/**
 * `summarizeExtensions` — stable-shape aggregator over the
 * `ExtensionRecord[]` shape returned by `listExtensionsByWorkspace`.
 *
 * Companion to `summarizeLaneHookRegistry` (T-X.5 / #1182). Where
 * the registry aggregator answers "which lanes are wired in the
 * process", this aggregator answers "what's the state of the
 * extension installations themselves" — governance lifecycle,
 * declared capability breadth, signing-key coverage, actor-audit
 * completeness.
 *
 * Stable-shape guarantees (mirrors prior aggregators T-F.9 / T-F.12
 * / T-G.13 etc.):
 *   - `byGovernanceStatus[status]` is a number for every closed
 *     `EXTENSION_GOVERNANCE_STATUSES` value, even at 0 (cold-boot
 *     stable shape).
 *   - `byLifecycle[lifecycle]` is a number for every distinct
 *     `lifecycle` value from `EXTENSION_GOVERNANCE_STATUS_METADATA`,
 *     even at 0.
 *   - `byLane[lane]` is a number for every closed
 *     `EXTENSION_CAPABILITY_LANES` value — counts extensions
 *     DECLARING that lane (an extension declaring 3 lanes increments
 *     3 entries).
 *   - `byLaneCount` is a sparse histogram keyed on the integer count
 *     of declared lanes (no zero-fill on the integer axis — domain is
 *     open-ended).
 *   - `signedPercent` / `actorAuditPercent` are rounded to 1 decimal
 *     place; 0 on empty input (defensive — no NaN).
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure function. No DB I/O. No `credential-resolver` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` imports.
 */

import {
  EXTENSION_CAPABILITY_LANES,
  EXTENSION_GOVERNANCE_STATUSES,
  EXTENSION_GOVERNANCE_STATUS_METADATA,
  type ExtensionCapabilityLane,
  type ExtensionGovernanceStatus,
  type ExtensionGovernanceStatusMetadata,
  type ExtensionRecord,
} from "./contracts.js";

export type ExtensionLifecycle =
  ExtensionGovernanceStatusMetadata["lifecycle"];

/**
 * The closed lifecycle values, derived from the metadata table.
 * Kept here (not exported from `contracts.ts`) so a future metadata-
 * table edit that adds a new lifecycle value is caught by the
 * stable-shape test (which iterates this tuple).
 */
export const EXTENSION_LIFECYCLES: readonly ExtensionLifecycle[] = [
  "awaiting_decision",
  "active",
  "dormant",
  "revoked",
];

export interface ExtensionsSummary {
  /** Total extensions in the input array. */
  readonly total: number;
  /** Per-governance-status count. Every closed status appears at 0+. */
  readonly byGovernanceStatus: Readonly<
    Record<ExtensionGovernanceStatus, number>
  >;
  /** Per-lifecycle count (closed taxonomy from
   *  `EXTENSION_GOVERNANCE_STATUS_METADATA.lifecycle`). Every value
   *  appears at 0+. */
  readonly byLifecycle: Readonly<Record<ExtensionLifecycle, number>>;
  /** Per-lane count. An extension declaring 3 lanes increments 3
   *  entries. Every closed lane appears at 0+. */
  readonly byLane: Readonly<Record<ExtensionCapabilityLane, number>>;
  /** Histogram keyed on the integer count of declared lanes
   *  per-extension. Sparse — only keys that appear in the input show
   *  up (the integer axis is open-ended). */
  readonly byLaneCount: Readonly<Record<number, number>>;
  /** Extensions with a non-null `signingKeyId`. */
  readonly signedCount: number;
  /** `signedCount / total * 100`, rounded to 1 decimal. 0 on empty
   *  input. */
  readonly signedPercent: number;
  /** Extensions that pass the actor-audit predicate: `installedByUserId`
   *  is non-null (every install must have an actor; approved/disabled
   *  fields are status-conditional and not counted here). */
  readonly actorAuditedCount: number;
  /** `actorAuditedCount / total * 100`, rounded to 1 decimal. 0 on
   *  empty input. */
  readonly actorAuditPercent: number;
  /** Extensions that declare zero capability lanes — usually a
   *  misconfiguration (an extension that does nothing). */
  readonly zeroCapabilityCount: number;
}

function roundPercent(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function summarizeExtensions(
  records: readonly ExtensionRecord[],
): ExtensionsSummary {
  const byGovernanceStatus: Record<string, number> = {};
  for (const status of EXTENSION_GOVERNANCE_STATUSES) {
    byGovernanceStatus[status] = 0;
  }
  const byLifecycle: Record<string, number> = {};
  for (const lifecycle of EXTENSION_LIFECYCLES) {
    byLifecycle[lifecycle] = 0;
  }
  const byLane: Record<string, number> = {};
  for (const lane of EXTENSION_CAPABILITY_LANES) {
    byLane[lane] = 0;
  }
  const byLaneCount: Record<number, number> = {};

  let signedCount = 0;
  let actorAuditedCount = 0;
  let zeroCapabilityCount = 0;

  for (const ext of records) {
    byGovernanceStatus[ext.governanceStatus] =
      (byGovernanceStatus[ext.governanceStatus] ?? 0) + 1;
    const meta = EXTENSION_GOVERNANCE_STATUS_METADATA[ext.governanceStatus];
    byLifecycle[meta.lifecycle] = (byLifecycle[meta.lifecycle] ?? 0) + 1;
    const laneCount = ext.capabilityLanes.length;
    byLaneCount[laneCount] = (byLaneCount[laneCount] ?? 0) + 1;
    if (laneCount === 0) zeroCapabilityCount += 1;
    for (const lane of ext.capabilityLanes) {
      byLane[lane] = (byLane[lane] ?? 0) + 1;
    }
    if (ext.signingKeyId !== null) signedCount += 1;
    if (ext.installedByUserId !== null) actorAuditedCount += 1;
  }

  const total = records.length;
  return {
    total,
    byGovernanceStatus: byGovernanceStatus as Readonly<
      Record<ExtensionGovernanceStatus, number>
    >,
    byLifecycle: byLifecycle as Readonly<Record<ExtensionLifecycle, number>>,
    byLane: byLane as Readonly<Record<ExtensionCapabilityLane, number>>,
    byLaneCount,
    signedCount,
    signedPercent: roundPercent(signedCount, total),
    actorAuditedCount,
    actorAuditPercent: roundPercent(actorAuditedCount, total),
    zeroCapabilityCount,
  };
}
