/**
 * Graph backend health-alert evaluator + scanner.
 *
 * V1+ execution plan Phase J-1 (production hardening) implementation.
 * Closes the alerting half of the Neo4j CE → Aura migration runbook
 * (§1 trigger conditions): an operator should not need to eyeball
 * dashboards to know when a CE-limit trigger has fired.
 *
 * Design:
 *   - `evaluateHealth()` is a pure function: takes a `BackendHealth`
 *     snapshot + thresholds, returns the alert decisions that should
 *     be raised or resolved. No I/O. Test seam #1.
 *   - `runHealthAlertScan()` composes `repository.health()` +
 *     `evaluateHealth()` + persistence. The repository, thresholds,
 *     and persist callback are all injectable so tests never touch
 *     a real backend.
 *   - `persistHealthAlertDecisions()` is the default persistence
 *     path — writes to `ags_runtime_alerts`. No-ops if ASDB is not
 *     configured (test-mode fall-through, mirrors the drift cron).
 *
 * Hard-rule compliance (CLAUDE.md Non-Build List):
 *   - GraphRepository is the only graph access path — the scanner
 *     calls `repository.health()`, never reaches a driver directly.
 *   - No graph mutation. Alerts only describe observed state;
 *     remediation routes through the operator runbook (Phase J-1).
 *   - Postgres = source of truth for alerts. Alert rows live in
 *     ASDB; no parallel store.
 *
 * Severity ladder (closed):
 *   - `info`     — observable state change worth noting (e.g.
 *                  recovered from degraded → healthy).
 *   - `warning`  — threshold breach below the page-the-operator
 *                  level. Latency > 1.5× p95 budget, status
 *                  `degraded`. Default escalation target.
 *   - `critical` — page-the-operator. Status `unavailable`, or
 *                  latency > 3× p95 budget.
 *
 * Alert key taxonomy (closed for V1.0; additive in V1.5+):
 *   - `graph_health_latency_high`
 *   - `graph_health_degraded`
 *   - `graph_health_unavailable`
 */

import { sql, and, eq, isNull } from "drizzle-orm";

import { getAsDb } from "../../db/connection.js";
import { agsRuntimeAlerts } from "../../../../drizzle/tables/agent-studio-runtime-alerts.js";
import { getGraphRepository } from "./repository/index.js";
import type {
  BackendHealth,
  GraphRepository,
} from "./repository/types.js";

// ============================================================================
// Severity + alert key taxonomy
// ============================================================================

export type AlertSeverity = "info" | "warning" | "critical";

export const GRAPH_HEALTH_ALERT_KEYS = [
  "graph_health_latency_high",
  "graph_health_degraded",
  "graph_health_unavailable",
] as const;

export type GraphHealthAlertKey = (typeof GRAPH_HEALTH_ALERT_KEYS)[number];

// ============================================================================
// Threshold contract
// ============================================================================

/**
 * Operator-tunable threshold envelope. The defaults are derived from
 * the §1 trigger conditions in the Neo4j CE → Aura migration runbook;
 * see that runbook for the rationale.
 */
export interface HealthThresholds {
  /** Latency (ms) at which a `warning` is raised. */
  readonly latencyWarnMs: number;
  /** Latency (ms) at which the severity escalates to `critical`. */
  readonly latencyCriticalMs: number;
}

export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  // 750 ms warn / 2000 ms critical. Anchored to the Phase 14 runtime
  // SLO p95 budget (500 ms) — warn at 1.5×, critical at 4×. A real
  // Aura migration trigger fires at the "warn sustained 7 days" mark
  // per the runbook; this evaluator emits the breach-event row, the
  // runbook drives the sustained-window decision.
  latencyWarnMs: 750,
  latencyCriticalMs: 2000,
};

// ============================================================================
// Evaluator (pure)
// ============================================================================

