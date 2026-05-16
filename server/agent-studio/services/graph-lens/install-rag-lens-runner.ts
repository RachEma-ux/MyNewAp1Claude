/**
 * Boot-time installer for the real `rag` lens runner — T-F.66.
 *
 * Envflag `AGS_GRAPH_LENS_RAG_RUNNER_INSTALL=on` registers via
 * `registerLensRunner("rag", ...)`. Composer wires the ASDB reader.
 *
 * Hard-rule compliance (CLAUDE.md)
 *   - No banned imports.
 *   - Source-scan tested.
 */

import { registerLensRunner, type LensRunnerFn } from "./runner-contract.js";
import {
  createRagLensRunner,
  type RagLensReadFn,
} from "./runners/rag-lens-runner.js";
import {
  createRagLensAsdbReader,
  type CreateRagLensAsdbReaderOptions,
} from "./runners/rag-lens-asdb-reader.js";

const ENV_KEY = "AGS_GRAPH_LENS_RAG_RUNNER_INSTALL";

export interface MaybeInstallRagLensRunnerOptions {
  readonly env?: Record<string, string | undefined>;
  readonly register?: (fn: LensRunnerFn) => void;
  readonly read: RagLensReadFn;
  readonly now?: () => Date;
}

export interface MaybeInstallRagLensRunnerResult {
  readonly installed: boolean;
}

export function maybeInstallRagLensRunner(
  options: MaybeInstallRagLensRunnerOptions,
): MaybeInstallRagLensRunnerResult {
  const env = options.env ?? process.env;
  if (env[ENV_KEY] !== "on") {
    return { installed: false };
  }
  const runner = createRagLensRunner({ read: options.read, now: options.now });
  const register =
    options.register ??
    ((fn: LensRunnerFn) => registerLensRunner("rag", fn));
  register(runner);
  return { installed: true };
}

export interface MaybeInstallRagLensRunnerWithAsdbOptions
  extends Omit<MaybeInstallRagLensRunnerOptions, "read"> {
  readonly readerOptions?: CreateRagLensAsdbReaderOptions;
}

export function maybeInstallRagLensRunnerWithAsdb(
  options: MaybeInstallRagLensRunnerWithAsdbOptions = {},
): MaybeInstallRagLensRunnerResult {
  const read = createRagLensAsdbReader(options.readerOptions);
  return maybeInstallRagLensRunner({
    env: options.env,
    register: options.register,
    now: options.now,
    read,
  });
}
