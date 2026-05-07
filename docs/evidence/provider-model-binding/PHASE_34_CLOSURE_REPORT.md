# Phase 34 — Closure Report

**Captured:** 2026-05-07 against `main@c946205` (post-Phase-34.1 merge).
**Branch (this doc):** `docs/pmb-phase-34-2-closure-report`.
**Owner:** Planner + Governance roles per AGENTS.md.

---

## TL;DR

Phase 34 was the first phase under the **continuous-execution standing instruction** ("from here on continue after every closure report without waiting on my approval"). My pick of Option B (PMT + sandbox-wf gateway migration) was surfaced at Phase 33 closure but not blocked on approval.

The phase shipped a **scope-reduced** §34.1: sandbox-wf seed-orchestrator migrated cleanly to `gatewayCall("aiTypes.catalog.register", ...)`; PMT agents paused-and-surfaced as a **structural mismatch** with register's identity model.

Concretely: PMT agents are self-registered system agents identified by `name === AGENT_CATALOG_ID` (a constant string). They have no domain row, no numeric `sourceId`. Register's input requires `sourceType + sourceId` (numeric) per Phase 25's sealed-identity invariant. There's no clean way to map "self-registered system agent" onto register without either (a) using a synthetic numeric source identity (collision-prone), (b) extending register to support name-based identity (Plan v3 architectural change, out of Phase 34 scope), or (c) accepting the asymmetry. We picked (c) for this phase.

3 PRs total. **Zero new TEMPORARY_EXCEPTION_WITH_DEADLINEs.** CI fingerprint stayed at 5/5 green throughout. Net code change: +25 LOC (gateway-call wrapper around the sandbox-wf write).

---

## What shipped — PR ledger