export interface AlertDecision {
  readonly alertKey: GraphHealthAlertKey;
  readonly severity: AlertSeverity;
  readonly scope: string;
  readonly observedValue: Record<string, unknown>;
  readonly threshold: Record<string, unknown>;
  readonly details?: Record<string, unknown>;
}

export interface EvaluateHealthInput {
  readonly health: BackendHealth;
  readonly thresholds?: HealthThresholds;
  readonly scope?: string;
}

/**
 * Pure function — no I/O. Given a health snapshot + thresholds,
 * return the alert decisions that should be raised. Returning an
 * empty array means the backend is within budget.
 */
export function evaluateHealth({
  health,
  thresholds = DEFAULT_HEALTH_THRESHOLDS,
  scope = "default",
}: EvaluateHealthInput): AlertDecision[] {
  const decisions: AlertDecision[] = [];

  if (health.status === "unavailable") {
    decisions.push({
      alertKey: "graph_health_unavailable",
      severity: "critical",
      scope,
      observedValue: {
        status: health.status,
        errors: health.errors ?? [],
      },
      threshold: { expectedStatus: "healthy" },
      details: { backend: health.capabilities.backendKey },
    });
    // When unavailable, latency is irrelevant — skip the latency
    // evaluation below. The runbook says: address availability
    // first, then revisit latency once the backend responds.
    return decisions;
  }

  if (health.status === "degraded") {
    decisions.push({
      alertKey: "graph_health_degraded",
      severity: "warning",
      scope,
      observedValue: {
        status: health.status,
        errors: health.errors ?? [],
      },
      threshold: { expectedStatus: "healthy" },
      details: { backend: health.capabilities.backendKey },
    });
  }

  // Latency breach is independent of `degraded` so the operator can
  // tell apart "backend says degraded" from "backend says healthy
  // but is slow" — both can be true at once.
  if (typeof health.latencyMs === "number") {
    if (health.latencyMs >= thresholds.latencyCriticalMs) {
      decisions.push({
        alertKey: "graph_health_latency_high",
        severity: "critical",
        scope,
        observedValue: { latencyMs: health.latencyMs },
        threshold: {
          latencyWarnMs: thresholds.latencyWarnMs,
          latencyCriticalMs: thresholds.latencyCriticalMs,
        },
        details: { backend: health.capabilities.backendKey },
      });
    } else if (health.latencyMs >= thresholds.latencyWarnMs) {
      decisions.push({
        alertKey: "graph_health_latency_high",
        severity: "warning",
        scope,
        observedValue: { latencyMs: health.latencyMs },
        threshold: {
          latencyWarnMs: thresholds.latencyWarnMs,
          latencyCriticalMs: thresholds.latencyCriticalMs,
        },
        details: { backend: health.capabilities.backendKey },
      });
    }
  }

  return decisions;
}

// ============================================================================
// Persistence
// ============================================================================

export interface PersistResult {
  readonly raised: number;
  readonly resolved: number;
}

/**
 * Default persistence path — writes new alert rows + resolves stale
 * open rows. No-ops if ASDB is not configured (test-mode
 * fall-through). Returns counts so the scanner can report progress.
 */
