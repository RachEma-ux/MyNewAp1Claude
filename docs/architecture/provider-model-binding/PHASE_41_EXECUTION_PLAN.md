# Phase 41 — Execution Plan

**Captured:** 2026-05-08 against `main@435a451` (post-Phase-40 closure).
**Branch (this doc):** `docs/pmb-phase-41-0-execution-plan`.
**Owner:** Planner role per AGENTS.md; full autonomous-execution authority granted by the 2026-05-07 standing instruction.

---

## 1. Why Phase 41 exists

Phase 41 is the **honest off-ramp**. After 13 phases under continuous-execution (28-40), Plan v3 has reached architectural finalist state:

- 0 open architectural exceptions
- 2 permanent exceptions (catalog-manage-bespoke-publish-machinery §36, catalog-import-bulk-admin-write §39) — locked, no future-phase scope
- 2 CLOSED architectural exceptions (publish-flip-to-published-mismatch §36, PMT identity mismatch §37)
- 7 dormant canonical actions audited (§40, all clean)
- 8 register round-trips eliminated (§38)
- All identified `<domain>.importToCatalog` direct callers migrated (§32)

§40 lesson #5 explicitly surfaced this state:

> Phase 40 may be the last of the "concrete cleanup" sub-arcs. The "indirect carry-forward with concrete value" well that fed §38 (round-trip elimination) and §39 (catalog-import audit) is now drained. **Convention:** when post-finalist phase picks start to feel like reaching, the standing-instruction loop has done its job — surface to the user that the cleanup arc is done, even if the loop technically hasn't been terminated.

Phase 41 honors that lesson. It produces a **consolidating state-of-the-union doc** that captures the cumulative state of the Plan v3 cleanup arc — useful as a reference for future Plan v4 work, product features, or new contributors who need to understand "what's the architecture state today?" without grepping across 13 closure reports.

---

## 2. What goes in the state-of-the-union doc

The doc consolidates artifacts that currently live across 13 closure reports + 4 ADRs + 1 audit:

### Section A — Architectural exception register

Single table capturing:

- **CLOSED exceptions** (2): publish-flip-to-published-mismatch, PMT self-registration identity mismatch
- **PERMANENT exceptions** (2): catalog-manage-bespoke-publish-machinery, catalog-import-bulk-admin-write
- For each: surfaced-by-phase, closed/locked-by-phase, ADR cross-reference

### Section B — Canonical action surface

Single table per module:

- `aiTypes.catalog.register` — 22+ production callers; sourceId + sourceName paths (§37)
- `aiTypes.catalog.publish` — 1 production caller (sandbox-wf via §36.2); contract redesigned in §36
- `aiTypes.providerModels.listAvailable` — 3 production callers
- `agentStudio.*` — 14 actions (8 active, 6 dormant-clean per §40)

### Section C — Established gateway-call patterns

The patterns future migration phases (or new canonical actions) should reuse:

- **Receipt sourcing:**
  - System-actor: `<source>-bootstrap-<resource>-${Date.now()}` (§34.1, §36.2, §37.2)
  - User-actor: `<source>-<action>-<id>-<userId>-${Date.now()}` (§32)
- **Find-or-update pre-flight** for idempotency invariants (§32, PMT §37)
- **Public-api type re-export** for callers outside the canonical's module (§38.2)
- **`return what you produced`** default for canonical write actions (§38)
- **Backwards-compatible canonical extensions** preferred over reshape (§38)
- **ADR co-merged at plan-freeze time** for canonical contract redesigns (§36, §37)

### Section D — Contract-redesign protocol

The decision tree refined across §34-§39 for what to do when a caller doesn't fit the canonical:

1. **Pause-and-surface** if the mismatch is structural (§34 PMT, §35 publish)
2. **Tackle in a dedicated phase with ADR** if the canonical contract should change (§36 publish, §37 PMT)
3. **Document as permanent exception** if the caller is bespoke by design (§36 catalog-manage, §39 catalog-import)
4. **Use the §39 future-direct-caller audit decision tree** for newly-surfaced direct callers

### Section E — Lessons synthesis (top 10)

The most reusable lessons across 13 phases:

