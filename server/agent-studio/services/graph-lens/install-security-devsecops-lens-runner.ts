/**
 * Boot-time installer for the real `security_devsecops` lens
 * runner — T-G.3.5.
 *
 * Mirrors maybeInstallCodeIntelligenceLensRunner (T-G.2.5).
 * Envflag `AGS_GRAPH_LENS_SECURITY_DEVSECOPS_RUNNER_INSTALL=on`
 * registers the runner via
 * `registerLensRunner("security_devsecops", ...)`.
 *
 * Composer `maybeInstallSecurityDevSecOpsLensRunnerWithAsdb`
 * wires `readSecurityDevSecOpsLensFromAsdb` for one-call boot.
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
  createSecurityDevSecOpsLensRunner,
} from "./runners/security-devsecops-lens-runner.js";
import {
  readSecurityDevSecOpsLensFromAsdb,
  type SecurityDevSecOpsLensReadFn,
} from "./runners/security-devsecops-lens-asdb-reader.js";

const ENV_KEY = "AGS_GRAPH_LENS_SECURITY_DEVSECOPS_RUNNER_INSTALL";

export interface MaybeInstallSecurityDevSecOpsLensRunnerOptions {
  readonly env?: Record<string, string | undefined>;
  readonly register?: (fn: LensRunnerFn) => void;
  readonly read: SecurityDevSecOpsLensReadFn;
  readonly now?: () => Date;
}

export interface MaybeInstallSecurityDevSecOpsLensRunnerResult {
  readonly installed: boolean;
}

export function maybeInstallSecurityDevSecOpsLensRunner(
  options: MaybeInstallSecurityDevSecOpsLensRunnerOptions,
): MaybeInstallSecurityDevSecOpsLensRunnerResult {
  const env = options.env ?? process.env;
  if (env[ENV_KEY] !== "on") {
    return { installed: false };
  }
  const runner = createSecurityDevSecOpsLensRunner({
    read: options.read,
    now: options.now,
  });
  const register =
    options.register ??
    ((fn: LensRunnerFn) => registerLensRunner("security_devsecops", fn));
  register(runner);
  return { installed: true };
}

export interface MaybeInstallSecurityDevSecOpsLensRunnerWithAsdbOptions
  extends Omit<MaybeInstallSecurityDevSecOpsLensRunnerOptions, "read"> {}

export function maybeInstallSecurityDevSecOpsLensRunnerWithAsdb(
  options: MaybeInstallSecurityDevSecOpsLensRunnerWithAsdbOptions = {},
): MaybeInstallSecurityDevSecOpsLensRunnerResult {
  return maybeInstallSecurityDevSecOpsLensRunner({
    env: options.env,
    register: options.register,
    now: options.now,
    read: readSecurityDevSecOpsLensFromAsdb,
  });
}