export async function persistHealthAlertDecisions(
  decisions: ReadonlyArray<AlertDecision>,
  scope: string = "default",
): Promise<PersistResult> {
  const db = getAsDb();
  if (!db) return { raised: 0, resolved: 0 };

  // Resolve open alerts whose key+scope did NOT appear in the latest
  // decision set. Mirrors the standard SRE-pager dedup pattern: if
  // we no longer observe a breach, the previous breach is over.
  const observedKeys = new Set(decisions.map((d) => d.alertKey));
  const allKeys = GRAPH_HEALTH_ALERT_KEYS;
  const toResolve = allKeys.filter((k) => !observedKeys.has(k));

  let resolved = 0;
  for (const key of toResolve) {
    const res = await db
      .update(agsRuntimeAlerts)
      .set({ resolvedAt: new Date() })
      .where(
        and(
          eq(agsRuntimeAlerts.alertKey, key),
          eq(agsRuntimeAlerts.scope, scope),
          isNull(agsRuntimeAlerts.resolvedAt),
        ),
      );
    // drizzle-orm postgres-js `update` returns rowCount in result.
    // Driver inconsistency: some return `Result[]` with length, some
    // return `{ rowCount }`. Be defensive — both shapes mean ≥1.
    const cnt =
      typeof (res as { rowCount?: number }).rowCount === "number"
        ? (res as { rowCount: number }).rowCount
        : Array.isArray(res)
          ? (res as unknown[]).length
          : 0;
    resolved += cnt;
  }

  if (decisions.length === 0) {
    return { raised: 0, resolved };
  }

  await db.insert(agsRuntimeAlerts).values(
    decisions.map((d) => ({
      alertKey: d.alertKey,
      severity: d.severity,
      scope: d.scope,
      observedValue: d.observedValue,
      threshold: d.threshold,
      details: d.details ?? null,
    })),
  );

  return { raised: decisions.length, resolved };
}

// ============================================================================
// Scanner (composes evaluator + persistence)
// ============================================================================

export interface HealthAlertScanInput {
  /** Test seam — supply a stub repository. */
  readonly repository?: GraphRepository;
  /** Override the threshold envelope. */
  readonly thresholds?: HealthThresholds;
  /** Scope tag. Default "default". */
  readonly scope?: string;
  /** Test seam — replace the default persistence path. */
  readonly persist?: (
    decisions: ReadonlyArray<AlertDecision>,
    scope: string,
  ) => Promise<PersistResult>;
}

export interface HealthAlertScanResult {
  readonly scope: string;
  readonly scannedAt: string;
  readonly status: BackendHealth["status"];
  readonly latencyMs?: number;
  readonly decisions: ReadonlyArray<AlertDecision>;
  readonly persisted: PersistResult;
}

/**
 * Run one health-alert scan against the active GraphRepository (or
 * an injected one), evaluate against thresholds, persist results.
 * Returns a structured summary suitable for cron-status surfaces or
 * direct operator invocation.
 */
export async function runHealthAlertScan(
  input: HealthAlertScanInput = {},
): Promise<HealthAlertScanResult> {
  const repository = input.repository ?? getGraphRepository();
  const scope = input.scope ?? "default";
  const thresholds = input.thresholds ?? DEFAULT_HEALTH_THRESHOLDS;
  const persist = input.persist ?? persistHealthAlertDecisions;

  const health = await repository.health();
  const decisions = evaluateHealth({ health, thresholds, scope });
  const persisted = await persist(decisions, scope);

  return {
    scope,
    scannedAt: new Date().toISOString(),
    status: health.status,
    latencyMs: health.latencyMs,
    decisions,
    persisted,
  };
}

// ============================================================================
// Query helpers (operator-facing)
// ============================================================================

/**
 * Return open (un-resolved) alerts for the given scope. Used by the
 * future operator dashboard surface; exposed here so callers don't
 * need to import drizzle directly.
 */
export async function listOpenHealthAlerts(
  scope: string = "default",
): Promise<
  ReadonlyArray<{
    id: number;
    alertKey: string;
    severity: string;
    raisedAt: Date;
    observedValue: unknown;
    threshold: unknown;
  }>
> {
  const db = getAsDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: agsRuntimeAlerts.id,
      alertKey: agsRuntimeAlerts.alertKey,
      severity: agsRuntimeAlerts.severity,
      raisedAt: agsRuntimeAlerts.raisedAt,
      observedValue: agsRuntimeAlerts.observedValue,
      threshold: agsRuntimeAlerts.threshold,
    })
    .from(agsRuntimeAlerts)
    .where(
      and(eq(agsRuntimeAlerts.scope, scope), isNull(agsRuntimeAlerts.resolvedAt)),
    )
    .orderBy(sql`${agsRuntimeAlerts.raisedAt} desc`);
  return rows;
}
