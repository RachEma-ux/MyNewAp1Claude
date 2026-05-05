# Future track — Frontend cross-module tRPC cleanup

**Status:** backlog (out of Plan v3 main scope; this is the Phase 48 stub)
**Owners:** Frontend-modularity track (separate plan, not Plan v3)
**Last inventoried:** 2026-05-05 against `main` post Phase 47 (`849041c`)

---

## Why this is a separate track

Plan v3 enforces strict module boundaries on the **server** side (Module Gateway,
sealed gateway context, public-API barrels, action-key map, receipt policy,
event-sourced cross-module sync). The Plan v3 invariants for **frontend**
cross-module communication — i.e. one frontend module never calling another
frontend module's tRPC namespace directly — are intentionally narrower:

- The strict rule (no direct cross-module tRPC) **only applies to NEW Agent
  Studio ↔ AI Types flows**. That scope was sized so Plan v3 can finish
  without a wholesale frontend refactor.
- Existing direct-tRPC call sites in legacy pages and shared components are
  **not blocking Plan v3 completion**. They are tracked here for a separate
  frontend-boundary refactor.

Promoting the strict rule to the entire frontend would require:

1. A frontend "module-gateway"-equivalent (today there is no client-side
   sealed-context mechanism).
2. Per-module public read/write surface declarations on the client.
3. Migration of all cross-module call sites currently in `client/src/pages/`
   and `client/src/components/` (the non-modular surface).
4. Lint/static enforcement (`check:cross-module-links` extension) for the
   tRPC-call dimension.

That is a multi-PR initiative. Plan v3 does not own it.

---

## Scope of the strict rule (active in Plan v3)

The narrow rule, locked by Plan v3, is:

> A new frontend feature in `client/src/modules/agent-studio` MUST NOT call
> `trpc.aiTypes.*` directly, and a new frontend feature in
> `client/src/modules/ai-types` MUST NOT call `trpc.agentStudio.*` directly.
> Cross-module data flow goes through the server-side Module Gateway and is
> exposed to each frontend through that frontend's own tRPC namespace.

This is enforced by `check:cross-module-links` and by
`tests/pmb/boundary.test.ts` invariant 7 ("frontend cross-module enforcement").

The rule applies **only to those two namespaces** today. Other module pairs
are documented below for the future-track refactor.

---

## Inventory — direct cross-module tRPC calls (snapshot, 2026-05-05)

The numbers below count `trpc.<namespace>.*` call sites by source module
directory under `client/src/modules/<module>/`.

### Per-module namespace usage

Each frontend module overwhelmingly calls its own namespace:

| Frontend module | Calls own ns | Cross-module calls |
|---|---|---|
| `agent-studio` | `trpc.agentStudio.*` (143) | none |
| `ai-types` | `trpc.aiTypes.*` (16) | none |
| `hr` | `trpc.hr.*` (98) | none |
| `ps` | `trpc.ps.*` (96), `trpc.catalogManage.*` (1) | 1 call to `catalogManage` |
| `code-studio` | `trpc.codeStudio.*` (52) | `trpc.workspaces.*` (1), `trpc.providers.*` (1) |
| `data-analysis` | `trpc.dataAnalysis.*` (48), `trpc.kgraAgent.*` (1) | 1 call to `kgraAgent` |
| `openrouter` | `trpc.openRouter.*` (33) | none |
| `psm` | `trpc.psm.*` (31) | none |
| `prm` | `trpc.prm.*` (28) | none |
| `sandbox-wf` | `trpc.sandboxWf.*` (26) | none |
| `organization-management` | `trpc.organizationManagement.*` (25) | none |
| `pm-central` | `trpc.pmCentral.*` (20), `trpc.hq.*` (some) | shared HQ surface |
| `communication` | `trpc.communication.*` (13), `trpc.hq.*` (some), `trpc.chat.*` (1) | shared HQ surface + chat |
| `culture-values` | `trpc.cultureValues.*` (11), `trpc.workspaces.*` (1) | 1 call to `workspaces` |
| `kgra-agent` | `trpc.kgraAgent.*` (3) | none |

