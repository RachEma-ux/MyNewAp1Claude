/**
 * RAC Retrieval Filter — Phase 4.
 *
 * Applies the D-RET-5 quality filter to chunks emitted by the
 * executor. Defaults are locked in `RAC_RETRIEVAL_FOUNDATION_DECISION.md`;
 * per-profile overrides come off `ags_rac_policies` (P2 table) — NULL
 * columns fall back to defaults.
 *
 * Rule order (every chunk passes through, in this exact sequence):
 *   1. citationRequired      — drop if no citation metadata
 *   2. piiPolicy="block"     — drop chunks where unit has block-severity PII
 *                              findings (U5-b.3 / RAC PII enforcement ADR)
 *   3. licensePolicy="block" — drop chunks whose unit license is in
 *                              licenseBlocklist (case-insensitive; U5-b.3)
 *   4. minScore              — drop below threshold
 *   5. freshnessMaxAgeDays   — drop chunks older than limit (NULL = no cap)
 *   6. dedupeBy="hash"       — SHA-256 of content; first occurrence wins
 *   7. sort by score DESC, stable on sourceChunkId
 *   8. maxChunks             — head-cap at the configured limit
 *
 * The filter is deterministic and side-effect-free. Per-rule rejection
 * counts are returned for trace metrics (P7); the caller forwards
 * them into `ags_rac_runtime_traces.chunks_filtered`.
 */

import { createHash } from "crypto";
import type { RacRetrievalChunk } from "./ingestion";
import type { RacPolicy } from "./sources";

// ── Locked defaults (D-RET-5) ────────────────────────────────────────

export interface RetrievalFilterConfig {
  minScore: number;
  maxChunks: number;
  dedupeBy: "hash" | "none";
  freshnessMaxAgeDays: number | null;
  citationRequired: boolean;
  sourcePermissionFilter: "workspace_id_match";
  piiPolicy: "warn" | "block" | "none";
  licensePolicy: "warn" | "block" | "none";
  /**
   * U5-b.3: license values that, when matched against a chunk's
   * `metadata.unitLicense`, cause rejection (only when
   * `licensePolicy === "block"`). Empty/undefined + "block" =
   * misconfiguration warning, no chunks rejected.
   */
  licenseBlocklist: string[];
}

export const DEFAULT_RETRIEVAL_FILTER_CONFIG: Readonly<RetrievalFilterConfig> =
  Object.freeze({
    minScore: 0.45,
    maxChunks: 8,
    dedupeBy: "hash" as const,
    freshnessMaxAgeDays: null,
    citationRequired: true,
    sourcePermissionFilter: "workspace_id_match" as const,
    piiPolicy: "warn",
    licensePolicy: "warn",
    licenseBlocklist: Object.freeze([]) as ReadonlyArray<string> as string[],
  });

export interface FilterRejectionCounts {
  citationRequired: number;
  belowMinScore: number;
  freshness: number;
  duplicate: number;
  capacity: number;
  /** U5-b.3: chunks dropped because their unit carries a block-severity PII finding. */
  piiBlocked: number;
  /** U5-b.3: chunks dropped because their unit's license is in policy.licenseBlocklist. */
  licenseBlocked: number;
}

export interface FilteredRetrieval {
  chunks: RacRetrievalChunk[];
  rejectionCounts: FilterRejectionCounts;
  warnings: string[];
}

export interface FilterRetrievalInput {
  chunks: RacRetrievalChunk[];
  /** Per-profile policy override row (P2 `ags_rac_policies`). NULL columns inherit defaults. */
  policy: RacPolicy | null;
  /** Optional clock injection for deterministic freshness tests. Defaults to `Date.now()`. */
  now?: () => number;
}

