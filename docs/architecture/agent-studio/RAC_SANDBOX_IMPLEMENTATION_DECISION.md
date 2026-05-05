# RAC Sandbox Implementation Decision

**Owner:** Agent Studio module (with Governance co-ownership)
**Phase:** P0.6 (locks the implementation choice; P9 builds)
**Status:** Adopted (this PR)
**Authority:** `RAC_SANDBOX_PREREQUISITE.md` D-SBX-1..5 (locks the requirement); `RAC_EXECUTION_PLAN.md` Phase 0.6 (asks for the choice)

---

## 1. Problem statement

`RAC_SANDBOX_PREREQUISITE.md` D-SBX-1 lists three acceptable sandbox implementations:

A. **`node:vm` isolated context** — lowest cost; insufficient for shell tools.
B. **Subprocess sandbox** using OS-native isolation (proot/Termux on dev, container in CI/cloud).
C. **External sandbox provider** (E2B, Daytona) wired through Module Gateway.

P9 cannot start until one is chosen. P10 cannot hard-block on missing sandbox until the chosen impl exists. This DR picks one, declares why, and locks the adapter contract so P9 implementation is mechanical.

---

## 2. Decision (D-SBX-IMPL-1 … D-SBX-IMPL-4)

### D-SBX-IMPL-1 — `node:vm`-based isolation is the chosen MVP impl

**Choice:** Option A. Concrete primitive: `node:vm.createContext` + `node:vm.runInContext` with frozen intrinsics, fixed wall-clock timeout, and stripped `globalThis`.

**Why:**
- **Runs in the existing GHA runner** without new infra. The deploy workflow doesn't need container privileges, Docker-in-Docker, or external service tokens. CI green = sandbox green (D-SBX-IMPL-3 verifies).
- **Zero new module dependencies.** The standard library already includes `vm`. No `npm install` of a sandbox package; no version drift; no supply-chain expansion.
- **Sufficient for the foreseeable surface.** Today, zero MCP tools are class `code_execution` (D-SBX-5). The first such tool that arrives is more likely to be a "run JavaScript snippet" or "execute a deterministic computation" than a full shell — both serviceable by `node:vm`. When a true shell-class tool arrives, the adapter contract permits a backend swap to Option B or C without dispatcher changes.
- **Aligns with default-deny posture.** A weaker sandbox forces tool authors to pick easier classes (`read_only`, `write`) by default, which is the desired risk gradient.

**Why not Option B (subprocess):**
- proot under Termux on the dev box is the user's primary local environment. Spawning a child process *inside* a proot environment is reliable but the kernel namespacing primitives that normally make subprocess sandboxes safe (`unshare`, `pivot_root`, `seccomp-bpf`) are not all available in proot. We would ship a "subprocess sandbox" that doesn't actually isolate — the worst kind of false signal (D-SBX-4).
- In CI (GHA Ubuntu), subprocess sandboxing works but introduces cross-environment behavior drift. The dev box would have a no-op sandbox; CI would have a real one. Test mode running real sandbox (D-SBX-4) becomes a lie on the dev box.

**Why not Option C (external):**
- New external dependency; new credential to manage; new outage surface. Not warranted at zero `code_execution` tools today.
- Future option: when the surface grows or the dev environment moves to a container-friendly host, Option C becomes viable as a swap behind the same adapter contract.

### D-SBX-IMPL-2 — Adapter contract (locked)

```ts
// server/agent-studio/services/sandbox/types.ts
export interface ToolSandbox {
  /**
   * Execute a tool invocation inside the sandbox.
   * MUST be called only when the tool's riskClass = "code_execution"
   * (D-TOOL-1, enforced at the dispatcher per D-SBX-3).
   *
   * Throws on:
   *   - timeout (wall clock exceeds policy.timeoutMs)
   *   - memory exhaustion (best-effort; node:vm cannot hard-limit memory)
   *   - explicit policy denial (forbidden globals accessed)
   *   - sandbox unavailable (no impl registered → SBX_UNAVAILABLE)
   */
  execute<R = unknown>(input: ToolSandboxInput): Promise<ToolSandboxResult<R>>;

  /** Sandbox health check; surfaces in P10 export readiness. */
  health(): Promise<{ ok: boolean; impl: string; reason?: string }>;
}

export interface ToolSandboxInput {
  toolName: string;
  args: Record<string, unknown>;
  policy: {
    timeoutMs: number;        // hard wall-clock cap
    memoryHintMb?: number;    // advisory (node:vm cannot enforce)
    allowedGlobals: string[]; // e.g. ["Math", "JSON", "Array", "String", ...]
    forbiddenGlobals: string[]; // explicit denylist; empty by default
    networkAccess: false;     // node:vm impl: hard false; future external impls may permit
  };
  ctx: {
    workspaceId: number;
    actorId: number;
    correlationId: string;
    governanceReceiptId?: string;
  };
}

export interface ToolSandboxResult<R> {
  ok: boolean;
  output?: R;
  error?: { code: string; message: string };
  durationMs: number;
  truncated: boolean;
}
```

The dispatcher (P9) calls `toolSandbox.execute(input)` only when `tool.riskClass === "code_execution"`. All other classes invoke the tool directly per D-SBX-3.

