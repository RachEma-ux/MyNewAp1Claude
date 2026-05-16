/**
 * Boot-time installer for the real `cag` lens runner — T-F.65.
 *
 * Mirrors `maybeInstallMcpLensRunner`. Envflag
 * `AGS_GRAPH_LENS_CAG_RUNNER_INSTALL=on`.
 *
 * Hard-rule compliance (CLAUDE.md)
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - No `process.env.*_API_KEY` reads.
 *   - Source-scan tested.
 */

import { registerLensRunner, type LensRunnerFn } from "./runner-contract.js";
import {
  createCagLensRunner,
  type CagLensReadFn,
} from "./runners/cag-lens-runner.js";
import {
  createCagLensAsdbReader,
  type CreateCagLensAsdbReaderOptions,
} from "./runners/cag-lens-asdb-reader.js";

const ENV_KEY = "AGS_GRAPH_LENS_CAG_RUNNER_INSTALL";

export interface MaybeInstallCagLensRunnerOptions {
  readonly env?: Record<string, string | undefined>;
  readonly register?: (fn: LensRunnerFn) => void;
  readonly read: CagLensReadFn;
  readonly now?: () => Date;
}

export interface MaybeInstallCagLensRunnerResult {
  readonly installed: boolean;
}

export function maybeInstallCagLensRunner(
  options: MaybeInstallCagLensRunnerOptions,
): MaybeInstallCagLensRunnerResult {
  const env = options.env ?? process.env;
  if (env[ENV_KEY] !== "on") {
    return { installed: false };
  }
  const runner = createCagLensRunner({ read: options.read, now: options.now });
  const register =
    options.register ??
    ((fn: LensRunnerFn) => registerLensRunner("cag", fn));
  register(runner);
  return { installed: true };
}

export interface MaybeInstallCagLensRunnerWithAsdbOptions
  extends Omit<MaybeInstallCagLensRunnerOptions, "read"> {
  readonly readerOptions?: CreateCagLensAsdbReaderOptions;
}

export function maybeInstallCagLensRunnerWithAsdb(
  options: MaybeInstallCagLensRunnerWithAsdbOptions = {},
): MaybeInstallCagLensRunnerResult {
  const read = createCagLensAsdbReader(options.readerOptions);
  return maybeInstallCagLensRunner({
    env: options.env,
    register: options.register,
    now: options.now,
    read,
  });
}
