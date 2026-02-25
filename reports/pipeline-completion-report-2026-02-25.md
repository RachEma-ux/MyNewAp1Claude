# Import Catalog Pipeline — Completion Report

**Date**: 2026-02-25
**Checkpoint**: `checkpoint-2026-02-25-pipeline-complete` (commit `345c1e8`)
**Previous Checkpoint**: `checkpoint-2026-02-24-audit-100` (commit `c5a90c9`)

---

## Executive Summary

The full Import Catalog → Candidate Registration pipeline is now working end-to-end. Users can discover providers via URL, submit them as candidates, and advance them through a governed 4-stage lifecycle (Register → Validate → Publish) — all without requiring API keys or PATs.

---

## Pipeline Overview

```
Import Catalog Wizard ──► Submit ──► Register ──► Validate ──► Publish
      (discovery)        (draft)   (6 checks)  (12 checks)  (6 checks)
```

Each stage follows the same governed pattern:
1. **Review** — click the Review badge to see the governance checklist
2. **Approve** — click Approve once all checklist items pass (sets `stageReviews[stage] = "approved"`)
3. **Transition** — click the stage button (Register/Validate/Publish) to advance the entry

---

## What Was Built & Fixed

### Phase 1: Discovery & Submission (commits 37caacf → 7b78ce2)

| Issue | Fix |
|-------|-----|
| Discovery prompted for PAT/API key | Removed PAT requirement — discovery uses public metadata only |
| Submit button didn't send to Candidate page | Fixed navigation to `/llm/catalogue/candidate` Register tab |
| Governance evidence missing on submit | Added `_evidence` to `catalogManage.submitFromDiscovery` call |
| Discovery returned non-provider results | Filtered to `entryType: "provider"` only |

### Phase 2: Governance Evidence (commit 18a7da3)

All governed mutations in CandidatePage were missing `_evidence` in their tRPC calls, causing the governance middleware (`requireGovernedAction`) to reject with "Evidence requirement not met".

**Fixed mutations:**
- `catalog.approve` — R4 action, evidence: `[reason]`
- `governance.stageTransition` — R4 action, evidence: `[reason]`
- `catalog.delete` — R3 action, evidence: `[reason]`
- `catalog.create` — R3 action, evidence: `[reason]`
- `catalog.validate` — R3 action, evidence: `[probe_results]`
- `catalog.publish` — R5 action, evidence: `[reason, diff, tests_passed, signed_commit]`
- `catalog.recall` — R5 action, evidence: `[reason]`

### Phase 3: Batch Discovery (commit 3144f8a)

| Issue | Fix |
|-------|-----|
| Batch popup closed after first submission | Removed `onOpenChange(false)` from `registerOne()` |
| Close button didn't navigate when entries submitted | Added conditional navigation on Close |

### Phase 4: Approve vs Transition Separation (commits f871f52 → a184c27)

| Issue | Fix |
|-------|-----|
| Approve auto-registered entries (added lifecycle tags) | Stripped tag propagation from approve handler — approve only sets `stageReviews[stage] = "approved"` |
| Register button opened review dialog instead of transitioning | Changed `openReviewDialog()` → `governedTransition()` |
| Register button active before review approved | Added `disabled` state until `getStageReviewState(entry, "register") === "approved"` |

### Phase 5: Validate & Publish Pipeline (commits 7940787 → 26c0359)

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Validate button opened review dialog | Called `openReviewDialog()` | Changed to `governedTransition()` |
| Publish button opened review dialog | Called `openReviewDialog()` | Changed to `governedTransition()` |
| PUB-05 always failed ("Missing approval: register, validate") | Checked `tags.includes("registered")` but tags get replaced per stage | Now checks `stageReviews.register === "approved"` |
| validate→publish blocked by lifecycle guard | Unused "approve" stage between validate and publish | Removed "approve" from `LIFECYCLE_STAGES` |
| PUB-05 showed failure but approve succeeded (contradiction) | `stageReview` query didn't pass `stageReviews` to evaluator | Added `stageReviews` to entry object in both query and mutation handlers |

---

## Governance Checks Per Stage

### Register (6 checks — all must pass)
| ID | Check | Category |
|----|-------|----------|
| REG-01 | Classification assigned | compliance_matrix |
| REG-02 | No architecture bypass | yaml_spec |
| REG-03 | RBAC mapping defined | admin_checklist |
| REG-04 | Documentation provided | compliance_matrix |
| REG-05 | API surface declared | admin_checklist |
| REG-06 | No direct provider calls | yaml_spec |

