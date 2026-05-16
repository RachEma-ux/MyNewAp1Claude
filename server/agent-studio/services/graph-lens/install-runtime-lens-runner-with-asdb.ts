/**
 * Convenience installer — composes the ASDB read seam with the boot
 * installer (T-F.60).
 *
 * The boot path for production is:
 *
 *   maybeInstallRuntimeLensRunnerWithAsdb({ env: process.env });
 *
 * which is equivalent to:
 *
 *   maybeInstallRuntimeLensRunner({
 *     env: process.env,
 *     read: createRuntimeLensAsdbReader(),
 *   });
 *
 * The two-arg form remains available for callers that want a custom
 * reader (e.g. integration tests that inject a fake ASDB).
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - No `process.env.*_API_KEY` reads.
 *   - Source-scan tested.
 */

import {
  maybeInstallRuntimeLensRunner,
  type MaybeInstallRuntimeLensRunnerOptions,
  type MaybeInstallRuntimeLensRunnerResult,
} from "./install-runtime-lens-runner.js";
import {
  createRuntimeLensAsdbReader,
  type CreateRuntimeLensAsdbReaderOptions,
} from "./runners/runtime-lens-asdb-reader.js";

export interface MaybeInstallRuntimeLensRunnerWithAsdbOptions
  extends Omit<MaybeInstallRuntimeLensRunnerOptions, "read"> {
  readonly readerOptions?: CreateRuntimeLensAsdbReaderOptions;
}

export function maybeInstallRuntimeLensRunnerWithAsdb(
  options: MaybeInstallRuntimeLensRunnerWithAsdbOptions = {},
): MaybeInstallRuntimeLensRunnerResult {
  const read = createRuntimeLensAsdbReader(options.readerOptions);
  return maybeInstallRuntimeLensRunner({
    env: options.env,
    register: options.register,
    now: options.now,
    read,
  });
}
