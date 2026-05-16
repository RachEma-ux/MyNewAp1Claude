/**
 * Boot-time installer for the real `institutional_memory` lens
 * runner — T-F.69.
 *
 * Envflag `AGS_GRAPH_LENS_INSTITUTIONAL_MEMORY_RUNNER_INSTALL=on`.
 * With this installer registered, the lens runner registry reaches
 * **8 / 8 coverage** across the closed `GRAPH_LENS_KINDS` taxonomy.
 *
 * Hard-rule compliance (CLAUDE.md)
 *   - No banned imports.
 *   - Source-scan tested.
 */

import { registerLensRunner, type LensRunnerFn } from "./runner-contract.js";
import {
  createInstitutionalMemoryLensRunner,
  type InstitutionalMemoryLensReadFn,
} from "./runners/institutional-memory-lens-runner.js";
import {
  createInstitutionalMemoryLensAsdbReader,
  type CreateInstitutionalMemoryLensAsdbReaderOptions,
} from "./runners/institutional-memory-lens-asdb-reader.js";

const ENV_KEY = "AGS_GRAPH_LENS_INSTITUTIONAL_MEMORY_RUNNER_INSTALL";

export interface MaybeInstallInstitutionalMemoryLensRunnerOptions {
  readonly env?: Record<string, string | undefined>;
  readonly register?: (fn: LensRunnerFn) => void;
  readonly read: InstitutionalMemoryLensReadFn;
  readonly now?: () => Date;
}

export interface MaybeInstallInstitutionalMemoryLensRunnerResult {
  readonly installed: boolean;
}

export function maybeInstallInstitutionalMemoryLensRunner(
  options: MaybeInstallInstitutionalMemoryLensRunnerOptions,
): MaybeInstallInstitutionalMemoryLensRunnerResult {
  const env = options.env ?? process.env;
  if (env[ENV_KEY] !== "on") {
    return { installed: false };
  }
  const runner = createInstitutionalMemoryLensRunner({
    read: options.read,
    now: options.now,
  });
  const register =
    options.register ??
    ((fn: LensRunnerFn) => registerLensRunner("institutional_memory", fn));
  register(runner);
  return { installed: true };
}

export interface MaybeInstallInstitutionalMemoryLensRunnerWithAsdbOptions
  extends Omit<MaybeInstallInstitutionalMemoryLensRunnerOptions, "read"> {
  readonly readerOptions?: CreateInstitutionalMemoryLensAsdbReaderOptions;
}

export function maybeInstallInstitutionalMemoryLensRunnerWithAsdb(
  options: MaybeInstallInstitutionalMemoryLensRunnerWithAsdbOptions = {},
): MaybeInstallInstitutionalMemoryLensRunnerResult {
  const read = createInstitutionalMemoryLensAsdbReader(options.readerOptions);
  return maybeInstallInstitutionalMemoryLensRunner({
    env: options.env,
    register: options.register,
    now: options.now,
    read,
  });
}
