/**
 * Application Wiring Inventory — Readiness scoring
 *
 * Produces a per-module 0-100 readiness score from per-area statuses
 * using fixed weights. The weights live in `AREA_WEIGHTS` so they are
 * easy to tune without touching the inventory builder.
 *
 * Scoring rules:
 *   - Each area contributes `score × weight` to the numerator and
 *     `weight` to the denominator.
 *   - Areas with `status: "not-applicable"` are excluded from BOTH the
 *     numerator and denominator (modules without DBs aren't penalized
 *     for not having one).
 *   - A required area that is `missing`/`broken`/`blocked` is recorded
 *     in `blockers` so the readinessStatus can downgrade past the
 *     score-based bucket.
 *   - Optional areas that are `partial`/`declared-only` go into
 *     `warnings` instead — visible but not blocking.
 *
 * The readiness status thresholds (90 / 75 / 50 / 1) match the user
 * instruction. They live in `readinessStatusFor` in `./types.ts` so
 * UI code can use the same buckets.
 */
import {
  readinessStatusFor,
  type ModuleReadinessStatus,
  type ModuleWiringAreaStatus,
  type WiringArea,
} from "./types";

export const AREA_WEIGHTS: Record<WiringArea, number> = {
  manifest: 10,
  "server-router": 10,
  "client-route": 8,
  navigation: 6,
  "public-api": 8,
  gateway: 8,
  database: 10,
  permission: 8,
  governance: 10,
  event: 5,
  handoff: 5,
  runtime: 8,
  "port-endpoint": 4,
  "agent-provider": 5,
  observability: 5,
  test: 10,
  documentation: 5,
};

export interface ReadinessResult {
  score: number;
  status: ModuleReadinessStatus;
  blockers: string[];
  warnings: string[];
}

export function computeReadiness(areas: ModuleWiringAreaStatus[]): ReadinessResult {
  let numerator = 0;
  let denominator = 0;
  const blockers: string[] = [];
  const warnings: string[] = [];

  for (const a of areas) {
    if (a.status === "not-applicable") continue;
    const weight = AREA_WEIGHTS[a.area] ?? 5;
    numerator += a.score * weight;
    denominator += 100 * weight;

    if (a.required && (a.status === "missing" || a.status === "broken" || a.status === "blocked")) {
      blockers.push(`${a.area}: ${a.status}${a.missing.length ? ` (${a.missing.join(", ")})` : ""}`);
    } else if (a.status === "partial" || a.status === "declared-only") {
      warnings.push(`${a.area}: ${a.status}${a.missing.length ? ` (${a.missing.join(", ")})` : ""}`);
    } else if (a.status === "broken") {
      warnings.push(`${a.area}: broken`);
    }
  }

  const score = denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);
  const status = readinessStatusFor(score, blockers.length);
  return { score, status, blockers, warnings };
}