| Sub-phase | PR | Merge SHA | Title |
|---|---|---|---|
| 34.0 | [#271](https://github.com/RachEma-ux/MyNewAp1Claude/pull/271) | `c222039` | Plan freeze + pre-flight audit |
| **34.1** | [#272](https://github.com/RachEma-ux/MyNewAp1Claude/pull/272) | `c946205` | sandbox-wf seed-orchestrator gateway migration (PMT pause-and-surface) |
| 34.2 | (this PR) | (TBD) | Closure report |

**Total: 3 PRs** — exactly as planned, but with §34.1's scope reduced from 3 callers to 1.

---

## Pause-and-surface — PMT architectural exception

### What surfaced

Pre-flight audit (§34.0) confirmed the legacy `agent_registered` event type had zero downstream consumers — behavior preservation looked mechanical, same as Phase 32. But once §34.1 started, the actual code revealed a deeper mismatch:

```ts
// PMT context-translator-agent.ts pre-flight (line 1145):
const existing = await getCatalogEntries({ entryType: "agent" });
const found = existing.find(e => e.name === AGENT_CATALOG_ID);
```

PMT agents identify themselves by **name** (`AGENT_CATALOG_ID = "PROJECT_CONTEXT_TRANSLATOR_AGENT"`), not by `sourceType + sourceId`. There's no `agents` table row to point at — the catalog entry IS the agent's identity.

Register's input shape (Phase 25):

```ts
export interface RegisterCatalogEntryInput {
  entryType: string;
  sourceType: string;
  sourceId: number;          // ← required, numeric
  fields: Omit<InsertCatalogEntry, "entryType" | "sourceType" | "sourceId">;
  registeredBy: number;
  // ...
}
```

`sourceId: number` is the sealed-identity invariant. No constant string maps cleanly to a stable numeric ID — using `0` as a sentinel would collide across multiple system-self-registered agents; using a hand-curated number (`0` for context-translator, `1` for idea-builder, ...) drifts as new system agents land.

### Decision: keep PMT on direct `createCatalogEntry`

The boundary lint (Phase 31, strict mode) permits intra-platform writes through `ai-types/public-api`. PMT's `createCatalogEntry` calls go through public-api, so they're already compliant with the boundary. The architectural cost of the asymmetry is purely consistency — every other catalog-write site goes through register, except these two PMT agents.

The benefit of the asymmetry is that we don't force a Plan v3 architectural change (extending register to support name-based identity for self-registered system agents) into a phase that was meant to be carry-forward cleanup.

This decision is documented inline in the §34.1 PR body and in this closure report; future phases that want to close the asymmetry should explicitly scope as "PMB Phase X — register name-based identity for self-registered system agents" with its own ADR.

### What §34.0's audit missed

The §34.0 audit checked event consumers (the right thing), but didn't surface the identity-model mismatch. Lesson for future audits: when migrating callers TO a canonical action, check the input-shape compatibility of every caller's source-of-record, not just the output-side audit consumers.

This is captured as a carry-forward lesson below.

---

## What changed in `sandbox-wf/seed-orchestrator.ts`

Before:

```ts
const entry = await createCatalogEntry({
  name: def.catalogName,
  // ... 18 fields
  createdBy: 1,
});
```

After:

```ts
const result = await gatewayCall<unknown, { entryId: number; action: "created" | "updated" }>({
  ctx: {
    sourceModule: "sandbox-wf",
    targetModule: "aiTypes",
    actionKey: "aiTypes.catalog.register",
    governanceReceiptId: `sandbox-wf-bootstrap-${def.catalogName}-${Date.now()}`,
    actorId: 1,
  },
  input: {
    entryType: "agent",
    sourceType: "agent",
    sourceId: agent.id,  // ← from the .returning() insert above; clean numeric source identity
    fields: { /* 18 fields */ },
    registeredBy: 1,
    sourceModule: "sandbox-wf",
  },
});
const entry = await getCatalogEntryById(result.entryId);
```

The `createPublishBundle` call (Step C) keeps its direct path. Gateway publish migration is a separate concern; the current direct call is intra-platform-allowed.

Net **+25 LOC** — slightly higher than the 5 importToCatalog migrations (where the legacy code was being deleted alongside) because sandbox-wf had less surrounding scaffolding to remove.

---

## Decision matrix outcomes (vs. plan §4)

| # | Plan decision | Outcome | Notes |
|---|---|---|---|
| 1 | Bulk vs per-file PRs | **Adapted** — 1 file shipped (sandbox-wf), 2 files paused | Original plan was 3-file bulk; PMT mismatch surfaced mid-execution. |
| 2 | Keep `setEntryClassifications` post-register | **Locked** — applied to sandbox-wf | (sandbox-wf doesn't actually call `setEntryClassifications`; this matters for any future PMT migration) |
| 3 | Drop custom `agent_registered` event | **Locked for sandbox-wf** — N/A there; deferred for PMT | PMT's calls to `createCatalogAuditEvent({eventType: "agent_registered"})` stay until the PMT migration unblocks. |
| 4 | Keep `createPublishBundle` direct | **Locked** | Sandbox-wf publish stays direct; gateway publish is a follow-up. |
| 5 | Receipt sourcing for system actors | **Locked** — `<source>-bootstrap-<resource>-${Date.now()}` pattern shipped | |
| 6 | Find-or-update idempotency pre-flight | **N/A for sandbox-wf** | Sandbox-wf doesn't have a find-or-update pre-flight; it's a clean-slate seed loader. The pre-flight pattern was a PMT concern; deferred with PMT. |
| 7 | sandbox-wf in scope | **Locked** | Shipped cleanly. |

**Cap: 0 / 0 allowed new exceptions.** Used: 0.

---

## Lessons (carry-forward for Phase 35+)

1. **§Phase-zero audits should check input-shape compatibility, not just output consumers.** The §34.0 audit checked downstream consumers of the legacy `agent_registered` event (the right thing) and concluded behavior preservation was mechanical. It missed the identity-model mismatch on the caller's input side: PMT's `name === AGENT_CATALOG_ID` source-of-record doesn't fit register's required numeric `sourceId`. Future migration audits should add a step: "for each caller, can the legacy source-of-record be expressed as (sourceType, sourceId) numeric inputs?" If no, surface as a structural blocker before the migration PR starts.

2. **Pause-and-surface is a feature; mid-execution scope reduction is fine.** When the PMT identity mismatch surfaced during §34.1 execution, the right move was to ship sandbox-wf alone rather than block on extending register's input model. The closure report documents the deferral with reasoning. This is the exact pattern Phase 31.3b followed (intra-platform writes elevated through public-api when gateway-call migration would have required behavior changes); same shape applies here.

3. **Synthetic identity values are an anti-pattern.** Tempting alternatives like `sourceId: 0` (sentinel) or `sourceId: hash(name)` would have allowed PMT to fit register's input shape without changing register itself. But synthetic IDs hide the architectural mismatch — the next person looking at the code wouldn't know the identity was synthetic. Document the asymmetry instead; let future architectural changes resolve it cleanly.

4. **Continuous-execution still requires pause discipline.** The standing instruction ("don't wait for approval between phases") doesn't mean "don't pause within a phase." Phase 34 paused mid-§34.1 when the structural blocker surfaced; that's a different thing from waiting for approval between phases. The pause-and-surface protocol from `feedback_continuous_phase_execution.md` (override mid-stream is fine) covers this case.

5. **Name "the asymmetry" so future phases can grep for it.** This closure report uses "PMT self-registration identity mismatch" as the canonical phrase. Future readers wanting to extend register's input model can grep for that phrase and find the architectural rationale here, the §34.1 PR's pause-and-surface decision, and the proposed scope ("PMB Phase X — register name-based identity for self-registered system agents"). Naming things is half the closure-report job.

---

## CI fingerprint

| Phase 34 PR | Status |
|---|---|
| #271 (34.0 docs) | 5/5 ✅ first try |
| #272 (34.1 sandbox-wf only) | 5/5 ✅ first try |
| (this PR — closure report) | (expected 5/5) |

**Phase 34 baseline: 5/5 green throughout.** No regressions; no flaky reruns.

---

## Memory updates after this PR

- `MEMORY.md` — Phase 34 entry flips to CLOSED.
- `project_phase_34_authority.md` — flipped to CLOSED with PR ledger + PMT exception note.
- `project_pmb_phase_34_complete.md` — created with PR ledger + the 5 carry-forward lessons above.
- `project_rac_progress.md` — updated to point at `main@<this-PR-merge-sha>` with Phase 34 marked CLOSED.
