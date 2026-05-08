# PMB Plan v3 — Cleanup Arc State of the Union

**Captured:** 2026-05-08 against `main@9b67134`.
**Phase:** 41.1 — the off-ramp signal per §40 lesson #5.
**Audience:** future Plan v4 work, product features, new contributors. Replaces the need to grep across 13 closure reports + 4 ADRs + 1 audit doc when asking *"what's the architecture state today?"*

---

## TL;DR

Plan v3's cleanup arc closed across 13 phases under continuous-execution (§28-§40), reaching architectural finalist state at §37 and remaining there through §40's confirming audit:

- **0 open architectural exceptions**
- **2 PERMANENT exceptions** (informational, not debt) — `catalog-manage-bespoke-publish-machinery` (§36), `catalog-import-bulk-admin-write` (§39)
- **2 CLOSED architectural exceptions** — `publish-flip-to-published-mismatch` (§36), PMT self-registration identity mismatch (§37)
- **CI fingerprint**: 5/5 green throughout the arc
- **Cap discipline**: zero new TEMPORARY_EXCEPTION_WITH_DEADLINE entries across all 13 phases

The Plan v3 D1-violation count reached zero at §29 (RAC + retrofit closure) and never crept back. Subsequent phases (§30-§40) consolidated the canonical action surface, closed two architectural exceptions, surfaced two permanent ones, and confirmed via audit that the dormant surface is healthy.

This doc is the **off-ramp signal**: future post-finalist phase picks should explicitly justify scope versus this reference.

---

## Section A — Architectural exception register

### CLOSED exceptions

| Exception | Surfaced | Closed | Description | ADR |
|---|---|---|---|---|
| `publish-flip-to-published-mismatch` | §35.1 | §36 | Canonical `aiTypes.catalog.publish` flipped entry status to `"published"` post-publish; both real callers (catalog-manage, sandbox-wf) want `"active"`. Canonical contract redesigned (no auto-flip); sandbox-wf migrated to gateway publish. | `docs/architecture/ai-types/PUBLISH_CANONICAL_CONTRACT_REDESIGN.md` |
| PMT self-registration identity mismatch | §34.1 | §37 | PMT agents are self-registered system agents identified by `name === AGENT_CATALOG_ID` (string); register's `(sourceType, sourceId)` numeric input contract didn't fit. Register extended with `sourceName?` path + "exactly one of" validation; both PMT agents migrated. | `docs/architecture/ai-types/PMT_NAME_BASED_IDENTITY.md` |

### PERMANENT exceptions

| Exception | Locked | Description | ADR |
|---|---|---|---|
| `catalog-manage-bespoke-publish-machinery` | §36 | `server/routers/catalog-manage.ts` publish procedure has 6 bespoke layers (Triple Validation, transient `publishing` status, snapshot extras, separate audit channel) that don't fold into canonical without anti-pattern toggle flags. Stays on direct `createPublishBundle`. | (in `PUBLISH_CANONICAL_CONTRACT_REDESIGN.md` §"Negative consequences") |
| `catalog-import-bulk-admin-write` | §39 | `server/catalog-import/router.ts:409` is bulk operator-driven import with pre-write dedup at preview time + no source-of-record linkage by data-model design. Stays on direct `createCatalogEntry`. | `docs/architecture/ai-types/CATALOG_IMPORT_BULK_ADMIN_WRITE_EXCEPTION.md` |

