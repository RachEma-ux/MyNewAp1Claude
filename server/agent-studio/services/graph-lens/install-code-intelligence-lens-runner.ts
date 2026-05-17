/**
 * Boot-time installer for the real `code_intelligence` lens runner —
 * T-G.2.5.
 *
 * Mirrors maybeInstallMcpLensRunner (T-F.64). Envflag
 * `AGS_GRAPH_LENS_CODE_INTELLIGENCE_RUNNER_INSTALL=on` registers
 * the runner via `registerLensRunner("code_intelligence", ...)`.
 *
 * Composer `maybeInstallCodeIntelligenceLensRunnerWithAsdb` wires
 * `readCodeIntelligenceLensFromAsdb` for one-call boot wiring.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - No `process.env.*_API_KEY` reads.
 */

import {
  registerLensRunner,
  type LensRunnerFn,
} from "./runner-contract.js";
import {
  createCodeIntelligenceLensRunner,
} from "./runners/code-intelligence-lens-runner.js";
import {
  readCodeIntelligenceLensFromAsdb,
  type CodeIntelligenceLensReadFn,
} from "./runners/code-intelligence-lens-asdb-reader.js";

const ENV_KEY = "AGS_GRAPH_LENS_CODE_INTELLIGENCE_RUNNER_INSTALL";

export interface MaybeInstallCodeIntelligenceLensRunnerOptions {
  readonly env?: Record<string, string | undefined>;
  readonly register?: (fn: LensRunnerFn) => void;
  readonly read: CodeIntelligenceLensReadFn;
  readonly now?: () => Date;
}

export interface MaybeInstallCodeIntelligenceLensRunnerResult {
  readonly installed: boolean;
}

export function maybeInstallCodeIntelligenceLensRunner(
  options: MaybeInstallCodeIntelligenceLensRunnerOptions,
): MaybeInstallCodeIntelligenceLensRunnerResult {
  const env = options.env ?? process.env;
  if (env[ENV_KEY] !== "on") {
    return { installed: false };
  }
  const runner = createCodeIntelligenceLensRunner({
    read: options.read,
    now: options.now,
  });
  const register =
    options.register ??
    ((fn: LensRunnerFn) => registerLensRunner("code_intelligence", fn));
  register(runner);
  return { installed: true };
}

export interface MaybeInstallCodeIntelligenceLensRunnerWithAsdbOptions
  extends Omit<MaybeInstallCodeIntelligenceLensRunnerOptions, "read"> {}

export function maybeInstallCodeIntelligenceLensRunnerWithAsdb(
  options: MaybeInstallCodeIntelligenceLensRunnerWithAsdbOptions = {},
): MaybeInstallCodeIntelligenceLensRunnerResult {
  return maybeInstallCodeIntelligenceLensRunner({
    env: options.env,
    register: options.register,
    now: options.now,
    read: readCodeIntelligenceLensFromAsdb,
  });
}
