# Plan v3 PMB — Validation Outputs

**Captured:** 2026-05-04 against main@8517385 (post-Phase 45).

The four validation pipelines required by `EXECUTION_CHECKLIST.md`'s
"Validation pass before each commit" rule. All green at the
post-Stage-11-docs cut.

---

## `npm run check` (TypeScript)

```
> mynewap1claude@1.0.0 check
> tsc --noEmit
```

**Result:** clean. No type errors.

---

## `npm run check:architecture`

```
=== check:modules ===
OK — modules check passed.
=== check:boundaries ===
OK — boundary check passed (0 warning(s)).
=== check:sql-boundaries ===
OK — cross-module SQL/connection check passed.
=== check:db-ownership ===
OK — DB ownership check passed.
=== check:coordinator-boundaries ===
OK — coordinator boundary check passed.
=== check:provider-credential-resolver-boundary ===
OK — provider-credential-resolver boundary check passed (D2).
=== check:provider-key-env-boundary ===
OK — provider-key-env boundary check passed (D1).
=== check:governance-actions ===
OK — governance-actions: 81 declared, 81 covered, 0 uncovered (warning).
=== check:ai-types-public-api-boundary ===
Failures: 0
Baseline warnings: 27
OK — no new AI Types public-API boundary violations beyond the baseline.
=== check:db-roles ===
[skip] check:db-roles — DATABASE_URL is not set. Local dev sandboxes are allowed.
OK — all architecture checks passed.
[markdown-imports] PASS — no direct streamdown or Shiki imports outside SlimShikiHighlighter (1954 files scanned).
```

**Coverage:** 81/81 governance actions covered. Plan v3 added 25 of
those 81 (Phases 7, 12, 25, 27–31, 36, 41 + receipt-required
descriptors per the action-key-map).

---

## `npm run check:wiring`

```
=== check:wiring (module level) ===
OK — module wiring within tolerance.
=== check:gateway-wiring ===
0 finding(s):
OK — gateway wiring within tolerance.
=== check:event-wiring ===
0 finding(s):
OK — event wiring within tolerance.
=== check:handoff-wiring ===
0 finding(s):
OK — handoff wiring within tolerance.
=== check:frontend-wiring ===
0 finding(s):
OK — frontend wiring within tolerance.
=== check:runtime-wiring ===
Modules tracked: 16 (KNOWN_MODULES=16).
0 finding(s):
OK — runtime wiring within tolerance.
=== check:coordinator-wiring ===
0 finding(s):
OK — coordinator wiring within tolerance.
```

All seven wiring checks return zero findings.

---

## `npm run check:frontend-modularity`

```
Failures: 0
Baseline warnings: 0
OK — no migrated-module link violations.
```

Strict-mode active for `communication`, `dataAnalysis`, `pmCentral`.
Other RTLMs in report-only mode pending their own migration PRs.
Zero baseline warnings.

---

## What this evidence demonstrates

- Every Plan v3 phase's per-PR validation pass holds at main@8517385.
- The 81/81 governance-actions count proves every declared action is
  in the action-key-map. Plan v3 added the four PMB modules' actions
  (Provider Connections public reads, AI Types catalog/import,
  Agent Studio bindings + export catalog, OpenRouter Model Access)
  without any uncovered drift.
- The 27 baseline warnings on `check:ai-types-public-api-boundary`
  are pre-existing legacy callers tracked in
  `scripts/baseline/ai-types-public-api-boundary.txt` (Phase 26
  baseline-allow lint). No new violations introduced by Plan v3.
