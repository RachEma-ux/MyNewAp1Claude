# Phase 40 — Execution Plan

**Captured:** 2026-05-08 against `main@aec496a` (post-Phase-39 closure).
**Branch (this doc):** `docs/pmb-phase-40-0-execution-plan`.
**Owner:** Planner role per AGENTS.md; full autonomous-execution authority granted by the 2026-05-07 standing instruction.

---

## 1. Why Phase 40 exists

§36 closure's lesson #2 explicitly tagged this work:

> **Canonical contracts validated only by tests are hypotheses; production callers validate them.** `aiTypes.catalog.publish`'s flip-to-published behavior was hardcoded in Phase 30 and lived for two phases of caller migrations without any production caller invoking it. Tests-only exercise meant the gate-5-conflict bug never surfaced — only the §35.1 caller-body audit caught it. **Other dormant canonical actions deserve a once-over before migration starts.**

§38 took up this thread (canonical drift discovery via audit). §39 codified the `future direct-caller audit decision tree` for newly-surfaced direct callers. Phase 40 is the **proactive companion** to §39's reactive audit: enumerate the manifest-registered actions whose handlers haven't been validated by a production caller, audit their contracts, surface any "surprise factor" before the first real caller arrives.

Phase 40 is the **third post-finalist phase**. The architectural-exception register stays at 0 open / 2 permanent (Plan v3 finalist state preserved). The phase produces an audit doc, not code changes.

---

## 2. Pre-flight audit findings

### Initial caller-count survey

Approximate counts (excludes `*.test.ts`, manifest/boot files, action-key-map self-references, ai-types/events.ts):

```
22 callers : aiTypes.catalog.register
 4 callers : aiTypes.catalog.publish
 3 callers : aiTypes.providerModels.listAvailable
 2 callers : agentStudio.exportCatalog.exportCandidate
 2 callers : agentStudio.agent.publish
 1 callers : agentStudio.exportCatalog.reconcileSync
 0 callers : agentStudio.run.execute                          ← dormant
 0 callers : agentStudio.providerBindings.validate            ← dormant
 0 callers : agentStudio.providerBindings.resolveForRun       ← dormant
 0 callers : agentStudio.workspaceDefaultBindings.upsert      ← dormant
 0 callers : agentStudio.workspaceDefaultBindings.delete      ← dormant
 0 callers : agentStudio.exportCatalog.markImported           ← dormant
 0 callers : agentStudio.exportCatalog.reconcileImports       ← dormant
```

**At least 7 dormant canonical actions** — registered, action-key-mapped, but zero production gateway-call sites. Pre-flight cursory inspection of `agentStudio.run.execute` (boot.ts:130-159) shows the handler is reasonable on its face; no obvious gotchas like publish-flip-to-published. But that's the point — **rigorous audit beats cursory inspection**, and §36 only caught the publish bug via §35.1's caller-body audit (i.e., when a real migration triggered a deep read).

### Audit goal

For each dormant action:

