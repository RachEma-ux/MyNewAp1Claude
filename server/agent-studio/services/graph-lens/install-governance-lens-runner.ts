/**
 * Boot-time installer for the real `governance` lens runner — T-F.63.
 *
 * Mirrors `maybeInstallRuntimeLensRunner` (T-F.59). Envflag
 * `AGS_GRAPH_LENS_GOVERNANCE_RUNNER_INSTALL=on` registers the runner
 * via `registerLensRunner("governance", ...)`.
 *
 * Convenience composer `maybeInstallGovernanceLensRunnerWithAsdb`
 * wires `createGovernanceLensAsdbReader()` into the installer for
 * one-call production boot wiring.
 *
 * Hard-rule compliance (CLAUDE.md)
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
  createGovernanceLensRunner,
  type GovernanceLensReadFn,
} from "./runners/governance-lens-runner.js";
import {
  createGovernanceLensAsdbReader,
  type CreateGovernanceLensAsdbReaderOptions,
} from "./runners/governance-lens-asdb-reader.js";

const ENV_KEY = "AGS_GRAPH_LENS_GOVERNANCE_RUNNER_INSTALL";

export interface MaybeInstallGovernanceLensRunnerOptions {
  readonly env?: Record<string, string | undefined>;
  readonly register?: (fn: LensRunnerFn) => void;
  readonly read: GovernanceLensReadFn;
  readonly now?: () => Date;
}

export interface MaybeInstallGovernanceLensRunnerResult {
  readonly installed: boolean;
}

export function maybeInstallGovernanceLensRunner(
  options: MaybeInstallGovernanceLensRunnerOptions,
): MaybeInstallGovernanceLensRunnerResult {
  const env = options.env ?? process.env;
  if (env[ENV_KEY] !== "on") {
    return { installed: false };
  }
  const runner = createGovernanceLensRunner({
    read: options.read,
    now: options.now,
  });
  const register =
    options.register ??
    ((fn: LensRunnerFn) => registerLensRunner("governance", fn));
  register(runner);
  return { installed: true };
}

export interface MaybeInstallGovernanceLensRunnerWithAsdbOptions
  extends Omit<MaybeInstallGovernanceLensRunnerOptions, "read"> {
  readonly readerOptions?: CreateGovernanceLensAsdbReaderOptions;
}

export function maybeInstallGovernanceLensRunnerWithAsdb(
  options: MaybeInstallGovernanceLensRunnerWithAsdbOptions = {},
): MaybeInstallGovernanceLensRunnerResult {
  const read = createGovernanceLensAsdbReader(options.readerOptions);
  return maybeInstallGovernanceLensRunner({
    env: options.env,
    register: options.register,
    now: options.now,
    read,
  });
}
