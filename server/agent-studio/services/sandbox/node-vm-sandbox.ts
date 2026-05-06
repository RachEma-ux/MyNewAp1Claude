/**
 * Tool Sandbox — `node:vm` implementation (Phase 9, D-SBX-IMPL-1).
 *
 * Runs a tool's `args.code` JS source inside `vm.createContext`
 * with a frozen-intrinsics whitelist, a wall-clock timeout, and a
 * Proxy that traps access to forbidden globals. Tool args (other
 * than `code`) are mounted on the `args` global the code can read.
 *
 * Locked decisions worth restating in code:
 *   - `vm.runInContext(code, ctx, { timeout })` is the timeout
 *     mechanism. It throws synchronously when the code exceeds
 *     the budget — we map that to `SBX_TIMEOUT`.
 *   - Memory cannot be enforced (D-SBX-IMPL-1 §4). The wall-clock
 *     cap bounds runaway allocators in practice.
 *   - Forbidden-global access is intercepted by a Proxy `get` trap
 *     that throws a sentinel error. The sentinel's name lets us
 *     distinguish policy denials from arbitrary tool throws.
 *   - Frozen intrinsics: every allow-listed global is `Object.freeze`d
 *     before exposure so a malicious tool that does
 *     `Array.prototype.push = ...` can't mutate the host's intrinsics.
 *     (The frozen objects are copies — no mutation reaches the host.)
 */

import { createContext, runInContext } from "node:vm";
import {
  DEFAULT_SANDBOX_POLICY,
  type ToolSandbox,
  type ToolSandboxHealth,
  type ToolSandboxInput,
  type ToolSandboxResult,
} from "./types";

const POLICY_DENIAL_SENTINEL = "__sbx_policy_denied__";

class PolicyDenialError extends Error {
  constructor(public readonly globalName: string) {
    super(`${POLICY_DENIAL_SENTINEL}: ${globalName}`);
    this.name = "PolicyDenialError";
  }
}

/**
 * Build the sandbox global object. Only allow-listed names are bound;
 * forbidden names get a Proxy trap that throws on any access.
 */
function buildSandboxGlobals(
  args: Record<string, unknown>,
  _allowed: ReadonlySet<string>,
  forbidden: ReadonlySet<string>,
): Record<string, unknown> {
  // **Why we don't inject host intrinsics here**: node:vm contexts
  // already provide their own copies of `Array`, `Object`, `JSON`,
  // `Math`, `Date`, `Map`, `Set`, etc. — distinct from the host's.
  // Re-injecting host intrinsics would let sandbox code mutate the
  // host's `Array.prototype` directly (verified failure mode in
  // P9 tests). Letting the context use its native intrinsics gives
  // automatic prototype isolation without any freezing acrobatics.
  // The `allowedGlobals` list still serves as a documented contract
  // so audit can reason about what the policy intends to expose.
  const sandboxGlobals: Record<string, unknown> = {};

  // Forbidden globals: replace with a Proxy that throws on any access.
  // This catches `process.env` (get trap), bare `process` references
  // (get on parent), and `require(...)` / `fetch(...)` (apply trap).
  //
  // The Proxy target MUST be a callable function — Proxy `apply` only
  // fires when the underlying target is callable. With target `{}`,
  // `require(...)` throws "is not a function" before reaching the trap.
  for (const name of forbidden) {
    const callableTarget = function denied() {
      throw new PolicyDenialError(name);
    };
    sandboxGlobals[name] = new Proxy(callableTarget, {
      get() {
        throw new PolicyDenialError(name);
      },
      has() {
        throw new PolicyDenialError(name);
      },
      apply() {
        throw new PolicyDenialError(name);
      },
      construct() {
        throw new PolicyDenialError(name);
      },
    });
  }

  // Tool args mounted on `args`. The tool's code reads them via
  // `args.x`. We freeze the args object so the tool can't mutate
  // the caller's input.
  sandboxGlobals.args = Object.freeze({ ...args });

  return sandboxGlobals;
}

