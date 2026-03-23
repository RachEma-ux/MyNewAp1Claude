# GOVERNANCE AUDIT — FINAL REPORT

## Executive Summary

This audit inventoried **184 mutation entrypoints** across **35 router files** in the MyNewAppV1 tRPC API surface. The governance engine (`server/governance/`) is architecturally complete — it includes scorecard evaluation, lifecycle guards, stage review checklists, drift detection, freeze enforcement, RBAC, risk classification, publication gates, and an evidence vault. However, the engine is almost entirely disconnected from the mutation layer.

**Key Metric: 2.2% governance coverage (4 of 184 mutations are fully governed).**

The canonical enforcement function `requireGate()` — designed as the single mandatory gate for all lifecycle transitions — is **never called by any router**. It is dead code. The 4 PASS mutations achieve governance through ad-hoc inline calls to `evaluateStageReview()`, not through the unified enforcement path.

---

## Quantitative Findings

### Overall Coverage

| Verdict | Count | % |
|---------|-------|---|
| PASS | 4 | 2.2% |
| PARTIAL | 34 | 18.5% |
| FAIL | 146 | 79.3% |
| **Total** | **184** | |

### By Auth Level

| Auth Level | Mutations | PASS | Coverage |
|-----------|-----------|------|----------|
| publicProcedure | 1 | 0 | 0% |
| protectedProcedure | 169 | 1 | 0.6% |
| adminProcedure | 14 | 3 | 21.4% |

### By Governance Dimension

| Dimension | Present | Coverage |
|-----------|---------|----------|
| `requireGate()` called | 0 / 184 | 0% |
| Any policy evaluation | 5 / 184 | 2.7% |
| Freeze check (`isFrozen()`) | 1 / 184 | 0.5% |
| Audit logging (any form) | 28 / 184 | 15.2% |
| Principal attribution | ~70 / 184 | 38.0% |
| Fail-closed enforcement | 4 / 184 | 2.2% |

### Governance Function Utilization

| Function | Available Since | Times Called in Routers |
|----------|----------------|----------------------|
| `requireGate()` | Phase 3/5 | **0** |
| `evaluateStageReview()` | Phase 6 | 5 (4 enforce, 1 informational) |
| `evaluateAgentCompliance()` | Phase 1 | 1 (not fail-closed) |
| `isFrozen()` | Phase 7 | 2 (both in governance router) |
| `getAuditLogger().log()` | Phase 1 | 6 (2 files) |

---

## Architectural Diagnosis

### Root Cause: Opt-In Governance Architecture

The fundamental problem is not missing governance logic — the engine is comprehensive. The problem is **the enforcement model is opt-in rather than structural**.

```
CURRENT ARCHITECTURE:
  protectedProcedure → (no governance middleware) → mutation handler
  Each handler must independently:
    1. Import governance functions
    2. Call them manually
    3. Handle the response correctly
  Result: 180 of 184 handlers skip all 3 steps.

REQUIRED ARCHITECTURE:
  governedProcedure → requireGate() middleware → mutation handler
  Enforcement is injected automatically.
  No handler can bypass governance.
  Result: 100% coverage by construction.
```

### Why `requireGate()` Was Never Connected

`requireGate()` (server/governance/requireGate.ts) was designed as the single enforcement point. It checks freeze status, runs the scorecard, evaluates the gate, and logs the audit event. But it was never wired into a tRPC middleware or base procedure. The 3 catalog PASS entrypoints were implemented before `requireGate()` existed and use direct `evaluateStageReview()` calls. When `requireGate()` was built, it was not backfitted to existing code and no new mutations adopted it.

### Three Separate Policy Systems

| System | Location | Used By | Verdict Type |
|--------|----------|---------|-------------|
| Stage Review | `governance/stage-review.ts` | Catalog lifecycle (3 mutations) | `{allowed, reason, checks}` |
| Agent Compliance | `services/policyEvaluation.ts` | Agent promote (1 mutation) | `{compliant, violations, score}` |
| LLM Policy Engine | `policies/llm-policy-engine.ts` | LLM validatePolicy (1 mutation) | `{decision, rule_id, reason}` |

These share no common interface. `requireGate()` integrates with the scorecard system but not with agent compliance or LLM policy evaluation.

### Five Audit Logging Patterns

