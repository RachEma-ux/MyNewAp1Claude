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