### Validate (12 checks — all must pass)
| ID | Check | Category |
|----|-------|----------|
| VAL-01 | OPA policy referenced | compliance_matrix |
| VAL-02 | Policy compiles cleanly | compliance_matrix |
| VAL-03 | Deny-default enforced | yaml_spec |
| VAL-04 | Governance hooks active | yaml_spec |
| VAL-05 | Secrets externalized | yaml_spec |
| VAL-06 | Secret rotation possible | admin_checklist |
| VAL-07 | Workflow permissions scoped | admin_checklist |
| VAL-08 | Execution is audited | compliance_matrix |
| VAL-09 | No dynamic eval patterns | yaml_spec |
| VAL-10 | No privilege mutation | yaml_spec |
| VAL-11 | Audit trail complete | compliance_matrix |
| VAL-12 | Deploy config verified | admin_checklist |

### Publish (6 checks — all must pass)
| ID | Check | Category |
|----|-------|----------|
| PUB-01 | Cross-doc consistency | compliance_matrix |
| PUB-02 | Lifecycle logs complete | compliance_matrix |
| PUB-03 | CI protections active | yaml_spec |
| PUB-04 | Branch protection active | yaml_spec |
| PUB-05 | Review approved (register + validate) | admin_checklist |
| PUB-06 | No Critical/High findings | compliance_matrix |

---

## Lifecycle Stages

```
ingest → submit → register → validate → publish → catalog → mutate
```

- Tags represent **current** stage: `candidate`, `registered`, `validated`, `published`
- `stageReviews` persist **approval state** per stage: `{ register: "approved", validate: "approved", publish: "approved" }`
- Lifecycle guard enforces sequential transitions only (no skipping, no backwards)
- Publication gate runs additional triple validation (compliance matrix + YAML spec + admin checklist + risk report)

---

## Files Modified

### Client
| File | Changes |
|------|---------|
| `client/src/pages/CandidatePage.tsx` | Added `_evidence` to all governed mutations; Register/Validate/Publish buttons call `governedTransition()`; disabled until review approved; pipeline documentation comments |
| `client/src/components/CatalogImportWizard.tsx` | Batch popup stays open; no PAT prompt; pipeline documentation comments |

### Server
| File | Changes |
|------|---------|
| `server/routers/catalog-manage.ts` | Approve handler only sets `stageReviews[stage]`, no auto-registration |
| `server/governance/router.ts` | Added `stageReviews` to entry objects in `stageReview` query and `stageTransition` mutation |
| `server/governance/stage-review.ts` | PUB-05 checks `stageReviews` instead of tags |
| `server/governance/lifecycle-guard.ts` | Removed unused "approve" lifecycle stage |

---

## Commits (15 total)

```
345c1e8 docs: session summary 2026-02-25 — fix full pipeline (validate + publish)
26c0359 fix: pass stageReviews to stageReview query so PUB-05 evaluates correctly
3ea8195 fix: remove approve stage from lifecycle and pass stageReviews to transition
6cd0d84 fix: PUB-05 checks stageReviews instead of tags for prior stage approval
7940787 fix: Validate and Publish buttons trigger stage transition instead of review dialog
a184c27 fix: Register button triggers stage transition instead of review dialog
f871f52 fix: approve only marks review as done, no auto-registration
49c1988 docs: add batch discovery behavior to pipeline comments
3144f8a fix: batch discovery popup stays open until user closes it
08b8248 docs: add Import Catalog pipeline description to wizard and discovery tab
18a7da3 fix: add governance evidence to all governed mutations in CandidatePage
7b78ce2 fix: discovery only finds provider, Submit button sends to Candidate
f1e0f6e fix: always navigate to Candidate Register tab after import submit
7c7d7a9 fix: pass governance evidence in catalog import discovery submissions
37caacf fix: auto-submit discovered providers to Candidate page without PAT prompt
```

---

## Test Results (API Verification on Live Deploy)

| Stage | Approve | Transition | Score | Checks |
|-------|---------|------------|-------|--------|
| Register | OK | allowed=true | 100% | 6/6 |
| Validate | OK | allowed=true | 100% | 12/12 |
| Publish | OK | allowed=true | 100% | 6/6 |

**PUB-05 consistency verified:**
- Before register/validate approvals: `passed=false`, "Missing approval: register, validate"
- After register/validate approvals: `passed=true`, "All prior stages approved"
- No contradiction between review display and approve gate

---

## How to Test

1. Navigate to **LLM → Catalogue → Import Catalog**
2. Enter a provider URL (e.g., `ai21.com`) → click Discover
3. Submit the discovered provider (single or batch)
4. Go to **Candidate** page → **Register** tab
5. Click **Review** badge → verify 6 checks → click **Approve**
6. Click **Register** button → entry advances to Validate tab
7. Switch to **Validate** tab → click **Review** → verify 12 checks → **Approve**
8. Click **Validate** button → entry advances to Publish tab
9. Switch to **Publish** tab → click **Review** → verify 6 checks (PUB-05 should be green) → **Approve**
10. Click **Publish** button → entry tagged as `published`