**Permanent ≠ failure state** (§39 lesson #3). These reflect bespoke caller-side workflow logic. The exception register's permanent count is informational metadata, not a bug count.

---

## Section B — Canonical action surface

### `aiTypes/*` actions

| Action | Production callers | Status | Notes |
|---|---|---|---|
| `aiTypes.catalog.register` | 22+ | **Active** — sourceId + sourceName paths | Canonical write path for catalog_entries. §37 added the `sourceName?` path for self-registered system agents; §38 added `result.entry: CatalogEntry` to spare round-trips. |
| `aiTypes.catalog.publish` | 1 (sandbox-wf via §36.2) | **Active** — contract redesigned in §36 | Canonical no longer mutates entry status; caller-side concern. §36 ADR locks the redesign rationale. |
| `aiTypes.providerModels.listAvailable` | 3 | **Active** | Read-only; returns refs, no credentials. |

### `agentStudio/*` actions

| Action | Production callers | Status | Notes |
|---|---|---|---|
| `agentStudio.agent.publish` | 2 | **Active** | |
| `agentStudio.exportCatalog.exportCandidate` | 2 | **Active** | |
| `agentStudio.exportCatalog.reconcileSync` | 1 | **Active** | Phase 41 drift-scan / repair surface. |
| `agentStudio.providerBindings.{list,create,update,remove}` | various | **Active** | Phase 12 binding lifecycle (4 of 6 bindings actions). |
| `agentStudio.workspaceDefaultBindings.list` | various | **Active** | Phase 30.1 surface. |
| `agentStudio.exportCatalog.{listCandidates,getCandidate}` | various | **Active** | |
| `agentStudio.run.execute` | 0 | **Dormant — clean** | §40 audited. |
| `agentStudio.providerBindings.validate` | 0 | **Dormant — clean** | §40 audited. |
| `agentStudio.providerBindings.resolveForRun` | 0 | **Dormant — clean** | §40 audited. |
| `agentStudio.workspaceDefaultBindings.upsert` | 0 | **Dormant — clean** | §40 audited. |
| `agentStudio.workspaceDefaultBindings.delete` | 0 | **Dormant — clean** | §40 audited. |
| `agentStudio.exportCatalog.markImported` | 0 | **Dormant — clean** | §40 audited. |
| `agentStudio.exportCatalog.reconcileImports` | 0 | **Dormant — clean** | §40 audited. |

7 dormant actions, all clean (§40). The dormancy is **product-roadmap dormancy** (UI/tooling not yet using them), not **contract dormancy** (handlers waiting on a contract decision).

---

## Section C — Established gateway-call patterns

The patterns below were refined across §28-§40. Future migration phases (or new canonical actions) should reuse them.

### Receipt sourcing

| Caller shape | Pattern | Origin |
|---|---|---|
| User-driven action | `<source>-<action>-<id>-<userId>-${Date.now()}` | §32 |
| System-actor bootstrap | `<source>-bootstrap-<resource>-${Date.now()}` | §34.1 |
| System-actor publish | `<source>-publish-<resource>-${Date.now()}` | §36.2 |
| System-actor self-register | `pmt-<agent-key>-bootstrap-<AGENT_CATALOG_ID>-${Date.now()}` | §37.2/§37.3 |

### Find-or-update pre-flight

When a caller has its own idempotency invariant beyond what the canonical's duplicate guard provides (e.g., field-level drift patching), keep the pre-flight: lookup by name → if exists, patch fields without re-creating; if not, call the canonical write path. Documented in §32 importToCatalog migrations + §37.2/§37.3 PMT migrations.

### Public-api type re-export

When a canonical action's result type is consumed by callers outside the canonical's module, re-export it via the module's `public-api.ts` (one line). Callers get tight types without violating boundary lint or drifting independently. Established in §38.2.

### Return-what-you-produce default

When designing a new canonical write action, the result shape should include the resulting row by default unless there's a specific reason to omit it (privacy, cardinality). Default to "return what you produced" so callers don't round-trip to fetch what the canonical already had. Established in §38 (extension of `RegisterCatalogEntryResult.entry`).

### Backwards-compatible canonical extensions

When extending a canonical's input or return shape, prefer additive fields over reshape. Behavior-affecting changes (e.g., removing flip-to-published, adding "exactly one of" validation) need ADRs; additive extensions don't. Established in §38.

### ADR co-merged at plan-freeze time

When a phase's scope is "redesign canonical contract X" or "lock decision Y as permanent", the ADR ships in the plan-freeze PR (§N.0), not after the implementation lands. Future readers grep for the contract redesign and find rationale + alternatives considered + permanent exception list, all locked at plan-freeze time. Established in §36; reused in §37 and §39.

---

## Section D — Contract-redesign protocol

The decision tree refined across §34-§39 for what to do when a caller doesn't fit the canonical:

### Tier 1 — Pause-and-surface

When a caller mid-execution surfaces a structural mismatch with the canonical (caller-side identity model conflicts; canonical's auto-behavior conflicts with caller expectations), the response is **pause-and-surface**:

1. Document the mismatch as a **named architectural exception** in the deferral PR (not in the closure report — name it at the moment of pause)
2. Ship the orthogonal cleanup that's already in scope (orphan delete, etc.)
3. Defer the migration to a dedicated future phase that includes a canonical contract redesign + ADR

Examples: §34 PMT identity mismatch; §35 publish-flip-to-published-mismatch.

### Tier 2 — Tackle in a dedicated phase

When two pause-and-surfaces accumulate, the next phase should tackle one of them rather than generate a third deferral. The tackle phase ships:

1. ADR co-merged at plan freeze
2. Canonical contract change
3. Caller migration(s) — separate PRs per caller for `git blame` clarity (§37 lesson #4)
4. Closure report with explicit exception-register update

Examples: §36 (closes publish-flip-to-published); §37 (closes PMT identity).

### Tier 3 — Document as permanent exception

When a caller has bespoke pre-write or pre-publish workflow logic that's caller-side by data-model design, **don't migrate**. Document as permanent architectural exception:

1. ADR documenting three layers of structural distinction (data model, pre-write logic, operator-visible semantics)
2. Three options considered (migrate via existing path / extend canonical / document as permanent) with rejection rationale
3. Inline comment at the call site cross-referencing the ADR
4. `scripts/governance/check-invariants.ts` exemption note

Examples: §36 catalog-manage; §39 catalog-import.

### Tier 4 — Future direct-caller audit decision tree

When a future phase surfaces a new direct caller (like §39 catalog-import surfaced during §38's round-trip audit), walk the §39 ADR's decision tree:

1. Does the caller have `sourceType + sourceId` (numeric) or `sourceName` (string)? → Migrate via existing canonical paths.
2. Does the caller have bespoke pre-write logic that conflicts with canonical's duplicate guard or post-write side effects? → Tier 3 (permanent exception).
3. Does the caller fit a NEW pattern that should justify extending the canonical? → Plan v4-ish architectural change with its own ADR.

Reference: `docs/architecture/ai-types/CATALOG_IMPORT_BULK_ADMIN_WRITE_EXCEPTION.md` §"Convention for future direct-caller audits".

---

## Section E — Lessons synthesis (top 10 across 13 phases)

These are the most reusable lessons. Full text per phase in `project_pmb_phase_<N>_complete.md` memory entries; condensed here.

1. **Pre-flight audits should read caller bodies, not just call-site shapes.** §35 lesson #1. §35.1 caught the publish-flip-to-published bug only by reading the caller's full registration block; the call-site grep wasn't enough.

2. **Synthetic identity values are an anti-pattern.** §34 lesson #3, §35 lesson #3. `sourceId: 0` sentinels or `sourceId: hash(name)` schemes hide architectural mismatches. Document the asymmetry instead.

3. **Canonical contracts validated only by tests are hypotheses.** §36 lesson #2; §40 confirmed empirically (7 dormant actions all clean). Production callers are the validation layer; until then, the contract is a guess.

4. **Pause-and-surface is the standing pattern for canonical-mismatch detection.** §35 lesson #3. Two phases in a row paused-and-surfaced (§34, §35); subsequent phases tackled (§36, §37).

5. **Two pause-and-surfaces in a row is the cue to tackle a surfaced exception, not generate a third deferral.** §36 lesson #1. Drives the §36/§37 tackling cadence.

6. **ADRs that ship with the plan freeze lock rationale in advance.** §36 lesson #5; reused in §37 and §39. Future readers grep the ADR and find rationale + alternatives + exception list at plan-freeze time, not after implementation drift.

7. **Permanent architectural exceptions are not failure states.** §39 lesson #3. Two permanent exceptions reflect bespoke caller-side workflow logic. The register's permanent count is informational, not a bug count.

8. **`getCatalogEntryById(result.id)` round-trips are an anti-pattern.** §38 lesson #4. When a canonical produces a row, return it directly. Default to "return what you produced."

9. **Public-api re-exports are the scaling pattern for type sharing.** §38 lesson #5. Callers outside the module get tight types without inline drift or boundary-lint violations.

10. **Audit-only phases produce reusable infrastructure even when "no findings".** §40 lesson #2 + lesson #4. The audit doc itself is the carry-forward artifact; future migration planners grep for it instead of re-deriving.

---

## Section F — Open follow-ups (greenfield only)

What remains genuinely open after the cleanup arc:

| Item | Source | Status |
|---|---|---|
| **DOCX parser** (`D-PARSE-DOCX-N` ADR pending) | CLAUDE.md §"Deferred Scope" | Not started; needs ADR scoping |
| **OCR-PDF parser** (`D-PARSE-OCRPDF-N` ADR pending) | CLAUDE.md §"Deferred Scope" | Not started; needs ADR scoping |
| **Multi-region deployment** | `docs/architecture/agent-studio-multi-region.md` | Forward-looking ADR; trigger conditions documented; not yet triggered |
| **Future product features** introducing new canonical actions | open | Should run through the §40 audit lens at design time |

**These are NOT cleanup carry-forwards** — they're greenfield product/infrastructure decisions that need explicit operator/PM scoping. Future phases that pick from this list should produce an explicit "this is a product/infrastructure decision, not a Plan v3 cleanup carry-forward" framing in their plan freeze.

---

## Section G — Off-ramp framing

After §40's audit confirmed the cleanup surface is healthy and §41 consolidated the cumulative state, the **standing-instruction loop has done its job for the Plan v3 cleanup arc.** Future phases that touch this surface should:

1. **Read this doc first** (single reference; no need to grep across 13 closure reports).
2. **Walk the §39 audit decision tree** when surfacing a new direct caller.
3. **Pause-and-surface** if a structural mismatch appears (Tier 1 protocol).
4. **Justify scope explicitly** versus this reference — "Phase X is a Plan v3 cleanup carry-forward because Y" or "Phase X is product/infrastructure work explicitly scoped per CLAUDE.md §Z".

The continuous-execution standing instruction's loop continues per its terms; this doc is the **soft handoff** that lets the user redirect — to greenfield work, to bookkeeping picks, to termination, or to anything else.

---

## Cross-references

### Phase ledger (§28-§40)

- §28-§29: D1-violation closure (LR migrations); RAC + retrofit closure
- §30: Operator-surface completion (Option D); workspace-default-binding admin surface
- §31: AI Types public-api boundary strict mode; barrel-strip + caller migration
- §32: `<domain>.importToCatalog` gateway register migration (5 procedures)
- §33: Chat-binding tool-loop test repair
- §34: Sandbox-wf gateway register migration; PMT identity mismatch surfaced (paused)
- §35: Pause-and-surface publish migration; orphan delete; publish-flip-to-published-mismatch named
- §36: `aiTypes.catalog.publish` canonical contract redesign; sandbox-wf publish migrated; first permanent exception (catalog-manage)
- §37: PMT name-based identity contract extension; both PMT agents migrated; **architectural finalist state reached**
- §38: Round-trip elimination; `RegisterCatalogEntryResult.entry` extension; 8 callers migrated
- §39: Catalog-import permanent exception (second permanent); audit decision tree
- §40: Dormant canonical action audit; all 7 clean; cleanup-sub-arc-likely-done lesson

### ADRs

- `docs/architecture/ai-types/PUBLISH_CANONICAL_CONTRACT_REDESIGN.md` (§36)
- `docs/architecture/ai-types/PMT_NAME_BASED_IDENTITY.md` (§37)
- `docs/architecture/ai-types/CATALOG_IMPORT_BULK_ADMIN_WRITE_EXCEPTION.md` (§39)

### Audit

- `docs/architecture/ai-types/DORMANT_CANONICAL_ACTIONS_AUDIT_2026_05_08.md` (§40)

### Closure reports (per-phase artifacts)

`docs/evidence/provider-model-binding/PHASE_<N>_CLOSURE_REPORT.md` for N ∈ {28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40}.

### Memory entries

`~/.claude/projects/-root/memory/project_pmb_phase_<N>_complete.md` for N ∈ {28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40}.

---

## Phase 41 itself

This doc is the §41.1 deliverable. The §41.0 plan freeze (`PHASE_41_EXECUTION_PLAN.md`) authored the off-ramp framing; §41.2 closure report ships the explicit "cleanup arc complete" framing for memory + RAC progress doc updates.

The doc is **not** the loop terminator. It's the off-ramp signal.
