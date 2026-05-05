# Legacy Exception Register — Snapshot

**Captured:** 2026-05-04 against main@8517385.

This is a point-in-time snapshot of `LEGACY_EXCEPTION_REGISTER.md` at
the end of Stage 11. The live register is the source of truth; this
snapshot exists so future readers can see exactly which exceptions
were open at the post-Stage-11 cut.

---

## Status counts at snapshot

| Status | Count |
|---|---:|
| `open` | 16 |
| `in_progress` | 4 (LR-01, LA-01, LA-02, plus follow-up rows) |
| `migrated` | 3 (LC-04, LC-07, LC-08, LO-01) |
| `removed` | 1 (LC-08) |

---

## Notable closures during Plan v3

| Entry | Closed by | Notes |
|---|---|---|
| LE-01 (`aiTypes.catalog.published` declared, no subscribers) | Phase 40 | AS now subscribes via `subscribeEvent("aiTypes.catalog.published", "agentStudio", ...)` in boot.ts. |
| LE-02 (`aiTypes.catalog.deprecated` declared, no subscribers) | Phase 40 | Same — AS subscriber wired. |
| LC-04 (`server/routers/catalog-manage.ts` ownership) | Phase 25 (PR #129) | File is the AI Types admin tRPC surface in the wrong directory; relocation is a no-op refactor outside Plan v3. |
| LC-07 (`catalog_entries` in automation `ALLOWED_TABLES`) | Phase 25 (PR #129) | Reclassified as accepted whitelist entry — not a code path that reads the table. |
| LC-08 (`server/hq/router.ts:127` field name) | Phase 25 (PR #129) | False positive — data fetched via public counters API. |
| LO-01 (catalog-manage location audit) | Phase 25 (PR #129) | Resolved by matrix; relocation tracked outside Plan v3. |

---

## Notable open items at snapshot

These are the entries the snapshot pins for Plan v3 closure:

### High-risk

- **LR-06** (`server/_core/index.ts:120-140` autoProvisionProviders) — boot-time env-to-runtime path Phase 10 owns. Status: `open`.
- **LK-01** (`ags_agent_drafts.providerConfig` jsonb permits raw apiKey) — Phase 10 schema migration owner. Status: `open`.
- **LC-03** (`server/llm/authority.ts:107` direct catalog_entries write) — Phase 26 caller migration. Status: `open`.

### In progress

- **LR-01** — Agent Studio runtime adapter `process.env[apiKeyEnvVar]` indirection. Phase 17 routed binding-equipped chat through Model Access; Phase 18 routed tool-equipped chat. The remaining live runtime branches (`services/simulation.ts`, non-binding `runChatWithTools`) are owned by Phase 27.
- **LA-01** — `server/db.ts` barrel re-exports `ai-types/db`. Phase 26 added the lint with this row baselined. Strip + caller migration is Phase 26.1.
- **LA-02** — 21 baselined direct imports of AI Types internals. Phase 26 baselined; caller migration is Phase 26.1.

### Deferred to Stage 12

Per the EXECUTION_CHECKLIST Stage 12 plan:

- LR-02..LR-05 (embeddings, documents, operators, OmniRAG env reads) — Phase 27 raw-key surface elimination batch.
- LR-08, LR-09 (chat-stream, code-studio provider-sync) — Phase 27.

---

## Aggregate count comparison

| Cut | Open | In progress | Migrated/Removed |
|---|---:|---:|---:|
| Phase 0.3 (start) | 18 | 0 | 0 |
| Phase 5 (LR-06 added) | 19 | 0 | 0 |
| Phase 25 (LO-01 resolved) | 18 | 0 | 4 |
| Phase 26 (lint baselined) | 18 | 3 | 4 |
| Phase 40 (LE-01/LE-02 closed) | 16 | 3 | 6 |
| **Phase 45 snapshot (this file)** | **16** | **4** | **6** |

The Phase-45 deltas vs Phase-40 are housekeeping (LE-01 + LE-02
moved from `open` to `migrated` after Phase 40 actually wired the
subscribers; LR-01 status moved from `partial` to `in_progress`
to reflect Phase 18's PR-118 narrowing).

---

## Where to look for the live register

`docs/architecture/provider-model-binding/LEGACY_EXCEPTION_REGISTER.md`
remains the canonical source of truth. This snapshot is a static
copy for the Phase 46 evidence bundle.
