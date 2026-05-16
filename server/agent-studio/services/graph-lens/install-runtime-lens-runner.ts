/**
 * Boot-time installer for the real `runtime` lens runner — T-F.59.
 *
 * Mirrors the `maybeInstallStubLensRunners` envflag-gated pattern
 * from `stub-runners.ts`. When `AGS_GRAPH_LENS_RUNTIME_RUNNER_INSTALL`
 * is "on", the caller-provided read seam is wired into a
 * `createRuntimeLensRunner` and registered for kind="runtime".
 *
 * Idempotency
 *   Registering the same kind twice throws via the underlying
 *   `registerLensRunner` (see `runner-contract.ts`). Production callers
 *   either (a) install ONLY the real runner without stubs, or (b)
 *   install stubs FIRST without the real flag, and then a follow-up
 *   PR will introduce a "replace runner for kind" helper. Until then,
 *   the recommended boot wiring is: install defaults + stubs, OR
 *   install defaults + real runtime runner. Mixed mode is rejected.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - No `process.env.*_API_KEY` reads.
 *   - Source-scan tested.
 */

import {
  registerLensRunner,
  type LensRunnerFn,
} from "./runner-contract.js";
import {
  createRuntimeLensRunner,
  type RuntimeLensReadFn,
} from "./runners/runtime-lens-runner.js";

const ENV_KEY = "AGS_GRAPH_LENS_RUNTIME_RUNNER_INSTALL";

export interface MaybeInstallRuntimeLensRunnerOptions {
  /** Test seam — override env source. */
  readonly env?: Record<string, string | undefined>;
  /** Test seam — override the registrar. */
  readonly register?: (fn: LensRunnerFn) => void;
  /** Caller-supplied DB read seam. */
  readonly read: RuntimeLensReadFn;
  /** Optional clock seam (defaults to `new Date()`). */
  readonly now?: () => Date;
}

export interface MaybeInstallRuntimeLensRunnerResult {
  readonly installed: boolean;
}

export function maybeInstallRuntimeLensRunner(
  options: MaybeInstallRuntimeLensRunnerOptions,
): MaybeInstallRuntimeLensRunnerResult {
  const env = options.env ?? process.env;
  if (env[ENV_KEY] !== "on") {
    return { installed: false };
  }
  const runner = createRuntimeLensRunner({ read: options.read, now: options.now });
  const register =
    options.register ?? ((fn: LensRunnerFn) => registerLensRunner("runtime", fn));
  register(runner);
  return { installed: true };
}
