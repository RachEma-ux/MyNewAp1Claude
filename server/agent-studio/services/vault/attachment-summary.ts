/**
 * `summarizeAttachments` — stable-shape aggregator over the
 * `AttachmentRow[]` surface (T-B.8).
 *
 * 26th instantiation of the lesson-30 aggregator-pair pattern.
 * Composite slice — composes the derived-closed-taxonomy variant
 * (T-G.67-style) with sparse + top-N + complementary partition +
 * NumericStats + nullable-presence gauges. No new structural variant;
 * the catalog remains saturated at 15 entries @ T-A.15 / #1205.
 *
 * Use case: vault attachment storage dashboard ("128 attachments
 * — 64 images / 12 PDFs / 52 other — 3.2GB total / 25MB mean —
 * 4 orphan, 124 anchored") + per-MIME drill-down for ops to spot
 * exotic types eating quota.
 *
 * Stable-shape guarantees:
 *   - `byMimeCategory` is CLOSED (image / pdf / other — derived from
 *     `isImageMimeType` / `isPdfMimeType` predicates). Zero-filled.
 *   - `byMimeType` is sparse (open-ended string axis).
 *   - `topMimeTypes` truncates at 10 entries; ties alphabetical.
 *   - `anchoredCount + orphanCount === total` (complementary partition
 *     on `noteId` nullable).
 *   - `sourceArtifactCount + nonSourceArtifactCount === total`
 *     (complementary on `isSourceArtifact`).
 *   - `sizeStats` is null when input is empty (NumericStats over
 *     `sizeBytes`).
 *   - `ageStats` is null when input is empty.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure function. No DB I/O. No `credential-resolver` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` imports.
 */

import type { AttachmentRow } from "./attachments.js";
import {
  isImageMimeType,
  isPdfMimeType,
} from "./attachments.js";

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

/** Derived closed-taxonomy over MIME categories. */
export const ATTACHMENT_MIME_CATEGORIES = [
  "image",
  "pdf",
  "other",
] as const;
export type AttachmentMimeCategory =
  (typeof ATTACHMENT_MIME_CATEGORIES)[number];

function mimeCategoryFor(mime: string): AttachmentMimeCategory {
  if (isImageMimeType(mime)) return "image";
  if (isPdfMimeType(mime)) return "pdf";
  return "other";
}

export interface AttachmentListSummary {
  readonly total: number;
  /** Per-category count (derived from `isImageMimeType` / `isPdfMimeType`).
   *  Zero-filled across the closed taxonomy. */
  readonly byMimeCategory: Readonly<Record<AttachmentMimeCategory, number>>;
  /** Per-mimeType count. Sparse — open-ended string axis. */
  readonly byMimeType: Readonly<Record<string, number>>;
  /** Distinct mimeType values. */
  readonly distinctMimeTypeCount: number;
  /** Top 10 mimeTypes by count, sorted descending. Ties alphabetical. */
  readonly topMimeTypes: readonly CountEntry[];
  /** Rows with `noteId !== null` (anchored to a note). */
  readonly anchoredCount: number;
  /** Rows with `noteId === null` (vault-level, no anchor). Complementary
   *  to anchoredCount; sum-to-total. */
  readonly orphanCount: number;
  /** Rows with `isSourceArtifact === true`. */
  readonly sourceArtifactCount: number;
  /** Rows with `isSourceArtifact === false`. Complementary; sum-to-total. */
  readonly nonSourceArtifactCount: number;
  /** Rows with `createdByUserId !== null`. */
  readonly withCreatorCount: number;
  /** Distinct vaultId values. */
  readonly distinctVaultCount: number;
  /** NumericStats over `sizeBytes`. Null on empty input. */
  readonly sizeStats: NumericStats | null;
  /** Age stats in ms from `createdAt` to `now`. Null on empty input. */
  readonly ageStats: NumericStats | null;
}

export interface SummarizeAttachmentsOptions {
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

function makeZeroFilledCategoryMap(): Record<AttachmentMimeCategory, number> {
  const m: Record<AttachmentMimeCategory, number> = {
    image: 0,
    pdf: 0,
    other: 0,
  };
  return m;
}

export function summarizeAttachments(
  rows: readonly AttachmentRow[],
  options: SummarizeAttachmentsOptions = {},
): AttachmentListSummary {
  const byMimeCategory = makeZeroFilledCategoryMap();
  const byMimeType: Record<string, number> = {};
  const vaultIds = new Set<number>();
  let anchoredCount = 0;
  let orphanCount = 0;
  let sourceArtifactCount = 0;
  let nonSourceArtifactCount = 0;
  let withCreatorCount = 0;
  const sizes: number[] = [];
  const ages: number[] = [];

  const now = (options.now ?? new Date()).getTime();
  const top = options.topN ?? DEFAULT_TOP_N;

  for (const row of rows) {
    byMimeType[row.mimeType] = (byMimeType[row.mimeType] ?? 0) + 1;
    byMimeCategory[mimeCategoryFor(row.mimeType)] += 1;
    vaultIds.add(row.vaultId);
    if (row.noteId !== null) anchoredCount += 1;
    else orphanCount += 1;
    if (row.isSourceArtifact) sourceArtifactCount += 1;
    else nonSourceArtifactCount += 1;
    if (row.createdByUserId !== null) withCreatorCount += 1;
    sizes.push(row.sizeBytes);
    ages.push(now - row.createdAt.getTime());
  }

  return {
    total: rows.length,
    byMimeCategory,
    byMimeType,
    distinctMimeTypeCount: Object.keys(byMimeType).length,
    topMimeTypes: topN(byMimeType, top),
    anchoredCount,
    orphanCount,
    sourceArtifactCount,
    nonSourceArtifactCount,
    withCreatorCount,
    distinctVaultCount: vaultIds.size,
    sizeStats: computeStats(sizes),
    ageStats: computeStats(ages),
  };
}