1. **Identify the action's invariants/contract** — what does the handler assume about input shape; what side effects does it produce; what state changes does it make.
2. **Surface "surprise factor"** — would a hypothetical first caller be surprised by any handler behavior? Compare against the §36 publish-flip-to-published pattern: hardcoded auto-behavior that conflicts with caller expectations.
3. **Document state per action** — clean / has-questions / known-needs-validation. The audit doc becomes a reference for future migration-phase planners (per §39's audit decision tree pattern).

### Audit shape — proactive vs. reactive

§39's decision tree is **reactive** — it kicks in when a new direct caller surfaces (e.g., catalog-import). Phase 40 is **proactive** — surface contract questions for dormant canonicals BEFORE a real caller forces the question.

Output format (per §40.1):

```markdown
### `<action.key>` (module: `<module>`, dormant since: `<phase or unknown>`)

**Handler:** server/<path>:<line>

**Inputs:** <typed shape>

**Side effects:** <writes / events / audit rows>

**Contract assumptions:** <list>

**Surprise factor:**
- Clean: [explanation]
- Has-questions: [specific question + recommendation]
- Known-needs-validation: [specific gotcha + recommendation]
```

Compare with §36's publish-flip-to-published — under this format, that bug would have surfaced as:

> **`aiTypes.catalog.publish` — Has-questions / Known-needs-validation**
> Handler hardcodes a flip-to-published entry status post-publish. Both possible production-shape callers (catalog-manage, sandbox-wf) want post-publish `status="active"`. Recommend: remove the auto-flip OR scope it behind an opt-in flag; canonical contract redesign needed before first production caller.

§40 produces this write-up for each of the 7 dormant actions. Future migration phases that touch any of these actions consult §40's audit instead of re-deriving it.

### Out of scope

- **Code changes.** §40 is audit-only. Any contract change identified becomes its own future phase (per §36 ADR-at-plan-freeze convention).
- **Active actions** (>=1 production caller). Their contracts are validated by their callers. Audit them only if a §40.1 review of dormant ones surfaces a pattern that suggests active actions might also have hidden surprises (unlikely).
- **Multi-module actions** (registered in non-aiTypes modules with their own gateway integration). Phase 40 focuses on the actions surfaced by the initial caller-count survey above.

---

## 3. Sub-phase decomposition

### 40.0 — Plan freeze + initial audit (this PR)

- [ ] Land `PHASE_40_EXECUTION_PLAN.md` (this doc).
- [ ] Memory: create `project_phase_40_authority.md`; `MEMORY.md` index update.
- [ ] **Acceptance:** doc lands; CI 5/5 green.

### 40.1 — Dormant canonical action audit doc

Single PR. Produces one comprehensive audit doc:

- [ ] Author `docs/architecture/ai-types/DORMANT_CANONICAL_ACTIONS_AUDIT_2026_05_08.md` (date-stamped because the audit is point-in-time):
  - List of all dormant actions identified (rigorous re-survey: build via `grep -rE 'action: "([^"]+)"'` over manifest + boot files; subtract action-key-map self-references; subtract `*.test.ts` matches; report counts)
  - Per dormant action: handler location, input shape, side effects, contract assumptions, surprise factor (clean / has-questions / known-needs-validation)
  - Summary: count of clean / questions / needs-validation; recommended actions for each "needs-validation" entry (defer to dedicated phase, or fold into a future caller's pre-flight)
- [ ] **No code changes.** Per `§38 lesson #3` (backwards-compat extensions only); per §40 plan §2 (audit-only).
- [ ] **Acceptance:** doc lands; `tsc --noEmit` clean (no code changes); CI 5/5 green.
- [ ] **Estimate:** 1 PR, 0 LOC code, ~300 LOC audit doc.

### 40.2 — Closure report

- [ ] Author `docs/evidence/provider-model-binding/PHASE_40_CLOSURE_REPORT.md`.
- [ ] Update memory: `project_phase_40_authority.md` → CLOSED; `project_pmb_phase_40_complete.md` created with PR ledger + carry-forward lessons; `MEMORY.md` index update; RAC-progress head SHA bump.
- [ ] **Acceptance:** all 3 PRs merged; CI fingerprint stable; if any "needs-validation" entries surfaced, **flag as candidate scope for a future canonical-contract-redesign phase** (per §36 pattern).
- [ ] **Estimate:** 1 PR, ~150 LOC docs.

---

## 4. Decision matrix

Cap: **zero new TEMPORARY_EXCEPTION_WITH_DEADLINE entries.**

| # | Item | Decision | Sub-phase | Risk |
|---|---|---|---|---|
| 1 | Audit-only vs audit + fixes | **Audit-only** — code changes (if any) become future phases | 40.0 | Low |
| 2 | Date-stamp the audit doc filename | **Yes** (`*_2026_05_08.md`) — audit is point-in-time; future re-audits get their own filenames | 40.1 | Low |
| 3 | Surface format per dormant action | **Clean / has-questions / known-needs-validation** | 40.1 | Low |
| 4 | Active actions in scope? | **No** — validated by production callers; revisit only if dormant-audit surfaces a pattern | 40.0 | Low |
| 5 | Multi-module action coverage | **Out of scope for §40** — audit the AI Types + Agent Studio surface; future phases can extend | 40.0 | Low |

---

## 5. Test strategy

- **40.0 (this):** docs only.
- **40.1 (audit doc):** docs only; `tsc --noEmit` clean by tautology.
- **40.2 (closure):** docs only.

**CI fingerprint:** Phase 40 baseline is **5/5 green** at `aec496a`. No matrix-shape changes.

---

## 6. Sizing

| Sub-phase | PRs | LOC code | LOC docs |
|---|---|---|---|
| 40.0 (this) | 1 | — | ~250 |
| 40.1 (audit doc) | 1 | — | ~300 |
| 40.2 (closure) | 1 | — | ~150 |
| **Total** | **3** | **0** | **~700** |

Smallest LOC change of any phase under continuous-execution. Same shape as §39 (decision/audit phase, 3 PRs, 0 code changes).

---

## 7. CI fingerprint expectation

Phase 40 baseline is **5/5 green** as of `aec496a` (post-Phase-39 close-out). No changes expected.

---

## 8. Authority and pause conditions

**Authority:** full autonomous commit/push/merge for any PR scoped inside this plan. Phase 40 is the **seventh phase under the continuous-execution standing instruction** and the **third post-finalist phase**. Picked autonomously after Phase 39 closed at `aec496a`.

**Surface of my reasoning in the kickoff:** §36 lesson #2 explicitly tagged this work; §38 + §39 carried the audit thread forward; the initial survey shows 7+ dormant actions worth proactive audit. After the §38 dead-code → round-trip pivot (lesson #1), this is the next concrete cleanup with clear value: surface contract questions BEFORE a future migration trips on them.

**Pause and surface for sign-off if:**

1. The §40.1 audit surfaces a pattern that suggests active actions may also have hidden surprises (would expand Phase 40 scope; pause-and-surface).
2. The audit identifies a "known-needs-validation" entry that's blocking some currently-running work the user knows about (would justify a fast-track fix-it phase).
3. Pre-existing red CI on a sub-phase PR not on the known-flaky-shard list.
