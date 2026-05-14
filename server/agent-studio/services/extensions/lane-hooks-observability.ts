/**
 * Observability-only lane hooks — V1+ 18-γ concrete slice (PR-V1-81).
 *
 * First concrete implementation of the typed contract surface
 * pinned in PR-V1-42 (#793). Each hook is a valid
 * `ContractedLaneHookFn<Lane>` that returns
 * `{ succeeded: true }` WITHOUT contributing supplemental data —
 * i.e. it logs the invocation and otherwise lets the standard RAC
 * pipeline run unchanged.
 *
 * Why ship these first:
 *
 *   - Operators can flip a single installer call at boot and see
 *     "extension X invoked for lane Y on draft Z" lines in the
 *     server log without changing pipeline behavior.
 *   - Smoke-tests the wire-up end-to-end: `invokeFromExtension` →
 *     lane-hooks registry → hook executes → ledger row written.
 *   - Establishes the contract-conformance pattern for the future
 *     RETRIEVAL / ASSEMBLY / COMPOSE-specific contributors.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No tool-lane registration (registry rejects `lane="tool"` at
 *     runtime; the contract type excludes "tool" at compile time).
 *   - No `credential-resolver` / `*_API_KEY` / `dispatchMcpToolCall`
 *     / `neo4j-driver` / `openrouter` / `GraphRepository` imports.
 *   - Type-only imports of `ExtensionRecord` /
 *     `InvokeFromExtensionInput` (runtime boundaries preserved).
 *   - Observability log is best-effort — a throw in the log call
 *     site MUST NOT propagate to the wrapper, otherwise a misbehaving
 *     log line would break the entire `invokeFromExtension` path.
 *     Wrapped in try/catch.
 */

import {
  CONTRACTED_EXTENSION_LANES,
  type ContractedAssembleOutcome,
  type ContractedComposeOutcome,
  type ContractedExtensionLane,
  type ContractedLaneHookFn,
  type ContractedRetrieveOutcome,
} from "./lane-hook-contracts.js";

import { registerLaneHook } from "./lane-hooks.js";

import type {
  ExtensionCapabilityLane,
  ExtensionRecord,
  InvokeFromExtensionInput,
} from "./contracts.js";

export interface ObservabilityLaneHookLog {
  (line: string): void;
}

export interface CreateObservabilityLaneHooksOptions {
  /** Override the log sink. Defaults to `console.log`. Test seam. */
  readonly log?: ObservabilityLaneHookLog;
}

export interface ObservabilityLaneHooks {
  readonly retrieve: ContractedLaneHookFn<"retrieve">;
  readonly assemble: ContractedLaneHookFn<"assemble">;
  readonly compose: ContractedLaneHookFn<"compose">;
}

export function createObservabilityLaneHooks(
  options: CreateObservabilityLaneHooksOptions = {},
): ObservabilityLaneHooks {
  const log = options.log ?? defaultLog;

  function emit(lane: ContractedExtensionLane, params: {
    readonly extension: ExtensionRecord;
    readonly input: InvokeFromExtensionInput;
  }): void {
    try {
      log(
        `[ags-extensions-lane-observability] lane=${lane} ` +
          `extension=#${params.extension.id} ` +
          `extensionKey=${params.extension.extensionKey} ` +
          `workspaceId=${params.extension.workspaceId} ` +
          `toolName=${params.input.toolName ?? "(none)"}`,
      );
    } catch {
      // Best-effort — never propagate.
    }
  }

  const retrieve: ContractedLaneHookFn<"retrieve"> = async (params) => {
    emit("retrieve", params);
    const out: ContractedRetrieveOutcome = { succeeded: true };
    return out;
  };

  const assemble: ContractedLaneHookFn<"assemble"> = async (params) => {
    emit("assemble", params);
    const out: ContractedAssembleOutcome = { succeeded: true };
    return out;
  };

  const compose: ContractedLaneHookFn<"compose"> = async (params) => {
    emit("compose", params);
    const out: ContractedComposeOutcome = { succeeded: true };
    return out;
  };

  return { retrieve, assemble, compose };
}

export interface InstallObservabilityLaneHooksOptions
  extends CreateObservabilityLaneHooksOptions {
  /** Test seam — override the registry call. Production uses
   *  `registerLaneHook` from `./lane-hooks.js`. */
  readonly register?: (
    lane: ExtensionCapabilityLane,
    fn: ContractedLaneHookFn<ContractedExtensionLane>,
  ) => void;
}

export interface InstallObservabilityLaneHooksResult {
  /** Ordered list of lanes that were installed (matches the closed
   *  `CONTRACTED_EXTENSION_LANES` taxonomy). */
  readonly installedLanes: ReadonlyArray<ContractedExtensionLane>;
}

export function installObservabilityLaneHooks(
  options: InstallObservabilityLaneHooksOptions = {},
): InstallObservabilityLaneHooksResult {
  const hooks = createObservabilityLaneHooks({ log: options.log });
  const register = options.register ?? registerLaneHook;
  // Iterate the closed taxonomy in declaration order so test
  // assertions don't depend on Map iteration ordering.
  const installedLanes: ContractedExtensionLane[] = [];
  for (const lane of CONTRACTED_EXTENSION_LANES) {
    const hook = hooks[lane];
    register(
      lane,
      hook as ContractedLaneHookFn<ContractedExtensionLane>,
    );
    installedLanes.push(lane);
  }
  return { installedLanes };
}

function defaultLog(line: string): void {
  console.log(line);
}
