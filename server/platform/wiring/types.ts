/**
 * Application Wiring Inventory — Types
 *
 * The Application Wiring Inventory (AWI) is a read-model that observes
 * how every module is wired into the platform. It builds on the
 * existing `server/platform/modules/wiring-inventory.ts` parser, which
 * provides static manifest data, and adds:
 *
 *   - per-area status / severity / readiness score
 *   - dependency graph
 *   - aggregate matrix view
 *   - readiness rollup per module
 *
 * AWI is observe-only. It must not own module business logic, must not
 * import module private internals, must not mutate state, and must not
 * be a coordinator. See docs/architecture/modularity/APPLICATION_WIRING_INVENTORY.md
 * for the full charter.
 */
import type { ModuleHealthState } from "../modules/types";

/* ------------------------------------------------------------------ */
/*  Areas / status / severity                                         */
/* ------------------------------------------------------------------ */

/**
 * The wiring areas AWI scores per module. The set is intentionally
 * broader than the legacy `WiringFinding.lane` enum in
 * `server/platform/modules/wiring-types.ts` — AWI splits public-api
 * (declared) from gateway (registered), navigation from client-route,
 * and adds areas the legacy harness didn't cover (port-endpoint,
 * agent-provider, observability, test, documentation).
 */
export type WiringArea =
  | "manifest"
  | "server-router"
  | "client-route"
  | "navigation"
  | "public-api"
  | "gateway"
  | "database"
  | "permission"
  | "governance"
  | "event"
  | "handoff"
  | "runtime"
  | "port-endpoint"
  | "agent-provider"
  | "observability"
  | "test"
  | "documentation";

/**
 * `wired`           — declared and verified to be hooked up at runtime.
 * `declared-only`   — declared in manifest but no runtime registration found.
 * `partial`         — some sub-items wired, others missing.
 * `missing`         — required by another contract but no declaration exists.
 * `broken`          — declared and registered but a sanity check fails
 *                     (e.g. ownedTables empty for an `owned` DB).
 * `blocked`         — a hard dependency is `missing`/`broken`/`blocked`.
 * `not-applicable`  — module legitimately does not participate in this area.
 */
export type WiringStatus =
  | "wired"
  | "declared-only"
  | "missing"
  | "broken"
  | "partial"
  | "not-applicable"
  | "blocked";

export type WiringSeverity =
  | "blocker"
  | "high"
  | "medium"
  | "low"
  | "follow-up"
  | "none";

/* ------------------------------------------------------------------ */
/*  Evidence                                                          */
/* ------------------------------------------------------------------ */

export interface WiringEvidence {
  kind:
    | "manifest"
    | "file"
    | "router"
    | "client-route"
    | "nav"
    | "db"
    | "governance"
    | "gateway"
    | "event"
    | "handoff"
    | "runtime"
    | "test"
    | "doc"
    | "check";
  /** Repository-relative path when the evidence is a file. */
  path?: string;
  /** Identifier (action key, event type, route path, etc.) when applicable. */
  key?: string;
  description: string;
  /** True when the evidence was observed; false when it was expected and missing. */
  present: boolean;
}

/* ------------------------------------------------------------------ */
/*  Per-area + per-module records                                      */
/* ------------------------------------------------------------------ */

export interface ModuleWiringAreaStatus {
  moduleKey: string;
  area: WiringArea;
  status: WiringStatus;
  severity: WiringSeverity;
  /** 0–100 score for this area in this module. Excluded from rollups when not-applicable. */
  score: number;
  required: boolean;
  evidence: WiringEvidence[];
  missing: string[];
  notes?: string;
}

export type ModuleReadinessStatus =
  | "fully-wired"
  | "mostly-wired"
  | "partially-wired"
  | "declared-only"
  | "blocked";

export interface ModuleWiringInventory {
  moduleKey: string;
  moduleName: string;
  /** Optional classification — backend-only, ui+backend, etc. */
  moduleType?: string;
  lifecycleStatus?: string;
  owner?: string;
  runtimeMode?: string;
  databaseKind?: string;
  /** Last-observed health state from the Module Registry, when available. */
  lastHealth?: ModuleHealthState | null;
  areas: ModuleWiringAreaStatus[];
  dependencies: ModuleDependencyEdge[];
  readinessScore: number;
  readinessStatus: ModuleReadinessStatus;
  blockers: string[];
  warnings: string[];
}

/* ------------------------------------------------------------------ */
/*  Dependency graph                                                   */
/* ------------------------------------------------------------------ */

export interface ModuleDependencyEdge {
  sourceModule: string;
  target: string;
  targetType:
    | "module"
    | "database"
    | "api"
    | "event"
    | "handoff"
    | "governance"
    | "agent"
    | "provider"
    | "runtime"
    | "port"
    | "document"
    | "unknown";
  dependencyType: string;
  required: boolean;
  evidence?: string;
}

export interface WiringGraphNode {
  id: string;
  label: string;
  type:
    | "module"
    | "database"
    | "api"
    | "event"
    | "handoff"
    | "governance"
    | "runtime"
    | "agent"
    | "provider"
    | "port"
    | "doc";
  status?: string;
  readinessScore?: number;
}

export interface WiringGraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  required: boolean;
  status?: string;
}

export interface WiringGraph {
  nodes: WiringGraphNode[];
  edges: WiringGraphEdge[];
  /** Cycles found by tarjan-style traversal. Each entry is the cycle path. */
  cycles: string[][];
}

/* ------------------------------------------------------------------ */
/*  Matrix + summary                                                   */
/* ------------------------------------------------------------------ */

export interface WiringInventorySummary {
  moduleCount: number;
  fullyWiredCount: number;
  mostlyWiredCount: number;
  partialCount: number;
  blockedCount: number;
  declaredOnlyCount: number;
  averageReadinessScore: number;
  blockers: number;
  warnings: number;
  missingRequiredWires: number;
}

export interface WiringMatrix {
  generatedAt: string;
  modules: ModuleWiringInventory[];
  columns: WiringArea[];
  summary: WiringInventorySummary;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Default order for matrix columns. The matrix UI uses this; downstream
 * consumers should not depend on the order to be stable across releases
 * — treat it as presentational only.
 */
export const DEFAULT_MATRIX_COLUMNS: WiringArea[] = [
  "manifest",
  "server-router",
  "client-route",
  "navigation",
  "public-api",
  "gateway",
  "database",
  "permission",
  "governance",
  "event",
  "handoff",
  "runtime",
  "port-endpoint",
  "agent-provider",
  "observability",
  "test",
  "documentation",
];

export function readinessStatusFor(score: number, blockerCount: number): ModuleReadinessStatus {
  if (blockerCount > 0 && score < 50) return "blocked";
  if (score >= 90) return "fully-wired";
  if (score >= 75) return "mostly-wired";
  if (score >= 50) return "partially-wired";
  if (score > 0) return "declared-only";
  return "blocked";
}
