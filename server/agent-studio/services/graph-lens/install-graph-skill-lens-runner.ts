/**
 * Boot-time installer for the real `graph_skill` lens runner — T-F.68.
 *
 * Envflag `AGS_GRAPH_LENS_GRAPH_SKILL_RUNNER_INSTALL=on`.
 *
 * Hard-rule compliance (CLAUDE.md)
 *   - No banned imports.
 *   - Source-scan tested.
 */

import { registerLensRunner, type LensRunnerFn } from "./runner-contract.js";
import {
  createGraphSkillLensRunner,
  type GraphSkillLensReadFn,
} from "./runners/graph-skill-lens-runner.js";
import {
  createGraphSkillLensAsdbReader,
  type CreateGraphSkillLensAsdbReaderOptions,
} from "./runners/graph-skill-lens-asdb-reader.js";

const ENV_KEY = "AGS_GRAPH_LENS_GRAPH_SKILL_RUNNER_INSTALL";

export interface MaybeInstallGraphSkillLensRunnerOptions {
  readonly env?: Record<string, string | undefined>;
  readonly register?: (fn: LensRunnerFn) => void;
  readonly read: GraphSkillLensReadFn;
  readonly now?: () => Date;
}

export interface MaybeInstallGraphSkillLensRunnerResult {
  readonly installed: boolean;
}

export function maybeInstallGraphSkillLensRunner(
  options: MaybeInstallGraphSkillLensRunnerOptions,
): MaybeInstallGraphSkillLensRunnerResult {
  const env = options.env ?? process.env;
  if (env[ENV_KEY] !== "on") {
    return { installed: false };
  }
  const runner = createGraphSkillLensRunner({
    read: options.read,
    now: options.now,
  });
  const register =
    options.register ??
    ((fn: LensRunnerFn) => registerLensRunner("graph_skill", fn));
  register(runner);
  return { installed: true };
}

export interface MaybeInstallGraphSkillLensRunnerWithAsdbOptions
  extends Omit<MaybeInstallGraphSkillLensRunnerOptions, "read"> {
  readonly readerOptions?: CreateGraphSkillLensAsdbReaderOptions;
}

export function maybeInstallGraphSkillLensRunnerWithAsdb(
  options: MaybeInstallGraphSkillLensRunnerWithAsdbOptions = {},
): MaybeInstallGraphSkillLensRunnerResult {
  const read = createGraphSkillLensAsdbReader(options.readerOptions);
  return maybeInstallGraphSkillLensRunner({
    env: options.env,
    register: options.register,
    now: options.now,
    read,
  });
}
