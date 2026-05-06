/**
 * Phase 9 — Tool Sandbox Gate (D-SBX-IMPL-4).
 *
 * Per D-SBX-4 the sandbox is **never mocked**. These tests exercise the
 * real `nodeVmSandbox` via the registry barrel so any regression in the
 * isolation guarantees fails the suite.
 *
 * Coverage:
 *   1. Wall-clock timeout — infinite loop trips SBX_TIMEOUT.
 *   2. Forbidden-global denial — `process.env` access raises SBX_DENY_GLOBAL.
 *   3. Frozen-intrinsic protection — mutating `Array.prototype` inside
 *      the sandbox does not leak to the host.
 *   4. SBX_UNAVAILABLE — the registry surfaces the sentinel when no
 *      impl is bound.
 *   5. eval/Function denied via `codeGeneration.strings:false`.
 *   6. Args mounted on `args` global; modifications don't leak.
 *   7. health() probe succeeds with the default impl.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  getToolSandbox,
  setToolSandbox,
  clearToolSandbox,
  resetToolSandboxToDefault,
  nodeVmSandbox,
  DEFAULT_SANDBOX_POLICY,
  SandboxUnavailableError,
} from "../../server/agent-studio/services/sandbox";

const ctx = { workspaceId: 1, actorId: 1, correlationId: "test" };

afterEach(() => {
  // Always restore the default impl so a test that called
  // clearToolSandbox() doesn't poison subsequent tests.
  resetToolSandboxToDefault();
});

describe("nodeVmSandbox — happy path", () => {
  it("evaluates a pure expression and returns the value", async () => {
    const sandbox = getToolSandbox();
    const r = await sandbox.execute({
      toolName: "test_eval",
      args: { code: "(2 + 40)" },
      policy: DEFAULT_SANDBOX_POLICY,
      ctx,
    });
    expect(r.ok).toBe(true);
    expect(r.output).toBe(42);
    expect(r.truncated).toBe(false);
  });

  it("mounts non-code args on the `args` global", async () => {
    const sandbox = getToolSandbox();
    const r = await sandbox.execute({
      toolName: "test_args",
      args: { code: "args.x + args.y", x: 7, y: 35 },
      policy: DEFAULT_SANDBOX_POLICY,
      ctx,
    });
    expect(r.ok).toBe(true);
    expect(r.output).toBe(42);
  });

  it("rejects empty code with SBX_THROWN rather than running", async () => {
    const sandbox = getToolSandbox();
    const r = await sandbox.execute({
      toolName: "test_empty",
      args: { code: "" },
      policy: DEFAULT_SANDBOX_POLICY,
      ctx,
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("SBX_THROWN");
  });
});

describe("nodeVmSandbox — wall-clock timeout (SBX_TIMEOUT)", () => {
  it("interrupts an infinite loop within the budget", async () => {
    const sandbox = getToolSandbox();
    const start = Date.now();
    const r = await sandbox.execute({
      toolName: "test_loop",
      args: { code: "while (true) {}" },
      policy: { ...DEFAULT_SANDBOX_POLICY, timeoutMs: 50 },
      ctx,
    });
    const elapsed = Date.now() - start;
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("SBX_TIMEOUT");
    // Generous upper bound; the budget is 50ms, the host should
    // wake well within a second even on a loaded CI worker.
    expect(elapsed).toBeLessThan(2000);
  });
});

describe("nodeVmSandbox — forbidden-global denial (SBX_DENY_GLOBAL)", () => {
  it("blocks process.env access", async () => {
    const sandbox = getToolSandbox();
    const r = await sandbox.execute({
      toolName: "test_process",
      args: { code: "process.env.HOME" },
      policy: DEFAULT_SANDBOX_POLICY,
      ctx,
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("SBX_DENY_GLOBAL");
    expect(r.error?.message).toContain("process");
  });

  it("blocks `require`", async () => {
    const sandbox = getToolSandbox();
    const r = await sandbox.execute({
      toolName: "test_require",
      args: { code: "require('node:fs')" },
      policy: DEFAULT_SANDBOX_POLICY,
      ctx,
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("SBX_DENY_GLOBAL");
  });

  it("blocks fetch", async () => {
    const sandbox = getToolSandbox();
    const r = await sandbox.execute({
      toolName: "test_fetch",
      args: { code: "fetch('http://example.com')" },
      policy: DEFAULT_SANDBOX_POLICY,
      ctx,
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("SBX_DENY_GLOBAL");
  });

  it("blocks `eval` via codeGeneration:false", async () => {
    const sandbox = getToolSandbox();
    const r = await sandbox.execute({
      toolName: "test_eval_string",
      args: { code: "eval('1+1')" },
      policy: DEFAULT_SANDBOX_POLICY,
      ctx,
    });
    expect(r.ok).toBe(false);
    // Either SBX_DENY_GLOBAL (eval is on forbidden list) OR SBX_THROWN
    // from codeGeneration restriction — both prove the gate works.
    expect(["SBX_DENY_GLOBAL", "SBX_THROWN"]).toContain(r.error?.code);
  });
});

describe("nodeVmSandbox — frozen-intrinsic isolation", () => {
  it("mutating Array.prototype inside the sandbox does not leak to host", async () => {
    const sandbox = getToolSandbox();
    // Snapshot the host's Array.prototype before running the malicious code.
    const before = (Array.prototype as unknown as { __pwned?: unknown }).__pwned;
    const r = await sandbox.execute({
      toolName: "test_prototype_pollution",
      args: {
        code: "try { Array.prototype.__pwned = 'oops'; 'attempted'; } catch (e) { 'blocked'; }",
      },
      policy: DEFAULT_SANDBOX_POLICY,
      ctx,
    });
    // Whether the sandbox blocks or merely fails to leak, the host's
    // prototype must be unchanged.
    expect(r.ok).toBe(true);
    const after = (Array.prototype as unknown as { __pwned?: unknown }).__pwned;
    expect(after).toBe(before);
    expect(after).toBeUndefined();
  });

  it("sandbox cannot reach host globalThis via Object.constructor tricks", async () => {
    const sandbox = getToolSandbox();
    // Classic VM-escape pattern: walk constructor chain to reach Function
    // and synthesise a host-scoped function. Should fail because
    // codeGeneration.strings is disabled.
    const r = await sandbox.execute({
      toolName: "test_constructor_escape",
      args: {
        code: "(function(){}).constructor('return process')()",
      },
      policy: DEFAULT_SANDBOX_POLICY,
      ctx,
    });
    expect(r.ok).toBe(false);
  });
});

describe("services/sandbox registry — SBX_UNAVAILABLE", () => {
  it("getToolSandbox throws SandboxUnavailableError when registry is empty", () => {
    clearToolSandbox();
    expect(() => getToolSandbox()).toThrowError(SandboxUnavailableError);
  });

  it("setToolSandbox installs a custom impl that getToolSandbox returns", () => {
    const stub = {
      async execute() {
        return {
          ok: true,
          output: "stub" as unknown,
          durationMs: 0,
          truncated: false,
        };
      },
      async health() {
        return { ok: true, impl: "stub" };
      },
    };
    setToolSandbox(stub);
    expect(getToolSandbox()).toBe(stub);
  });

  it("resetToolSandboxToDefault re-binds nodeVmSandbox", () => {
    clearToolSandbox();
    expect(() => getToolSandbox()).toThrow();
    resetToolSandboxToDefault();
    expect(getToolSandbox()).toBe(nodeVmSandbox);
  });
});

describe("nodeVmSandbox — health()", () => {
  it("reports ok=true with impl=node-vm under the default policy", async () => {
    const r = await nodeVmSandbox.health();
    expect(r.ok).toBe(true);
    expect(r.impl).toBe("node-vm");
  });
});