export function filterRetrieval(input: FilterRetrievalInput): FilteredRetrieval {
  const cfg = mergeConfig(input.policy);
  const now = input.now ?? Date.now;
  const counts: FilterRejectionCounts = {
    citationRequired: 0,
    belowMinScore: 0,
    freshness: 0,
    duplicate: 0,
    capacity: 0,
    piiBlocked: 0,
    licenseBlocked: 0,
  };
  const warnings: string[] = [];

  // ── 1. citationRequired ────────────────────────────────────────────
  let kept = cfg.citationRequired
    ? input.chunks.filter((c) => {
        const has = c.citation && c.citation.trim().length > 0;
        if (!has) counts.citationRequired += 1;
        return has;
      })
    : input.chunks.slice();

  // ── 2. piiPolicy = "block" → drop chunks whose unit has block-severity PII (U5-b.3) ──
  // The chunk-side projection (`unitPiiBlockSeverityCount`) is set
  // by `knowledge-unit-adapter.ts`. Chunks from sources that don't
  // project this metadata (e.g., GraphRAG) are passed through — no
  // false-positive rejection on adapters that can't surface PII signal.
  if (cfg.piiPolicy === "block") {
    kept = kept.filter((c) => {
      const count =
        typeof c.metadata?.unitPiiBlockSeverityCount === "number"
          ? (c.metadata.unitPiiBlockSeverityCount as number)
          : 0;
      if (count > 0) {
        counts.piiBlocked += 1;
        warnings.push(
          `pii_blocked: chunkId=${c.sourceChunkId} count=${count}`,
        );
        return false;
      }
      return true;
    });
  }

  // ── 3. licensePolicy = "block" + license_blocklist → drop matching chunks (U5-b.3) ──
  if (cfg.licensePolicy === "block") {
    if (cfg.licenseBlocklist.length === 0) {
      warnings.push(
        "license_block_misconfigured: licensePolicy=block but licenseBlocklist is empty; no chunks rejected",
      );
    } else {
      // G6-c2: case-insensitive comparison so blocklisting "MIT" also
      // matches a unit tagged "mit" / "Mit" / etc. Canonical SPDX
      // casing isn't enforced at extraction time, so the comparison
      // must absorb the variance.
      const blocklist = new Set(cfg.licenseBlocklist.map((l) => l.toLowerCase()));
      kept = kept.filter((c) => {
        const license =
          typeof c.metadata?.unitLicense === "string"
            ? (c.metadata.unitLicense as string)
            : null;
        if (license != null && blocklist.has(license.toLowerCase())) {
          counts.licenseBlocked += 1;
          warnings.push(
            `license_blocked: chunkId=${c.sourceChunkId} license=${license}`,
          );
          return false;
        }
        return true;
      });
    }
  }

  // ── 4. minScore ────────────────────────────────────────────────────
  kept = kept.filter((c) => {
    const ok = typeof c.score === "number" && c.score >= cfg.minScore;
    if (!ok) counts.belowMinScore += 1;
    return ok;
  });

  // ── 5. freshnessMaxAgeDays ────────────────────────────────────────
  if (cfg.freshnessMaxAgeDays != null) {
    const limitMs = cfg.freshnessMaxAgeDays * 86_400_000;
    const nowMs = now();
    kept = kept.filter((c) => {
      const created = readChunkTimestamp(c);
      if (created == null) return true; // unknown age, keep — operators set freshness only when metadata is reliable
      const ok = nowMs - created <= limitMs;
      if (!ok) counts.freshness += 1;
      return ok;
    });
  }

  // ── 6. dedupeBy=hash ──────────────────────────────────────────────
  if (cfg.dedupeBy === "hash") {
    const seen = new Set<string>();
    const deduped: RacRetrievalChunk[] = [];
    for (const c of kept) {
      const h = sha256(c.content);
      if (seen.has(h)) {
        counts.duplicate += 1;
        continue;
      }
      seen.add(h);
      deduped.push(c);
    }
    kept = deduped;
  } else if (cfg.dedupeBy && cfg.dedupeBy !== "none") {
    warnings.push(
      `unsupported_dedupe_by=${cfg.dedupeBy}; falling back to no dedupe`,
    );
  }

  // ── 7. sort by score DESC, stable on sourceChunkId ────────────────
  kept.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.sourceChunkId.localeCompare(b.sourceChunkId);
  });

  // ── 8. maxChunks head-cap ─────────────────────────────────────────
  if (kept.length > cfg.maxChunks) {
    counts.capacity = kept.length - cfg.maxChunks;
    kept = kept.slice(0, cfg.maxChunks);
  }

  // U5-b.3: piiPolicy / licensePolicy enforcement is now wired at
  // steps 2 + 3 above. `warn` mode still emits an info-only trace
  // breadcrumb here so operators see the policy was active even
  // when no chunks tripped block-mode.
  if (cfg.piiPolicy === "warn" || cfg.licensePolicy === "warn") {
    warnings.push(
      `policy_warnmode_active: pii=${cfg.piiPolicy} license=${cfg.licensePolicy}`,
    );
  }

  return { chunks: kept, rejectionCounts: counts, warnings };
}

function mergeConfig(policy: RacPolicy | null): RetrievalFilterConfig {
  const d = DEFAULT_RETRIEVAL_FILTER_CONFIG;
  if (!policy) return d;
  return {
    minScore: policy.minScore ?? d.minScore,
    maxChunks: policy.maxChunks ?? d.maxChunks,
    dedupeBy: ((policy.dedupeBy as "hash" | "none" | null) ?? d.dedupeBy) as "hash",
    freshnessMaxAgeDays:
      policy.freshnessMaxAgeDays ?? d.freshnessMaxAgeDays,
    citationRequired: policy.citationRequired ?? d.citationRequired,
    sourcePermissionFilter: (policy.sourcePermissionFilter ??
      d.sourcePermissionFilter) as "workspace_id_match",
    piiPolicy: (policy.piiPolicy ?? d.piiPolicy) as "warn" | "block" | "none",
    licensePolicy: (policy.licensePolicy ?? d.licensePolicy) as "warn" | "block" | "none",
    licenseBlocklist: policy.licenseBlocklist ?? [...d.licenseBlocklist],
  };
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/**
 * Pull a creation timestamp out of a chunk's metadata blob. Recognised
 * keys (in order): `createdAt`, `created_at`, `timestamp`. Returns
 * null when none are present or parseable.
 */
function readChunkTimestamp(c: RacRetrievalChunk): number | null {
  const md = c.metadata;
  if (!md) return null;
  for (const key of ["createdAt", "created_at", "timestamp"] as const) {
    const v = md[key];
    if (v == null) continue;
    if (typeof v === "number") return v > 1e12 ? v : v * 1000; // sec → ms when small
    if (typeof v === "string") {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) return t;
    }
  }
  return null;
}