### Cross-module namespaces actually used

| Calling namespace | Source modules | Notes |
|---|---|---|
| `trpc.hq` | `communication`, `pm-central` | Cross-cutting Headquarters surface — likely correct as a shared facade, document as such. |
| `trpc.kgraAgent` | `data-analysis`, `kgra-agent` | KGRA is a sub-domain of Data Analysis (per memory `feedback_data_analysis_ownership.md`). The split may need ownership clarification. |
| `trpc.workspaces` | `code-studio`, `culture-values` | Workspaces is a cross-cutting concept (auth/scope), likely fine as a shared facade. |
| `trpc.providers` | `code-studio` | Provider Connections surface; needs evaluation. |
| `trpc.chat` | `communication` | Likely fine; chat is a shared utility. |
| `trpc.catalogManage` | `ps` | Catalog management; should likely route via PS's own tRPC namespace if possible. |

### Non-modular pages and shared components (legacy surface)

`client/src/pages/` and `client/src/components/` are **not** in the modular
hierarchy — they predate the modularization and are the largest single source
of direct cross-module tRPC calls.

| Namespace | Calls from `client/src/pages/` + `components/` |
|---|---|
| `trpc.providers` | 29 |
| `trpc.catalogManage` | 43 |
| `trpc.hq` | 12 |
| `trpc.hr` | 2 |
| `trpc.sandboxWf` | 1 |

These pages are the bulk of the eventual refactor.

---

## Future refactor — proposed sequencing

A separate plan ("Frontend Module-Gateway") would proceed roughly as follows.
Numbers and grouping are indicative, not committed.

1. **Define a frontend module public-API descriptor.** Each `client/src/modules/<m>/`
   declares (a) the tRPC namespaces it owns, (b) the cross-module reads it
   intentionally exposes, (c) the cross-module reads it intentionally consumes.
2. **Write a static cross-module-trpc lint** (an extension of
   `check:cross-module-links`) that flags any `trpc.<otherModule>.*` call
   from inside `client/src/modules/<m>/` unless the descriptor declares it.
3. **Migrate existing cross-module calls** module by module:
   - `data-analysis` ↔ `kgra-agent` (resolve KGRA ownership first per memory).
   - `communication` and `pm-central` against `hq` (decide whether `hq` stays
     a shared facade or gets folded into per-module namespaces).
   - `code-studio` and `culture-values` against `workspaces` (likely keep
     `workspaces` as a shared cross-cutting facade and document that).
   - `ps` against `catalogManage` (likely route through PS's own namespace).
   - `code-studio` against `providers` (route through PS or move to a shared
     facade).
4. **Migrate the legacy `client/src/pages/` and `client/src/components/` pages**
   into appropriate modules. The 43 `catalogManage` and 29 `providers` calls
   are the long pole.
5. **Promote the strict rule from "AS↔AI Types only" to "all modules"** once
   the migration is complete.

---

## What Plan v3 ships for this phase

Phase 48 is intentionally a doc-only stub:

- This document (FUTURE_FRONTEND_TRPC_CLEANUP.md) — backlog item + inventory
  + proposed sequencing.
- A note in `EXECUTION_CHECKLIST.md` Phase 48 marking each item done with a
  reference to this doc.

Phase 48 ships **no code changes**. The strict rule active during Plan v3
remains scoped to AS ↔ AI Types and is already enforced by
`tests/pmb/boundary.test.ts` invariant 7.

---

## Cross-references

- `docs/architecture/frontend/CROSS_MODULE_FRONTEND_BOUNDARIES.md` — the
  modularity-track doc that owns the "PMB cross-module surfaces" section.
- `tests/pmb/boundary.test.ts` invariant 7 — runtime enforcement of the
  AS ↔ AI Types narrow rule.
- `scripts/check-cross-module-links.ts` — current static check; the future
  lint extension would build on this script.
- `docs/architecture/provider-model-binding/EXECUTION_CHECKLIST.md` Phase 48 —
  this phase's checklist entry.
