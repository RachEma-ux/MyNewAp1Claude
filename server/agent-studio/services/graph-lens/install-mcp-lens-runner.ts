/**
 * Boot-time installer for the real `mcp` lens runner — T-F.64.
 *
 * Mirrors `maybeInstallGovernanceLensRunner` (T-F.63). Envflag
 * `AGS_GRAPH_LENS_MCP_RUNNER_INSTALL=on` registers the runner via
 * `registerLensRunner("mcp", ...)`. Composer
 * `maybeInstallMcpLensRunnerWithAsdb` wires
 * `createMcpLensAsdbReader()` for one-call boot wiring.
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
  createMcpLensRunner,
  type McpLensReadFn,
} from "./runners/mcp-lens-runner.js";
import {
  createMcpLensAsdbReader,
  type CreateMcpLensAsdbReaderOptions,
} from "./runners/mcp-lens-asdb-reader.js";

const ENV_KEY = "AGS_GRAPH_LENS_MCP_RUNNER_INSTALL";

export interface MaybeInstallMcpLensRunnerOptions {
  readonly env?: Record<string, string | undefined>;
  readonly register?: (fn: LensRunnerFn) => void;
  readonly read: McpLensReadFn;
  readonly now?: () => Date;
}

export interface MaybeInstallMcpLensRunnerResult {
  readonly installed: boolean;
}

export function maybeInstallMcpLensRunner(
  options: MaybeInstallMcpLensRunnerOptions,
): MaybeInstallMcpLensRunnerResult {
  const env = options.env ?? process.env;
  if (env[ENV_KEY] !== "on") {
    return { installed: false };
  }
  const runner = createMcpLensRunner({ read: options.read, now: options.now });
  const register =
    options.register ??
    ((fn: LensRunnerFn) => registerLensRunner("mcp", fn));
  register(runner);
  return { installed: true };
}

export interface MaybeInstallMcpLensRunnerWithAsdbOptions
  extends Omit<MaybeInstallMcpLensRunnerOptions, "read"> {
  readonly readerOptions?: CreateMcpLensAsdbReaderOptions;
}

export function maybeInstallMcpLensRunnerWithAsdb(
  options: MaybeInstallMcpLensRunnerWithAsdbOptions = {},
): MaybeInstallMcpLensRunnerResult {
  const read = createMcpLensAsdbReader(options.readerOptions);
  return maybeInstallMcpLensRunner({
    env: options.env,
    register: options.register,
    now: options.now,
    read,
  });
}