1. Pre-flight audits should read caller bodies, not just call-site shapes (§35 #1)
2. Synthetic identity values are an anti-pattern (§34 #3)
3. Canonical contracts validated only by tests are hypotheses (§36 #2, §40 confirmation)
4. Pause-and-surface is the standing pattern for canonical-mismatch detection (§35 #3)
5. Two pause-and-surfaces in a row is the cue to tackle a surfaced exception (§36 #1)
6. ADRs that ship with the plan freeze lock rationale in advance (§36 #5, §37 reuse)
7. Permanent architectural exceptions are not failure states (§39 #3)
8. `getCatalogEntryById(result.id)` round-trips are an anti-pattern (§38 #4)
9. Public-api re-exports are the scaling pattern for type sharing (§38 #5)
10. Audit-only phases produce reusable infrastructure even when "no findings" (§40 #2, #4)

### Section F — Open follow-ups

What remains genuinely open after the cleanup arc:

- **DOCX + OCR-PDF parsers** (CLAUDE.md-deferred): D-PARSE-DOCX-N + D-PARSE-OCRPDF-N ADRs would gate this work.
- **Multi-region deployment** (CLAUDE.md-deferred): single-region remains the operational baseline.
- **Future product features** that introduce new canonical actions: should run through the §40 audit lens at design time.

These are NOT cleanup carry-forwards — they're greenfield product/infrastructure decisions that need explicit operator/PM scoping.

### Section G — The off-ramp framing

Explicit acknowledgment that the Plan v3 cleanup arc is in finalist state. Future phases that touch this surface should:

- Read this doc first (single reference)
- Walk the §39 audit decision tree if surfacing a new direct caller
- Pause-and-surface if a structural mismatch appears

---

## 3. Sub-phase decomposition

### 41.0 — Plan freeze (this PR)

- [ ] Land `PHASE_41_EXECUTION_PLAN.md` (this doc).
- [ ] Memory: create `project_phase_41_authority.md`; `MEMORY.md` index update.
- [ ] **Acceptance:** doc lands; CI 5/5 green.

### 41.1 — Plan v3 state-of-the-union doc

Single PR. Produces one comprehensive consolidating doc:

- [ ] Author `docs/architecture/provider-model-binding/PMB_PLAN_V3_STATE_OF_THE_UNION.md` covering all 7 sections (A through G).
- [ ] **No code changes.** Doc-only consolidation.
- [ ] **Acceptance:** doc lands; cross-references resolve to existing ADRs/closure reports/audit doc; CI 5/5 green.
- [ ] **Estimate:** 1 PR, 0 LOC code, ~600 LOC doc.

### 41.2 — Closure report

- [ ] Author `docs/evidence/provider-model-binding/PHASE_41_CLOSURE_REPORT.md`.
- [ ] **Explicit framing:** "Plan v3 cleanup arc complete; state-of-the-union doc is the off-ramp; future phases should explicitly justify scope vs the §41 reference."
- [ ] Update memory: `project_phase_41_authority.md` → CLOSED; `project_pmb_phase_41_complete.md` created with PR ledger + cleanup-arc-complete carry-forward; `MEMORY.md` index update; RAC-progress head SHA bump.
- [ ] **Acceptance:** all 3 PRs merged; CI fingerprint stable.
- [ ] **Estimate:** 1 PR, ~200 LOC docs.

---

## 4. Decision matrix

Cap: **zero new TEMPORARY_EXCEPTION_WITH_DEADLINE entries.**

| # | Item | Decision | Sub-phase | Risk |
|---|---|---|---|---|
| 1 | State-of-the-union vs `@deprecated` audit vs greenfield | **State-of-the-union** — honest off-ramp; consolidates 13 phases | 41.0 | Low |
| 2 | Section A through G coverage | **All 7 sections in §41.1** | 41.1 | Low |
| 3 | Off-ramp framing in closure report | **Explicit** — "cleanup arc complete; future phases need explicit scope justification" | 41.2 | Low |
| 4 | Should §41 terminate the continuous-execution loop? | **No.** Loop continues; user decides next via override or natural cadence. The doc is the off-ramp signal, not an operator instruction. | 41.0 | Low |
| 5 | Future re-audits / re-consolidation? | **Date-stamped if needed.** §40's date-stamping convention applies to consolidation docs too; future Plan v4 may produce its own state-of-the-union. | 41.1 | Low |

---

## 5. Test strategy

- **41.0 (this):** docs only.
- **41.1 (state-of-the-union doc):** docs only; cross-reference resolution.
- **41.2 (closure):** docs only.

**CI fingerprint:** Phase 41 baseline is **5/5 green** at `435a451`. No matrix-shape changes.

---

## 6. Sizing

| Sub-phase | PRs | LOC code | LOC docs |
|---|---|---|---|
| 41.0 (this) | 1 | — | ~250 |
| 41.1 (state-of-the-union doc) | 1 | — | ~600 |
| 41.2 (closure) | 1 | — | ~200 |
| **Total** | **3** | **0** | **~1050** |

Largest doc-only phase. Consolidates 13 closure reports + 4 ADRs + 1 audit into one reference.

---

## 7. CI fingerprint expectation

Phase 41 baseline is **5/5 green** as of `435a451`. No changes expected.

---

## 8. Authority and pause conditions

**Authority:** full autonomous commit/push/merge for any PR scoped inside this plan. Phase 41 is the **eighth phase under the continuous-execution standing instruction** and the **fourth post-finalist phase**. Picked autonomously after Phase 40 closed at `435a451`.

**Surface of my reasoning in the kickoff:** Per §40 lesson #5, the cleanup sub-arc is likely done. The honest off-ramp is a consolidating state-of-the-union doc that captures the milestone explicitly + provides a single reference for future readers. After §41, the user can decide whether to terminate the loop, pivot to greenfield (parsers, multi-region prep), or continue with bookkeeping picks.

**Pause and surface for sign-off if:**

1. Mid-execution, the §41.1 consolidation surfaces an inconsistency in the cumulative state (e.g., a closure report says one thing; another says something contradictory). Would be a real finding; surface for resolution.
2. The user provides an explicit "switch to X" override mid-phase. Standing instruction permits override.
3. Pre-existing red CI on a sub-phase PR not on the known-flaky-shard list.
