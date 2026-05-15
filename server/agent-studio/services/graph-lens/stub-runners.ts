/**
 * Stub lens runners — Phase 24 §T-F.6.
 *
 * 8 stub runners, one per closed `GRAPH_LENS_KINDS` value. Each
 * returns an empty `LensSnapshot` with the correct `kind` + `layout`
 * + `producedAt`. They're explicitly NOT placeholder garbage — they
 * satisfy the runner contract so the operator UI can render an
 * empty-state for every defined lens, and concrete-runner shipping
 * PRs replace the stubs one kind at a time.
 *
 * Why ship stubs first:
 *   - The 8 default lens definitions (#992) are registered at boot;
 *     without runners, `runLens(def)` throws
 *     `LensRunnerNotRegisteredForKindError` on every lens render
 *     attempt. Stubs return an empty-but-valid snapshot so the
 *     operator browser doesn't 500 — instead it surfaces "No data
 *     in this lens yet" which is more useful than a stack trace.
 *   - Per-kind concrete runners can replace stubs incrementally
 *     without coordinating an N-way drop.
 *   - Empty-state shape is the simplest possible permission-aware
 *     surface: 0 nodes / 0 edges / 0 hidden / not truncated. Future
 *     concrete runners follow the same shape just with real data.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No DB I/O — stubs are pure synthesized snapshots.
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - Source-scan tested.
 */

import {
  GRAPH_LENS_KINDS,
  type GraphLensDefinition,
  type GraphLensKind,
} from "./contracts.js";
import {
  registerLensRunner,
  type LensRunnerFn,
  type LensSnapshot,
} from "./runner-contract.js";

/**
 * Build a stub runner factory for a given kind. The returned runner
 * is a closure over the kind so concrete-shape integrity is
 * preserved at registration time.
 */
export function createStubLensRunnerForKind(
  kind: GraphLensKind,
): LensRunnerFn {
  return async (def: GraphLensDefinition): Promise<LensSnapshot> => ({
    lensId: def.id,
    kind: def.kind,
    layout: def.layout,
    producedAt: new Date(),
    nodes: [],
    edges: [],
    hiddenNodeCount: 0,
    truncated: false,
  });
}

const ENV_KEY = "AGS_GRAPH_LENS_STUB_RUNNERS_INSTALL";

export interface MaybeInstallStubLensRunnersOptions {
  /** Test seam — override env source. */
  readonly env?: Record<string, string | undefined>;
  /** Test seam — override the registrar. */
  readonly register?: (kind: GraphLensKind, fn: LensRunnerFn) => void;
}

export interface MaybeInstallStubLensRunnersResult {
  readonly installed: boolean;
  readonly installedKinds: ReadonlyArray<GraphLensKind>;
}

/**
 * Boot-time opt-in installer. Mirrors the AS-4 / T-F.2 envflag
 * pattern. Reads `AGS_GRAPH_LENS_STUB_RUNNERS_INSTALL`; when "on",
 * installs a stub runner for every closed-taxonomy kind.
 */
export function maybeInstallStubLensRunners(
  options: MaybeInstallStubLensRunnersOptions = {},
): MaybeInstallStubLensRunnersResult {
  const env = options.env ?? process.env;
  const register = options.register ?? registerLensRunner;
  if (env[ENV_KEY] !== "on") {
    return { installed: false, installedKinds: [] };
  }
  const installedKinds: GraphLensKind[] = [];
  for (const kind of GRAPH_LENS_KINDS) {
    register(kind, createStubLensRunnerForKind(kind));
    installedKinds.push(kind);
  }
  return { installed: true, installedKinds };
}
