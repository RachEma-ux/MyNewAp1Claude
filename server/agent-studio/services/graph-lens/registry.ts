/**
 * Graph Lens registry — Phase 24 §T-F.1 (remaining execution plan).
 *
 * Process-local registry of `GraphLensDefinition` values. Phase 24
 * T-F.2..T-F.5 install concrete lenses via `registerGraphLens`;
 * `listGraphLenses` + `getGraphLens` power the operator browser UI
 * + the future `agentStudio.graphLens.*` tRPC procedures.
 *
 * Idempotency policy: re-registering the SAME id throws
 * `GraphLensIdAlreadyRegisteredError`. The boot installer flow is
 * "register once at startup, never re-register." A reload pathway,
 * if it ships, must explicitly call `__resetGraphLensRegistryForTests`
 * (test-only) or a future `unregisterGraphLens` (not yet shipped —
 * the production flow restarts the process for boot-time lens
 * changes).
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - This file imports ONLY types from `./contracts.js`. No graph
 *     access, no model execution, no tool dispatch, no credential
 *     reads.
 *   - Source-scan tested in `tests/agent-studio/graph-lens-registry.test.ts`.
 */

import {
  GRAPH_LENS_KINDS,
  GRAPH_LENS_LAYOUTS,
  GRAPH_LENS_GOVERNANCE_SCOPES,
  GraphLensIdAlreadyRegisteredError,
  type GraphLensDefinition,
  type GraphLensKind,
  type GraphLensLayout,
  type GraphLensGovernanceScope,
} from "./contracts.js";

// ============================================================================
// Module-local state
// ============================================================================

const registry = new Map<string, GraphLensDefinition>();

// ============================================================================
// Public API
// ============================================================================

/**
 * Register a lens definition. Idempotency: re-registering the SAME id
 * throws. The boot installer flow registers once at startup.
 */
export function registerGraphLens(def: GraphLensDefinition): void {
  if (registry.has(def.id)) {
    throw new GraphLensIdAlreadyRegisteredError(def.id);
  }
  registry.set(def.id, def);
}

/**
 * Returns the lens definition for the given id, or `undefined` when
 * no lens is registered. Callers handle the missing case explicitly;
 * an explicit `GraphLensNotFoundError`-throwing variant lives in the
 * future tRPC layer.
 */
export function getGraphLens(id: string): GraphLensDefinition | undefined {
  return registry.get(id);
}

/**
 * List every registered lens. Returned order is registration order
 * (Map insertion order). The operator browser may re-sort.
 */
export function listGraphLenses(): ReadonlyArray<GraphLensDefinition> {
  return Array.from(registry.values());
}

/**
 * List lenses filtered by kind. Useful for the lens browser's
 * tab-per-kind UI shape.
 */
export function listGraphLensesByKind(
  kind: GraphLensKind,
): ReadonlyArray<GraphLensDefinition> {
  return Array.from(registry.values()).filter((def) => def.kind === kind);
}

/**
 * Returns the registry size — operator dashboard "N lenses registered"
 * inline gauge.
 */
export function getGraphLensRegistrySize(): number {
  return registry.size;
}

/**
 * Test-only — clear the registry between tests so registration order
 * is deterministic. Production code MUST NOT call this; the test
 * harness uses it inside `beforeEach`.
 */
export function __resetGraphLensRegistryForTests(): void {
  registry.clear();
}

// ============================================================================
// Registry summary (T-F.9)
// ============================================================================

export interface GraphLensRegistrySummary {
  readonly total: number;
  readonly byKind: Readonly<Record<GraphLensKind, number>>;
  readonly byLayout: Readonly<Record<GraphLensLayout, number>>;
  readonly byGovernanceScope: Readonly<
    Record<GraphLensGovernanceScope, number>
  >;
}

/**
 * Returns a stable-shape summary of the currently-registered lenses:
 * counts by kind, by layout, by governance scope. Every closed-
 * taxonomy axis key is present at zero or higher — operator
 * dashboards bind to a fixed column set even when no lenses are
 * registered (cold-boot state).
 *
 * Reads the module-local registry. Pure with respect to its inputs
 * (no external I/O); the output depends on registration state.
 */
export function summarizeGraphLensRegistry(): GraphLensRegistrySummary {
  const byKind: Record<string, number> = {};
  for (const k of GRAPH_LENS_KINDS) byKind[k] = 0;
  const byLayout: Record<string, number> = {};
  for (const l of GRAPH_LENS_LAYOUTS) byLayout[l] = 0;
  const byGovernanceScope: Record<string, number> = {};
  for (const g of GRAPH_LENS_GOVERNANCE_SCOPES) byGovernanceScope[g] = 0;

  for (const def of registry.values()) {
    byKind[def.kind] += 1;
    byLayout[def.layout] += 1;
    byGovernanceScope[def.governanceScope] += 1;
  }
  return {
    total: registry.size,
    byKind: byKind as Readonly<Record<GraphLensKind, number>>,
    byLayout: byLayout as Readonly<Record<GraphLensLayout, number>>,
    byGovernanceScope: byGovernanceScope as Readonly<
      Record<GraphLensGovernanceScope, number>
    >,
  };
}