1. `audit()` fire-and-forget helper with `.catch()` — catalog-manage.ts
2. Direct `agentHistory` table insert — agents-promotions.ts
3. `getAuditLogger().log()` structured logger — providers/router.ts, secrets-router.ts
4. `llmCreationAuditEvents` table insert — llm-creation.ts
5. `logRotationAction()` service call — keyRotation.ts

No unified audit sink. 156 of 184 mutations have zero audit logging.

---

## Top 5 Critical Risks

1. **`requireGate()` is dead code** — The canonical enforcement function exists but has zero callers. All 184 mutations bypass it.

2. **Provider Connection lifecycle has zero governance** — All 8 mutations (test, create, validateAndStore, activate, disable, healthCheck, rotate, delete) have no policy evaluation, no freeze check, no governance gate. PAT rotation creates live external connections with no review.

3. **Key Rotation has zero governance** — All 13 mutations (certificates, attestation keys, rotation policies) use `protectedProcedure`. Any authenticated user can create/revoke certificates.

4. **Cascade deletion without access check** — `documentsCrud.bulkDelete` accepts an array of document IDs and deletes without workspace access verification.

5. **API keys stored in catalog config without encryption** — `catalogImport.discoverFromApi` stores provider API keys directly in the catalog entry's config field.

---

## Recommendations

### 1. Wire `requireGate()` via `governedProcedure` (Priority: CRITICAL)

Create a new base procedure:
```typescript
export const governedProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  // requireGate() is called automatically for all governed mutations
  // Subject and stage are derived from the procedure input
  return next({ ctx });
});
```

### 2. Replace `protectedProcedure` with `governedProcedure` for high-risk domains (Priority: CRITICAL)

Target domains in order: Provider Connections, Key Rotation, Automation, Agents, Policies.

### 3. Fix hardcoded actor ID `1` in catalog-manage.ts (Priority: HIGH)

Replace `actor: 1` with `actor: ctx.user.id` in the `audit()` helper and all `createCatalogEntry`/`updateCatalogEntry` calls.

### 4. Unify audit logging into `getAuditLogger()` (Priority: HIGH)

Migrate all 5 audit patterns to `getAuditLogger().log()`. Remove fire-and-forget `.catch()` swallowing. Ensure every mutation that writes to DB also writes an audit event.

### 5. Add `isFrozen()` check to `governedProcedure` middleware (Priority: HIGH)

Freeze enforcement must be injected at the middleware level, not per-procedure.

### 6. Convert `agents.promote` to fail-closed (Priority: MEDIUM)

Change `return {success:false}` to `throw new TRPCError({code:"CONFLICT"})`.

### 7. Add `adminProcedure` to trigger/action approve/reject operations (Priority: MEDIUM)

Replace `protectedProcedure` + inline role check with `adminProcedure`.

### 8. Remove mock implementations from production paths (Priority: MEDIUM)

Replace `Math.random()`, hardcoded remediation strategies, and stub functions with real implementations or explicit "not implemented" errors.

---

## Audit Artifacts

| File | Description |
|------|-------------|
| `audit/01_mutation_entrypoints.md` | Complete 184-row mutation inventory with evidence columns |
| `audit/02_gate_coverage_report.md` | Coverage summary, domain breakdowns, auth-level analysis, top 10 bypass risks |
| `audit/03_systemic_findings.md` | 13 systemic findings with file+line evidence |
| `audit/04_governance_engine_usage.md` | Governance function call map, heat map, usage statistics |
| `audit/05_freeze_drift_enforcement.md` | Freeze and drift detection coverage analysis |
| `audit/06_risk_matrix.md` | Risk ranking: 5 Critical, 5 High, 5 Medium with evidence |
| `audit/FINAL_REPORT.md` | This file |

---

## Methodology

1. Read every `.ts` file referenced in `server/routers.ts` appRouter composition (L44–79).
2. For each file, identified every `.mutation()` call.
3. For each mutation, checked: `requireGate()` import, `evaluateStageReview()` import, `evaluateAgentCompliance()` import, `isFrozen()` import, audit logging presence, `ctx.user.id` usage, error handling (throw vs return).
4. Classified each mutation as PASS (fail-closed governance + audit + principal), PARTIAL (some governance elements), or FAIL (no governance).
5. Cross-referenced governance engine source files to map function usage.
6. Identified systemic patterns across the full codebase.

**Audit date: 2026-02-23**
**Auditor: Claude Code (Opus 4.6)**
**Scope: Full tRPC mutation surface — 35 router files, 184 mutations**
