/**
 * Boot-time installer for the real `rac` lens runner — T-F.67.
 *
 * Envflag `AGS_GRAPH_LENS_RAC_RUNNER_INSTALL=on`.
 *
 * Hard-rule compliance (CLAUDE.md)
 *   - No banned imports.
 *   - Source-scan tested.
 */

import { registerLensRunner, type LensRunnerFn } from "./runner-contract.js";
import {
  createRacLensRunner,
  type RacLensReadFn,
} from "./runners/rac-lens-runner.js";
import {
  createRacLensAsdbReader,
  type CreateRacLensAsdbReaderOptions,
} from "./runners/rac-lens-asdb-reader.js";

const ENV_KEY = "AGS_GRAPH_LENS_RAC_RUNNER_INSTALL";

export interface MaybeInstallRacLensRunnerOptions {
  readonly env?: Record<string, string | undefined>;
  readonly register?: (fn: LensRunnerFn) => void;
  readonly read: RacLensReadFn;
  readonly now?: () => Date;
}

export interface MaybeInstallRacLensRunnerResult {
  readonly installed: boolean;
}

export function maybeInstallRacLensRunner(
  options: MaybeInstallRacLensRunnerOptions,
): MaybeInstallRacLensRunnerResult {
  const env = options.env ?? process.env;
  if (env[ENV_KEY] !== "on") {
    return { installed: false };
  }
  const runner = createRacLensRunner({ read: options.read, now: options.now });
  const register =
    options.register ??
    ((fn: LensRunnerFn) => registerLensRunner("rac", fn));
  register(runner);
  return { installed: true };
}

export interface MaybeInstallRacLensRunnerWithAsdbOptions
  extends Omit<MaybeInstallRacLensRunnerOptions, "read"> {
  readonly readerOptions?: CreateRacLensAsdbReaderOptions;
}

export function maybeInstallRacLensRunnerWithAsdb(
  options: MaybeInstallRacLensRunnerWithAsdbOptions = {},
): MaybeInstallRacLensRunnerResult {
  const read = createRacLensAsdbReader(options.readerOptions);
  return maybeInstallRacLensRunner({
    env: options.env,
    register: options.register,
    now: options.now,
    read,
  });
}
