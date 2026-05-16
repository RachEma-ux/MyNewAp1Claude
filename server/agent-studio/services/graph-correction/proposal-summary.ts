/**
 * `summarizeGraphCorrectionProposals` — stable-shape aggregator over
 * the graph-correction `ProposalRow[]` surface (T-D.18).
 *
 * 27th instantiation of the lesson-30 aggregator-pair pattern.
 * Combined slice per lesson 26: literal-union → `as const` tuple
 * promotion + terminal-set companion + aggregator in one PR.
 *
 * Use case: graph-correction queue dashboard. Operators triage the
 * proposal queue: "128 proposals — 24 pending / 64 approved / 32
 * rejected / 4 revision_requested / 4 withdrawn — mean confidence
 * 0.82 over 89 confidence-carrying rows — 67 by-user / 56 by-agent
 * / 5 anonymous — oldest pending 3 days." Drives both reviewer
 * workload signal AND auto-reject-threshold tuning.
 *
 * Composite slice — composes 4 existing primitives (closed-taxonomy
 * + sparse open-ended axis + NumericStats + derived 3-way partition
 * via 2 nullable fields). No new structural variant; catalog
 * saturated at 15 @ T-A.15 / #1205.
 *
 * Stable-shape guarantees:
 *   - `byStatus` is CLOSED over `PROPOSAL_STATUSES`. Zero-filled.
 *   - `unknownStatusCount` partitions rows with a status outside the
 *     declared taxonomy (schema drift signal).
 *   - `byProposalKind` is sparse (open-ended string axis).
 *   - `terminalCount` + `inFlightCount` derived from
 *     `TERMINAL_PROPOSAL_STATUSES`; sum-to-total (excludes
 *     unknown-status rows).
 *   - `byProposer` is a derived 3-way partition: `user` /
 *     `agent` / `anonymous` from the two nullable
 *     `proposedByUserId` / `proposedByAgentId` fields. Sum-to-total.
 *   - `confidenceStats` is null when no row carries a confidence
 *     value (null-on-empty NumericStats).
 *   - `ageStats` is null when input is empty.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure function. No DB I/O. No `credential-resolver` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` imports.
 */

import type { ProposalRow, ProposalStatus } from "./lifecycle.js";
import {
  PROPOSAL_STATUSES,
  TERMINAL_PROPOSAL_STATUSES,
} from "./lifecycle.js";

export interface NumericStats {
  readonly count: number;
  readonly sum: number;
  readonly mean: number;
  readonly min: number;
  readonly max: number;
}

export interface CountEntry {
  readonly key: string;
  readonly count: number;
}

export type ProposerKind = "user" | "agent" | "anonymous";

export interface GraphCorrectionProposalListSummary {
  readonly total: number;
  /** Per-status count. Closed taxonomy, zero-filled. */
  readonly byStatus: Readonly<Record<ProposalStatus, number>>;
  /** Rows with a status outside `PROPOSAL_STATUSES`. Schema-drift
   *  partition; not in `byStatus`. */
  readonly unknownStatusCount: number;
  /** Per-proposalKind count. Sparse — open-ended string axis. */
  readonly byProposalKind: Readonly<Record<string, number>>;
  /** Distinct proposalKind values. */
  readonly distinctProposalKindCount: number;
  /** Top 10 proposalKinds by count, sorted descending. Alphabetical ties. */
  readonly topProposalKinds: readonly CountEntry[];
  /** Rows with `status ∈ TERMINAL_PROPOSAL_STATUSES`. */
  readonly terminalCount: number;
  /** Rows with `status ∈ PROPOSAL_STATUSES \ TERMINAL`. Sum with
   *  terminalCount equals (total - unknownStatusCount). */
  readonly inFlightCount: number;
  /** Derived 3-way partition over the nullable proposer fields. */
  readonly byProposer: Readonly<Record<ProposerKind, number>>;
  /** Rows with `rationale !== null`. */
  readonly withRationaleCount: number;
  /** NumericStats over `confidence`. Null if no row carries one. */
  readonly confidenceStats: NumericStats | null;
  /** Age stats in ms from `createdAt` to `now`. Null on empty input. */
  readonly ageStats: NumericStats | null;
}

export interface SummarizeGraphCorrectionProposalsOptions {
  /** Override the clock for deterministic age-stats. */
  readonly now?: Date;
  /** Override the top-N truncation (default 10). */
  readonly topN?: number;
}

const DEFAULT_TOP_N = 10;

function computeStats(values: readonly number[]): NumericStats | null {
  if (values.length === 0) return null;
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return {
    count: values.length,
    sum,
    mean: Math.round((sum / values.length) * 10) / 10,
    min,
    max,
  };
}

function topN(
  byKey: Readonly<Record<string, number>>,
  n: number,
): CountEntry[] {
  const entries = Object.entries(byKey).map(([key, count]) => ({
    key,
    count,
  }));
  entries.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return a.key.localeCompare(b.key);
  });
  return entries.slice(0, n);
}

function makeZeroFilledStatusMap(): Record<ProposalStatus, number> {
  const m: Record<string, number> = {};
  for (const s of PROPOSAL_STATUSES) m[s] = 0;
  return m as Record<ProposalStatus, number>;
}

function proposerKindFor(row: ProposalRow): ProposerKind {
  if (row.proposedByUserId !== null) return "user";
  if (row.proposedByAgentId !== null) return "agent";
  return "anonymous";
}

export function summarizeGraphCorrectionProposals(
  rows: readonly ProposalRow[],
  options: SummarizeGraphCorrectionProposalsOptions = {},
): GraphCorrectionProposalListSummary {
  const byStatus = makeZeroFilledStatusMap();
  const byProposalKind: Record<string, number> = {};
  const byProposer: Record<ProposerKind, number> = {
    user: 0,
    agent: 0,
    anonymous: 0,
  };
  const knownStatusSet = new Set<string>(PROPOSAL_STATUSES);
  let unknownStatusCount = 0;
  let terminalCount = 0;
  let inFlightCount = 0;
  let withRationaleCount = 0;
  const confidences: number[] = [];
  const ages: number[] = [];

  const now = (options.now ?? new Date()).getTime();
  const top = options.topN ?? DEFAULT_TOP_N;

  for (const row of rows) {
    if (knownStatusSet.has(row.status)) {
      byStatus[row.status] += 1;
      if (TERMINAL_PROPOSAL_STATUSES.has(row.status)) terminalCount += 1;
      else inFlightCount += 1;
    } else {
      unknownStatusCount += 1;
    }
    byProposalKind[row.proposalKind] =
      (byProposalKind[row.proposalKind] ?? 0) + 1;
    byProposer[proposerKindFor(row)] += 1;
    if (row.rationale !== null) withRationaleCount += 1;
    if (row.confidence !== null) confidences.push(row.confidence);
    ages.push(now - row.createdAt.getTime());
  }

  return {
    total: rows.length,
    byStatus,
    unknownStatusCount,
    byProposalKind,
    distinctProposalKindCount: Object.keys(byProposalKind).length,
    topProposalKinds: topN(byProposalKind, top),
    terminalCount,
    inFlightCount,
    byProposer,
    withRationaleCount,
    confidenceStats: computeStats(confidences),
    ageStats: computeStats(ages),
  };
}
