/**
 * Tool Sandbox — public contract (Phase 9).
 *
 * Locked by D-SBX-IMPL-2 (`RAC_SANDBOX_IMPLEMENTATION_DECISION.md`).
 * The dispatcher (`services/mcp/dispatcher.ts`) calls
 * `toolSandbox.execute(input)` ONLY when `tool.riskClass === "code_execution"`
 * (D-SBX-3). All other risk classes invoke the tool directly through
 * the MCP transport.
 *
 * Concrete impl is `node:vm`-based (D-SBX-IMPL-1). The contract
 * permits backend swaps (subprocess, external service) without
 * dispatcher changes.
 */

export interface ToolSandboxPolicy {
  /** Hard wall-clock cap. Enforced by `node:vm` `timeout` option. */
  timeoutMs: number;
  /** Advisory only — `node:vm` cannot enforce memory limits. */
  memoryHintMb?: number;
  /**
   * Globals exposed inside the sandbox context. Anything not in this
   * list is shadowed by `undefined` or trapped by the policy proxy.
   * Default whitelist is the deterministic intrinsics (`Math`, `JSON`,
   * `Array`, `String`, `Number`, `Boolean`, `Object`, `Date`).
   */
  allowedGlobals: string[];
  /**
   * Explicit deny list — any access to these names raises
   * `SBX_DENY_GLOBAL`. Empty by default; named entries surface the
   * intent in audit logs.
   */
  forbiddenGlobals: string[];
  /**
   * `node:vm` impl: hard `false`. Future external sandboxes may
   * permit. Type narrows to `false` to keep the property load-bearing
   * — flipping this requires a documented adapter swap.
   */
  networkAccess: false;
}

export interface ToolSandboxInput {
  toolName: string;
  /**
   * Tool arguments forwarded into the sandbox context. By convention
   * the `code` field carries the JS source the sandbox runs; other
   * fields are mounted on a `args` global the code can read.
   */
  args: Record<string, unknown>;
  policy: ToolSandboxPolicy;
  ctx: {
    workspaceId: number;
    actorId: number;
    correlationId: string;
    governanceReceiptId?: string;
  };
}

export interface ToolSandboxError {
  code: ToolSandboxErrorCode;
  message: string;
}

export type ToolSandboxErrorCode =
  | "SBX_TIMEOUT"
  | "SBX_MEMORY"
  | "SBX_DENY_GLOBAL"
  | "SBX_UNAVAILABLE"
  | "SBX_THROWN";

export interface ToolSandboxResult<R = unknown> {
  ok: boolean;
  output?: R;
  error?: ToolSandboxError;
  durationMs: number;
  /**
   * True when the sandbox truncated a value (e.g. a large stdout
   * buffer) before returning. Today's `node:vm` impl never truncates;
   * the field is here for future external impls.
   */
  truncated: boolean;
}

export interface ToolSandboxHealth {
  ok: boolean;
  /** Concrete impl name, e.g. `"node-vm"`. */
  impl: string;
  reason?: string;
}

export interface ToolSandbox {
  execute<R = unknown>(
    input: ToolSandboxInput,
  ): Promise<ToolSandboxResult<R>>;
  health(): Promise<ToolSandboxHealth>;
}

// ── Default policy ──────────────────────────────────────────────────

/**
 * Default sandbox policy applied when the dispatcher invokes
 * `code_execution` without an explicit override. Conservative on
 * purpose — operators add to `allowedGlobals` per tool registration
 * rather than starting from a permissive baseline.
 */
export const DEFAULT_SANDBOX_POLICY: ToolSandboxPolicy = Object.freeze({
  timeoutMs: 1000,
  memoryHintMb: 64,
  allowedGlobals: [
    "Math",
    "JSON",
    "Array",
    "String",
    "Number",
    "Boolean",
    "Object",
    "Date",
    "RegExp",
    "Map",
    "Set",
    "Symbol",
    "ArrayBuffer",
    "Uint8Array",
    "Promise",
  ],
  forbiddenGlobals: [
    "process",
    "require",
    "global",
    "globalThis",
    "Buffer",
    "setTimeout",
    "setInterval",
    "setImmediate",
    "clearTimeout",
    "clearInterval",
    "queueMicrotask",
    "fetch",
    "XMLHttpRequest",
    "import",
    "eval",
  ],
  networkAccess: false,
});

/**
 * Thrown only by `services/sandbox/index.ts` when no sandbox is
 * registered (P9 not yet booted, or test setup failure). The
 * dispatcher catches this and surfaces `SBX_UNAVAILABLE` as the
 * tool-call error code.
 */
export class SandboxUnavailableError extends Error {
  readonly code: ToolSandboxErrorCode = "SBX_UNAVAILABLE";
  constructor(message = "No tool sandbox is registered for this runtime") {
    super(message);
    this.name = "SandboxUnavailableError";
  }
}
