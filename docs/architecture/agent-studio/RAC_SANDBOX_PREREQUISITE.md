# RAC Sandbox Prerequisite — Pre-bundle Decision Record

**Owner:** Agent Studio module (with Governance co-ownership)
**RAC phase:** P0.6 (Tool / Code Execution Safety Baseline)
**Status:** Draft — pre-bundle, not yet adopted
**Authority:** Required prerequisite for any RAC-enabled agent that exposes a `code_execution` tool (per D-TOOL-1)

---

## 1. Problem statement

The roadmap's P9 Sandbox section says:

> *"If a sandbox already exists, document its use. If not, define an adapter."*

That language is too soft. *Adapter-only with no implementation* is how prerequisites become permanent TODOs and how risky agents end up shipping. We've seen this exact failure mode in the ai-types catalog (registered providers/models with `providerId=NULL`, lacking the wiring that the schema implies).

This pre-bundle locks the position: **a sandbox is a hard prerequisite for `code_execution` tools, not a deferable adapter contract.** Either the sandbox lands before any RAC-enabled agent can be exported with a `code_execution` tool, or those agents are blocked at the readiness gate. There is no middle ground.

---

## 2. Decisions (D-SBX-1 … D-SBX-5)

### D-SBX-1 — A sandbox implementation, not an adapter, is the prerequisite

The roadmap may use an adapter interface in *code* (so callers don't directly couple to a specific sandbox runtime), but **at least one concrete implementation MUST exist before P9 closes**. P9 cannot close on the strength of the adapter alone.

Acceptable implementations (one is enough):

- A `node:vm` isolated context with strict `Object.freeze` on intrinsics, fixed timeout, fixed memory cap, and stripped `globalThis`. (Lowest engineering cost; insufficient for shell tools.)
- A subprocess-based sandbox using the OS-native isolation primitive available in the deployment target (proot/Termux on dev, container in CI/cloud).
- An external sandbox provider integrated through Module Gateway (E2B, Daytona, or equivalent) with a `gatewayCall` contract to a `sandbox.execute` action.

The choice MUST be locked in P0.6 deliverable `RAC_SANDBOX_IMPLEMENTATION_DECISION.md`. Mocking a sandbox in tests is fine; merging an adapter with no real implementation is not.

### D-SBX-2 — Hard-block at export readiness when sandbox is missing

Per D-TOOL-4 (Tool Classification), `code_execution` tools must convert export readiness to a hard block when the sandbox prerequisite is unmet. The check at export time:

```
agent has any tool with riskClass="code_execution"
  AND sandbox implementation registered=false
  AND sandbox manifest receipt for that tool=null
  → racStatus="blocked", reason="sandbox_required"
```

`degraded` is not allowed for this case. `blocked` is. The reason: a degraded export still surfaces in the AI Types catalog as importable; a blocked one doesn't. Code-execution-without-sandbox is a class of bug that should not propagate into the catalog.

### D-SBX-3 — Sandbox is downstream of the dispatcher, not parallel to it

The MCP dispatcher at `server/agent-studio/services/mcp/` remains the single tool execution path. The sandbox does not become a second runtime path; it is a wrapper the dispatcher applies *only* when the tool's `riskClass="code_execution"` (D-TOOL-1). Sequence:

```
Model Access turn  →  tool call  →  dispatchMcpToolCall(name, args)
                                     ↓
                                   resolve riskClass from registry
                                     ↓
                                   if riskClass = "code_execution":
                                     await sandbox.execute(name, args)
                                   else:
                                     await tool.invoke(args)   // direct
                                     ↓
                                   tool result back to Model Access
```

Two consequences:

- **CAG never invokes the sandbox.** P1E boundary check enforces no import of sandbox primitives from `server/agent-studio/services/cag/**`.
- **The dispatcher is the only place that reads `riskClass` for runtime routing.** The export readiness gate reads it for blocking decisions. Both readers, one source of truth (D-TOOL-5).

### D-SBX-4 — Test mode runs against a real sandbox, not a mock

Agent Studio's `services/test-run-binding.ts` runs an Expert agent against its binding for a smoke test. When the agent has `code_execution` tools, the test run MUST go through the same sandbox path the runtime would use, not a stubbed `Promise.resolve("ok")`. Reason: a passing test that bypasses the sandbox tells the user the agent works; the production run with the sandbox engaged then fails for unrelated sandbox reasons. Test mode pretending the sandbox is OK is a worse-than-useless signal.

If the sandbox is unavailable in the test environment, the test must fail closed with `sandbox_unavailable`, not skip silently. CI green should mean *the sandbox successfully ran the tool*, not *the sandbox was bypassed*.

### D-SBX-5 — Existing tools list as of P0.6: zero `code_execution`

Audit of the registry at `server/_core/index.ts` boot:

| Tool | riskClass (from D-TOOL-6) |
| --- | --- |
| `calculator` | `read_only` |
| `current_time` | `read_only` |
| `text_analysis` | `read_only` |
| `json_parser` | `read_only` |
| `url_parser` | `read_only` |

No `code_execution` tools exist today. Therefore D-SBX-2 does not block any existing agent at P9 — it only blocks *new* tool registrations of class `code_execution` until the sandbox lands. This is intentional: the rule comes online before the surface area does, not after.

If MCP auto-connect (`[ags-mcp] auto-connect`) brings in a third-party `code_execution` tool, it enters as `quarantined` (D-TOOL-1) and remains unusable in CAG and at runtime until the owner classifies it AND the sandbox prerequisite is satisfied.

---

## 3. Why (open notes)

- **Why "implementation, not adapter"?** Because the adapter pattern in this codebase has historically shipped with the implementation deferred (see GraphRAG retrieval contract — adapter exists, primary backend is still being built per Data Analysis RTLM). Sandbox cannot be one of those.
- **Why is the sandbox not its own module?** It could be — but on this repo's module-boundary checks (`scripts/check-module-boundaries.ts`, `check-module-readiness.ts`), introducing a new module costs 4-5 PRs of wiring before it can be used. The faster path is: place the implementation under `server/agent-studio/services/sandbox/` and register it as a manifest of the Agent Studio module. Promote to its own module if and when a second consumer appears.
- **Why hard-block rather than warn?** Because the consequences of running unsandboxed code execution in a multi-tenant deployment are not recoverable. A user who imports a "ready" agent from the AI Types catalog reasonably expects no shell access into the host. A warning that they bypass to ship is worse than a block they have to acknowledge.

---

## 4. Acceptance

- A concrete sandbox implementation lands in P0.6 (`RAC_SANDBOX_IMPLEMENTATION_DECISION.md` declares which)
- The dispatcher routes `code_execution` tools through the sandbox; all other classes invoke directly
- The export readiness gate hard-blocks `code_execution` agents without sandbox manifest receipts
- Test mode runs through the sandbox; CI cannot green on a stubbed sandbox response
- P1E boundary check forbids any sandbox import from `server/agent-studio/services/cag/**`

## 5. How to apply (later phases)

- **P0.6 follow-on:** select implementation, register adapter contract, document in `RAC_SANDBOX_IMPLEMENTATION_DECISION.md`
- **P9 sandbox gate:** wire the dispatcher to the chosen implementation
- **P10 export readiness:** add the hard-block branch from D-SBX-2
- **P11 UI:** surface "sandbox required" status on the agent's RAC page; surface "blocked: sandbox_required" on the export readiness widget