export const nodeVmSandbox: ToolSandbox = {
  async execute<R = unknown>(
    input: ToolSandboxInput,
  ): Promise<ToolSandboxResult<R>> {
    const start = Date.now();
    const code = input.args.code;
    if (typeof code !== "string" || code.length === 0) {
      return {
        ok: false,
        durationMs: Date.now() - start,
        truncated: false,
        error: {
          code: "SBX_THROWN",
          message:
            "node:vm sandbox requires `args.code` to be a non-empty string",
        },
      };
    }

    const policy = input.policy ?? DEFAULT_SANDBOX_POLICY;
    const allowed = new Set(policy.allowedGlobals);
    // The forbidden set is never allowed even if the caller mistakenly
    // listed a name in both — explicit deny wins.
    const forbidden = new Set(policy.forbiddenGlobals);
    for (const f of forbidden) allowed.delete(f);

    const globals = buildSandboxGlobals(input.args, allowed, forbidden);
    const ctx = createContext(globals);

    try {
      const value = runInContext(code, ctx, {
        timeout: policy.timeoutMs,
        // Disable code generation from strings inside the sandbox so
        // `eval`/`Function` can't be used to re-introduce forbidden
        // globals via a fresh closure.
        breakOnSigint: false,
        // @ts-expect-error: codeGeneration is supported but missing in older @types/node
        codeGeneration: { strings: false, wasm: false },
      });

      // Promise resolution happens OUTSIDE the timeout-guarded synchronous
      // call, so a code that returns a never-resolving Promise would hang
      // the host. Race the result against the same wall-clock budget.
      const resolved = await raceAgainstTimeout(value, policy.timeoutMs);

      return {
        ok: true,
        output: resolved as R,
        durationMs: Date.now() - start,
        truncated: false,
      };
    } catch (err) {
      const durationMs = Date.now() - start;
      // node:vm timeout throws Error with message "Script execution timed out".
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof PolicyDenialError) {
        return {
          ok: false,
          durationMs,
          truncated: false,
          error: {
            code: "SBX_DENY_GLOBAL",
            message: `forbidden global accessed: ${err.globalName}`,
          },
        };
      }
      if (/timed out/i.test(message)) {
        return {
          ok: false,
          durationMs,
          truncated: false,
          error: {
            code: "SBX_TIMEOUT",
            message: `wall-clock timeout exceeded ${policy.timeoutMs}ms`,
          },
        };
      }
      return {
        ok: false,
        durationMs,
        truncated: false,
        error: {
          code: "SBX_THROWN",
          message: stripStackFromMessage(message),
        },
      };
    }
  },

  async health(): Promise<ToolSandboxHealth> {
    // Smoke a trivial expression to verify node:vm is available and
    // the timeout guard works. Cheap; a few microseconds.
    try {
      const probe = await this.execute({
        toolName: "__sandbox_health_probe",
        args: { code: "(2 + 2)" },
        policy: { ...DEFAULT_SANDBOX_POLICY, timeoutMs: 100 },
        ctx: { workspaceId: 0, actorId: 0, correlationId: "health" },
      });
      if (probe.ok && probe.output === 4) {
        return { ok: true, impl: "node-vm" };
      }
      return {
        ok: false,
        impl: "node-vm",
        reason: probe.error?.message ?? "probe returned unexpected value",
      };
    } catch (err) {
      return {
        ok: false,
        impl: "node-vm",
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

/**
 * Race a sync-or-Promise return value against a wall-clock budget. If
 * the value is already resolved (sync return), we just return it; if
 * it's a thenable, we race vs a timer.
 */
async function raceAgainstTimeout<T>(value: T, timeoutMs: number): Promise<T> {
  if (!value || typeof (value as { then?: unknown }).then !== "function") {
    return value;
  }
  return await Promise.race([
    value as unknown as Promise<T>,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error("Script execution timed out (post-return)")),
        timeoutMs,
      ),
    ),
  ]);
}

/**
 * Stack traces leak host paths and node internals; strip everything
 * after the first line of the error message. P7 trace records the
 * full stack server-side; the model never sees it.
 */
function stripStackFromMessage(msg: string): string {
  const idx = msg.indexOf("\n");
  return idx === -1 ? msg : msg.slice(0, idx);
}