### D-SBX-IMPL-3 — Failure modes (surfaced to dispatcher)

| Code | Trigger | Dispatcher response |
| --- | --- | --- |
| `SBX_TIMEOUT` | Wall clock > `policy.timeoutMs` | Tool call returns `{ok:false, error:{code:"sandbox_timeout"}}` to the model loop |
| `SBX_MEMORY` | Node-level OOM heuristic (best-effort) | Same as timeout |
| `SBX_DENY_GLOBAL` | Code accessed a forbidden global | Tool call returns `{ok:false, error:{code:"sandbox_policy_denied"}}` |
| `SBX_UNAVAILABLE` | No sandbox impl registered (P9 not yet merged) | Tool call hard-blocks with `{ok:false, error:{code:"sandbox_unavailable"}}`. P10 export readiness sees this and refuses to mark the agent ready. |
| `SBX_THROWN` | Tool code threw inside sandbox | Tool call returns `{ok:false, error:{code:"tool_runtime_error", message: <stripped>}}`; full stack written to P7 trace, never surfaced to model |

**Stack-trace handling:** Sandbox errors carry stack traces in P7 trace records but the trace is redacted before any model-facing surface. The model receives the error code only.

### D-SBX-IMPL-4 — Test-mode strategy (D-SBX-4 satisfied)

- **CI (`pnpm test`):** Sandbox runs against real `node:vm`. Timeout tests use a 50ms policy budget against an infinite-loop fixture; expected to throw `SBX_TIMEOUT`. No mocking.
- **Dev box:** Same — `node:vm` is in the standard lib, available everywhere Node runs.
- **Agent Studio test runs (`services/test-run-binding.ts`):** When the agent has any `code_execution` tool, the test invocation routes through the sandbox just like prod. Skipping is forbidden; if sandbox fails, the test fails closed.
- **Mock mode:** Permitted only in unit tests for code that *consumes* sandbox results (e.g. dispatcher behavior tests). Never in tests that verify sandbox isolation itself.

---

## 3. CI strategy (does it run in GHA?)

**Yes, with no infra changes.** `node:vm` is built into Node and the GHA runner already runs Vitest. The new `tests/agent-studio/sandbox-gate.test.ts` (P9) covers:

- Timeout enforcement (50ms budget, infinite loop input → `SBX_TIMEOUT`)
- Forbidden global denial (`process.env` access denied → `SBX_DENY_GLOBAL`)
- Frozen intrinsic protection (mutating `Array.prototype.push` inside the sandbox does not affect the host)
- `SBX_UNAVAILABLE` when no sandbox is registered (verifies the gate, not the impl)

CI cost: negligible (sandbox tests run in milliseconds).

---

## 4. Memory limits — known limitation (declared, not papered over)

`node:vm` cannot hard-limit memory consumption inside the isolated context. A malicious tool that allocates indefinitely *can* exhaust the host process. Mitigation:

- The sandbox advertises `memoryHintMb` for the tool but does not enforce.
- The dispatcher's wall-clock timeout (D-SBX-IMPL-3) bounds runaway allocators in practice.
- P12 ops doc records this limitation and the swap path: when a tool is suspected of allocator abuse, classify it as `code_execution` AND block at export until Option B or Option C is wired.

**This is not a blocker.** Today's `code_execution` surface is empty. By the time it grows, the limitation is documented, the swap is painless (same adapter), and the trade-off was made knowingly.

---

## 5. What this enables

- **P9 sandbox gate** can begin: contract locked, impl strategy locked, failure modes locked, test strategy locked.
- **P10 export readiness** can hard-block on missing/unhealthy sandbox per D-SBX-2: the `health()` method gives the readiness gate a single non-mock signal.
- **D-TOOL-4** hard-block matrix is now actionable: when a `code_execution` tool exists and `toolSandbox.health().ok === false`, the agent gets `racStatus="blocked"` with reason `sandbox_required`.

---

## 6. Acceptance

- Implementation choice is one of A/B/C from `RAC_SANDBOX_PREREQUISITE.md` D-SBX-1: ✅ chose A (`node:vm`)
- Why-this-impl recorded: ✅
- Adapter contract (`ToolSandbox`, `ToolSandboxInput`, `ToolSandboxResult`) locked: ✅
- Failure modes enumerated with dispatcher responses: ✅
- Test-mode strategy honors D-SBX-4 (real sandbox, not mock): ✅
- CI strategy verified runnable in GHA: ✅
- Known limitations declared (memory non-enforcement): ✅

---

## 7. How later phases apply this

- **P9:** Implements `server/agent-studio/services/sandbox/node-vm-impl.ts` against the `ToolSandbox` interface in `types.ts`. Edits `services/mcp/dispatcher.ts` to route `code_execution` tools through the sandbox.
- **P10:** Reads `toolSandbox.health()` and applies the D-SBX-2 hard-block when an agent's tool list intersects `code_execution`.
- **P11 UI:** Surfaces sandbox health on the agent's RAC page (a green/red badge that links to the trace).
- **P12 ops doc:** Records the swap path from `node:vm` to subprocess/external when the tool surface grows.
