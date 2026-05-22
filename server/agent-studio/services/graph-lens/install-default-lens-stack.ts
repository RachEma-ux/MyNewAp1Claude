/**
 * Default lens-stack boot installer — Phase 24 §T-F.7.
 *
 * Single boot-step entry point that installs the default lenses
 * (#992) AND the stub runners (#998) together. Mirrors the OL-6
 * `bootstrapOfflineCache` composer (#779) pattern — a single call
 * site puts the operator UI into a working state with empty-state
 * snapshots on every lens kind.
 *
 * Env flags (both must be "on" for the full stack):
 *   AGS_GRAPH_LENS_DEFAULTS_INSTALL=on
 *     → install the 8 default `GraphLensDefinition` rows
 *   AGS_GRAPH_LENS_STUB_RUNNERS_INSTALL=on
 *     → install stub runners for every kind so `runLens(def)` returns
 *       an empty snapshot instead of throwing
 *
 * Either flag may be set independently if an operator wants to
 * register their own lenses or runners without the defaults. The
 * composer reflects both states in its result so the boot log can
 * report which half is on.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Imports only the lens-service surface. No DB I/O. No graph
 *     mutation. No `neo4j-driver` / `dispatchMcpToolCall` /
 *     `openrouter` / `credential-resolver` imports.
 *   - Source-scan tested.
 */

import {
  maybeInstallDefaultGraphLenses,
  type MaybeInstallDefaultGraphLensesResult,
} from "./install-default-lenses.js";
import {
  maybeInstallStubLensRunners,
  type MaybeInstallStubLensRunnersResult,
} from "./stub-runners.js";

export interface MaybeInstallDefaultLensStackOptions {
  readonly env?: Record<string, string | undefined>;
}

export interface MaybeInstallDefaultLensStackResult {
  readonly lenses: MaybeInstallDefaultGraphLensesResult;
  readonly runners: MaybeInstallStubLensRunnersResult;
  /** Convenience flag — true iff BOTH halves installed (so the
   *  operator UI can render a meaningful empty state per lens). */
  readonly fullyInstalled: boolean;
}

/**
 * Boot-step composer. Reads both lens-stack env flags and installs
 * what's enabled. Returns the per-half result so the boot logger
 * can show "installed: 8 lens defs / 8 stub runners" or "skipped".
 *
 * Idempotency: if the lens definitions or runners are already
 * registered (because this installer was called before), the
 * underlying registrations throw and propagate. Production callers
 * call this exactly once at boot; tests use the per-half
 * `__resetForTests` helpers to reset state.
 */
export function maybeInstallDefaultLensStack(
  options: MaybeInstallDefaultLensStackOptions = {},
): MaybeInstallDefaultLensStackResult {
  const env = options.env ?? process.env;
  const lenses = maybeInstallDefaultGraphLenses({ env });
  const runners = maybeInstallStubLensRunners({ env });
  return {
    lenses,
    runners,
    fullyInstalled: lenses.installed && runners.installed,
  };
}

/**
 * F2 (2026-05-22) — operator-discovery warning for lens-stack
 * misconfiguration.
 *
 * Compute the operator-facing warnings (if any) for the combined
 * state of the default lens-stack (Step 3.35) + real runner stack
 * (Step 3.36). Returns 0..2 warning lines so the boot logger can
 * emit them verbatim.
 *
 * Operators landing on a freshly-deployed instance often see an
 * empty `graphLens.list` and infer the feature is broken. The
 * actual cause is double-flag-gating: the runners and the lens
 * definitions are independently env-flag-gated and a runner without
 * a matching definition is unreachable via the public API.
 *
 * Cases:
 *   - real runners installed but lens definitions NOT installed
 *     → `graphLens.list` is empty; `render` returns `not_found`.
 *   - lens definitions installed but NO runners at all (neither
 *     stub from Step 3.35 nor real from Step 3.36) → `render`
 *     returns `no_runner_for_kind` for every kind.
 *
 * Neither case is an error — the gating is deliberate so operators
 * can opt in selectively — but the symptom is silent and surprising.
 * One log line at boot time removes the ambiguity.
 */
export interface LensStackMisconfigInput {
  /** True iff Step 3.35 installed the 8 default lens definitions. */
  readonly defaultsInstalled: boolean;
  /** True iff Step 3.35 installed the 8 stub runners. */
  readonly stubRunnersInstalled: boolean;
  /** Number of real runners Step 3.36 installed (0..8). */
  readonly realRunnersInstalledCount: number;
}

export function computeLensStackMisconfigWarnings(
  input: LensStackMisconfigInput,
): readonly string[] {
  const warnings: string[] = [];
  const anyRunners = input.stubRunnersInstalled || input.realRunnersInstalledCount > 0;

  if (input.realRunnersInstalledCount > 0 && !input.defaultsInstalled) {
    warnings.push(
      `[ags-graph-lens] WARNING — ${input.realRunnersInstalledCount} real lens runner(s) installed but AGS_GRAPH_LENS_DEFAULTS_INSTALL is unset. ` +
        `graphLens.list will be empty and graphLens.render will return status='not_found'. ` +
        `Set AGS_GRAPH_LENS_DEFAULTS_INSTALL=on (or register your own lens definitions) to make the runner(s) reachable via the API.`,
    );
  }

  if (input.defaultsInstalled && !anyRunners) {
    warnings.push(
      `[ags-graph-lens] WARNING — default lens definitions installed but NO runners registered. ` +
        `graphLens.render will return status='no_runner_for_kind' for every kind. ` +
        `Set AGS_GRAPH_LENS_STUB_RUNNERS_INSTALL=on for empty-state runners, or AGS_GRAPH_LENS_<KIND>_RUNNER_INSTALL=on per kind for the real ASDB-backed runners.`,
    );
  }

  return warnings;
}
