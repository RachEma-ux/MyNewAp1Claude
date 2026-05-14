# Agent Studio — Extension Lane Hook Contracts ADR

**Status:** Accepted (2026-05-14). V1+ scope per `docs/implementation/agent-studio-native-graph-workspace-v1-v2-execution-plan.md` Phase 18.

**Decision owners:** Planner (this doc) → Builder → Reviewer → Tester → Governance per AGENTS.md.

---

## Context

PR-V1-17 (#768, Phase 18-β) shipped the **extension lane hook registry**: `registerLaneHook` / `getLaneHook` / `listRegisteredLaneHookLanes` / `__resetExtensionLaneHooksForTests` keyed by the four `ExtensionCapabilityLane` values:

| Lane | Status |
|---|---|
| `tool` | **Forbidden in registry** — `lane="tool"` always routes through the MCP dispatcher in `runtime.ts`, never a lane hook. Source-scan tested. |
| `retrieve` | Empty in registry. No concrete hook implementation exists. |
| `assemble` | Empty in registry. No concrete hook implementation exists. |
| `compose` | Empty in registry. No concrete hook implementation exists. |

`invokeFromExtension` (runtime.ts) calls the registered hook for non-tool lanes; falls back to "α behavior" (capability check + ledger row + return) when no hook is registered. The runtime is therefore production-safe in default state, but the three non-tool lanes are dormant.

This ADR pins the **typed contract surface** each lane hook must satisfy so future implementation PRs can land against a stable target, and **does not** ship concrete hook implementations (those require deep RAC pipeline integration per lane).

---

## Decision: typed contracts, contract-only first slice

### Per-lane contract surface (all "supplement, not replace")

| Lane | Contributes | Composition rule |
|---|---|---|
| `retrieve` | Supplemental `RetrievalPlanItem[]` | Merged INTO an existing `RetrievalPlan` via the existing planner's compose step. Extension cannot replace the operator-built plan; it can only contribute additional items that the existing `retrieval-filter.ts` then runs governance + permission filtering over. **No raw context injection.** |
| `assemble` | Supplemental evidence chunks (subset of `RacRetrievalChunk`) | Merged INTO `AssembledRetrievalEvidence.chunks` AFTER the standard `assembleRetrievalEvidence` runs. Extension chunks pass through the existing freshness + citation policy. **No CAG block creation here** — that's the compose lane's job. |
| `compose` | Supplemental CAG block metadata | Records a contribution to a CAG `BuildPackInput.userBlocks` slot. **Does NOT bypass the CAG hash invariant** — every contributed block participates in the pack's content hash; a contribution that changes the hash produces a new pack version. |

### Hard rules (load-bearing, per CLAUDE.md)

1. **No RAC bypass.** All three non-tool lanes contribute INPUTS to the existing RAC pipeline. The pipeline still runs its planner / filter / assembler / governance steps. An extension cannot short-circuit RAC.
2. **No raw context injection.** Each contribution flows through the same filter the operator-built plan does.
3. **Citation + freshness preserved.** Extension-contributed chunks must carry the same provenance fields as canonical chunks — `provenance.sourceType`, `sourceId`, etc. The contract requires these at the type level.
4. **CAG hash invariant preserved.** Compose-lane contributions are part of the pack's content hash. A different contribution produces a different pack id.
5. **Tool lane stays dispatcher-only.** The contract module exports types for the 3 non-tool lanes only; the `tool` lane has no contract because it does not flow through this surface.

### Rejected alternatives

| Option | Why rejected |
|---|---|
| **Implement a concrete retrieve-lane hook in this PR (e.g. a "static-corpus extension")** | The first concrete hook requires the V1+ extension-installation flow, capability-pack approval, and the RAC planner compose step. Multi-phase work; not safe inside a contract-definition PR. |
| **Per-lane sink registry like 17-γ** | The existing `lane-hooks.ts` (#768) already IS a registry. The missing surface is the **contract types**, not the registry mechanism. |
| **Inline contract directly into `lane-hooks.ts`** | The contract surface is wider than the registry shape — it pulls in RAC + CAG types. Co-locating would force `lane-hooks.ts` to depend on RAC + CAG, which violates the existing extension/RAC boundary. The new file `lane-hook-contracts.ts` lives in `extensions/` and references RAC + CAG via type-only imports so the runtime boundary is preserved. |

### Acceptance criteria for this PR (contract-only)

- [x] ADR exists.
- [x] Typed contract module `lane-hook-contracts.ts` exports per-lane outcome types AND a typed `LaneHookContractedFn<Lane>` discriminated union.
- [x] Contract types reference (type-only imports) the canonical RAC + CAG types so a contract change shows up at the registrant boundary.
- [x] Source-scan tests prove the contract module is hard-rule clean (no `credential-resolver` / `dispatchMcpToolCall` / `*_API_KEY` / `neo4j-driver` / `openrouter` / `GraphRepository` imports).
- [x] Tests prove the contract types compose with the existing `lane-hooks.ts` registry shape (a registered hook conforming to the contract can be retrieved and invoked).
- [x] Tests prove the contract forbids the `tool` lane (compile-time check via the typed union; runtime guard already exists in `registerLaneHook`).
- [x] No `lane-hooks.ts` runtime change. No `runtime.ts` runtime change. No RAC / CAG runtime change.

### First implementation PR scope

| File | Purpose |
|---|---|
| `docs/architecture/agent-studio-extension-lane-hook-contracts.md` | This ADR |
| `server/agent-studio/services/extensions/lane-hook-contracts.ts` | Typed contract surface |
| `server/agent-studio/services/extensions/public-api.ts` | Re-export contract types |
| `tests/agent-studio/extension-lane-hook-contracts.test.ts` | Contract-compose tests + source-scan |
| Ledger / progress tracker / continuation-state | Update |

### Out of scope (named follow-ups, each its own PR)

- **18-γ-retrieve-hook** — concrete retrieve-lane hook + RAC planner compose-step wiring.
- **18-γ-assemble-hook** — concrete assemble-lane hook + assembler compose-step wiring.
- **18-γ-compose-hook** — concrete compose-lane hook + CAG block contribution wiring.
- **18-γ-extension-install-UI** — operator-side install flow for capability-pack approval.

### Rollback / disable

No runtime surface changes. Removing the ADR + contract module leaves the registry behavior unchanged.

---

## References

- `server/agent-studio/services/extensions/lane-hooks.ts` (#768) — the registry
- `server/agent-studio/services/extensions/runtime.ts` — the wrapper that calls registered hooks
- `server/agent-studio/services/rac/retrieval-planner.ts` — `RetrievalPlanItem` / `RetrievalPlan`
- `server/agent-studio/services/rac/retrieval-executor.ts` — `ExecutedRetrieval`
- `server/agent-studio/services/rac/context-assembler.ts` — `AssembledRetrievalEvidence`
- `server/agent-studio/services/cag/builder.ts` — `BuildPackInput`
