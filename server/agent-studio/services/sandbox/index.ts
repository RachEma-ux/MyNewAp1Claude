/**
 * Tool Sandbox — registry + public barrel (Phase 9).
 *
 * The dispatcher imports `getToolSandbox()` rather than the concrete
 * impl so the runtime can swap backends (subprocess, external) without
 * touching the dispatch path. Default registration: `nodeVmSandbox`
 * per D-SBX-IMPL-1.
 *
 * `setToolSandbox()` is provided for tests that need to observe a
 * specific impl, but **never to mock the sandbox itself** — D-SBX-4
 * forbids it. Tests that verify isolation always run the real impl.
 *
 * `clearToolSandbox()` is for unit tests that exercise the
 * `SBX_UNAVAILABLE` path; it MUST be paired with a re-registration
 * before any production code path runs.
 */

export type {
  ToolSandbox,
  ToolSandboxInput,
  ToolSandboxResult,
  ToolSandboxHealth,
  ToolSandboxPolicy,
  ToolSandboxError,
  ToolSandboxErrorCode,
} from "./types";

export {
  DEFAULT_SANDBOX_POLICY,
  SandboxUnavailableError,
} from "./types";

export { nodeVmSandbox } from "./node-vm-sandbox";

import { nodeVmSandbox } from "./node-vm-sandbox";
import { SandboxUnavailableError, type ToolSandbox } from "./types";

let registered: ToolSandbox | null = nodeVmSandbox;

export function getToolSandbox(): ToolSandbox {
  if (!registered) throw new SandboxUnavailableError();
  return registered;
}

export function setToolSandbox(impl: ToolSandbox): void {
  registered = impl;
}

export function clearToolSandbox(): void {
  registered = null;
}

export function resetToolSandboxToDefault(): void {
  registered = nodeVmSandbox;
}
