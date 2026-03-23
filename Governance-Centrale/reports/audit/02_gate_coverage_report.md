# audit/02_gate_coverage_report.md — COMPLETE

## Coverage Summary

| Verdict | Count | % |
|---------|-------|---|
| **PASS** | 4 | 2.2% |
| **PARTIAL** | 34 | 18.5% |
| **FAIL** | 146 | 79.3% |
| **Total** | 184 | 100% |

**Checksum: 4 + 34 + 146 = 184 ✓**

**Governance Coverage = PASS / Total = 4 / 184 = 2.2%**

---

## PASS Entrypoints (4)

| # | Entrypoint | File | Gate Function |
|---|-----------|------|---------------|
| 26 | `catalogManage.approve` | `server/routers/catalog-manage.ts` L487 | `evaluateStageReview()` + throw CONFLICT |
| 28 | `catalogManage.activate` | `server/routers/catalog-manage.ts` L611 | `evaluateStageReview()` + throw CONFLICT |
| 29 | `catalogManage.publish` | `server/routers/catalog-manage.ts` L678 | `evaluateStageReview()` + throw CONFLICT + SHA256 |
| 173 | `governance.stageTransition` | `server/governance/router.ts` L539 | `isFrozen()` + `executeStageTransition()` + throw CONFLICT |

All 4 PASS entrypoints are in catalog lifecycle or governance engine. Zero PASS outside these 2 files.

---

## Domain Breakdown

| Domain | File | Mutations | PASS | PARTIAL | FAIL | Coverage |
|--------|------|-----------|------|---------|------|----------|
| Agents | agents.ts | 8 | 0 | 1 | 7 | 0% |
| Agent Promotions | agents-promotions.ts | 4 | 0 | 2 | 2 | 0% |
| Provider Connections | provider-connections/router.ts | 8 | 0 | 0 | 8 | 0% |
| Catalog Management | catalog-manage.ts | 10 | 3 | 7 | 0 | 30% |
| Key Rotation | keyRotation.ts | 13 | 0 | 4 | 9 | 0% |
| Deployments | deploy.ts | 3 | 0 | 0 | 3 | 0% |
| Discovery Ops | discovery-ops.ts | 5 | 0 | 4 | 1 | 0% |
| Catalog Import | catalog-import/router.ts | 3 | 0 | 1 | 2 | 0% |
| Policies | policies.ts | 5 | 0 | 0 | 5 | 0% |
| Triggers | triggers.ts | 4 | 0 | 0 | 4 | 0% |
| Actions | actions.ts | 4 | 0 | 0 | 4 | 0% |
| Protocols | protocols.ts | 4 | 0 | 0 | 4 | 0% |
| LLM Control Plane | llm.ts | 9 | 0 | 2 | 7 | 0% |
| LLM Creation | llm-creation.ts | 12 | 0 | 6 | 6 | 0% |
| LLM Providers | llm-providers.ts | 6 | 0 | 1 | 5 | 0% |
| Conversations | conversations.ts | 3 | 0 | 0 | 3 | 0% |
| WCP Workflows | wcpWorkflows.ts | 3 | 0 | 0 | 3 | 0% |
| Wiki | wiki.ts | 6 | 0 | 0 | 6 | 0% |
| Templates | templates.ts | 4 | 0 | 0 | 4 | 0% |
| Providers Hub | providers/router.ts | 10 | 0 | 3 | 7 | 0% |
| Chat | chat/router.ts | 6 | 0 | 0 | 6 | 0% |
| Model Downloads | download-router.ts | 9 | 0 | 0 | 9 | 0% |
| Model Benchmarks | benchmark-router.ts | 1 | 0 | 0 | 1 | 0% |
| Model Versions | version-router.ts | 5 | 0 | 0 | 5 | 0% |
| Documents RAG | documents-router.ts | 2 | 0 | 0 | 2 | 0% |
| Documents CRUD | documents-crud-router.ts | 5 | 0 | 0 | 5 | 0% |
| Automation | automation-router.ts | 7 | 0 | 0 | 7 | 0% |
| Secrets | secrets-router.ts | 3 | 0 | 3 | 0 | 0% |
| Inference | inference-router.ts | 3 | 0 | 0 | 3 | 0% |
| Embeddings | embeddings-router.ts | 2 | 0 | 0 | 2 | 0% |
| Vector DB | vectordb-router.ts | 3 | 0 | 0 | 3 | 0% |
| Hardware | hardware-router.ts | 1 | 0 | 0 | 1 | 0% |
| System | systemRouter.ts | 1 | 0 | 0 | 1 | 0% |
| Governance Engine | governance/router.ts | 3 | 1 | 0 | 2 | 33% |
| Inline (routers.ts) | routers.ts | 9 | 0 | 0 | 9 | 0% |
| **TOTAL** | | **184** | **4** | **34** | **146** | **2.2%** |

---

## Auth-Level Breakdown

| Auth Level | Count | PASS | PARTIAL | FAIL | Coverage |
|-----------|-------|------|---------|------|----------|
| `publicProcedure` | 1 | 0 | 0 | 1 | 0% |
| `protectedProcedure` | 169 | 1 | 27 | 141 | 0.6% |
| `adminProcedure` | 14 | 3 | 7 | 4 | 21.4% |
| **Total** | **184** | **4** | **34** | **146** | **2.2%** |

**Note:** `adminProcedure` has 21.4% PASS rate vs 0.6% for `protectedProcedure`. The 3 admin PASS entries are all catalog lifecycle. 141 of 169 `protectedProcedure` mutations have zero governance.

---

## Governance Function Call Counts

| Function | Import Location | Times Called in Routers | Files |
|----------|----------------|----------------------|-------|
| `evaluateStageReview()` | `server/governance/stage-review` | 3 | `catalog-manage.ts` (L511, L624, L708) |
| `executeStageTransition()` | `server/governance/stage-review` | 1 | `governance/router.ts` (L575) |
| `evaluateAgentCompliance()` | `server/services/policyEvaluation` | 1 | `agents.ts` (L557) |
| `isFrozen()` | `server/governance/scorecard` | 2 | `governance/router.ts` (L562, L568) |
| `requireGate()` | `server/governance/requireGate` | **0** | **NEVER CALLED** |
| `policyGate` | — | **0** | **NEVER CALLED** |
| `LLMPolicyEngine.evaluate()` | `server/policies/llm-policy-engine` | 1 | `llm-providers.ts` (L61) — informational only |
| `getAuditLogger().log()` | `server/services/auditLogger` | 6 | `providers/router.ts` (3×), `secrets-router.ts` (3×) |

**Total governance function calls across 184 mutations: 14**
**`requireGate()` — the canonical enforcement function — is never called by any router.**

---

## Audit Logging Coverage

| Audit Pattern | Files Using It | Mutations Covered |
|--------------|----------------|-------------------|
| `audit()` helper (fire-and-forget, `actor: 1` hardcoded) | `catalog-manage.ts` | 10 of 10 |
| `agentHistory` table direct write | `agents-promotions.ts` | 2 of 4 |
| `getAuditLogger().log()` | `providers/router.ts`, `secrets-router.ts` | 6 of 13 |
| `llmCreationAuditEvents` table | `llm-creation.ts` | 6 of 12 |
| `logRotationAction()` | `keyRotation.ts` | 4 of 13 |
| `appendAuditLog` (service layer) | `provider-connections/service.ts` | 0 at router level |
| **None** | 25 other files | **156 of 184** |

**84.8% of mutations (156/184) have zero audit logging at the router layer.**

---

## Principal Attribution Coverage

| Pattern | Count | Issues |
|---------|-------|--------|
| `ctx.user.id` correctly passed | ~55 | Principal stored but no governance |
| `actor: 1` or `createdBy: 1` hardcoded | 10 | All in `catalog-manage.ts` — real actor not recorded |
| `ctx.user?.id ?? 1` fallback | 5 | `provider-connections/router.ts` — falls back to synthetic ID |
| No principal at all | ~114 | 62% of mutations record no actor |

---

## Top 10 Bypass Risks

### 1. CRITICAL — `requireGate()` Is Never Called (184/184 mutations)
- **File**: `server/governance/requireGate.ts`
- **Evidence**: The function exists (L70–185) with freeze check, scorecard evaluation, and audit logging. Zero imports in any router file. The canonical enforcement function is dead code.
- **Impact**: The entire governance engine is structurally present but has no enforcement path outside the governance router itself.

### 2. CRITICAL — Provider Connection Lifecycle Has Zero Governance (8 mutations)
- **File**: `server/provider-connections/router.ts` L38–208
- **Affected**: #13–#20
- **Risk**: PAT rotation (L121–134), activation (L92–97), and secret deletion (L203–208) — all high-risk operations with no governance gate, no RBAC beyond `protectedProcedure`.

### 3. CRITICAL — Key Rotation Has Zero Governance (13 mutations)
- **File**: `server/routers/keyRotation.ts`
- **Affected**: #31–#43
- **Risk**: Certificate creation, activation, revocation, and PAT rotation policies — all use `protectedProcedure`. Any authenticated user can create/revoke certificates and manage rotation policies.

### 4. CRITICAL — Agent Promotion Freeze Check Is a No-Op Mock
- **File**: `server/routers/agents-promotions.ts` L410–414
- **Evidence**: `checkActiveIncidents()` always returns `[]`. Freeze is structurally present but functionally dead.

### 5. HIGH — Agent Promote Returns 200 on Failure (UI-Enforce-Only)
- **File**: `server/routers/agents.ts` L569–577
- **Evidence**: Returns `{success:false}` instead of throwing `TRPCError({code:"CONFLICT"})`. Non-browser callers can misinterpret as success.

### 6. HIGH — Hardcoded Actor ID `1` Across Catalog (10 mutations)
- **File**: `server/routers/catalog-manage.ts` L36–44
- **Evidence**: `audit()` helper uses `actor: 1`. Direct calls use `createdBy: 1` (L212), `updateCatalogEntry(id, data, 1)` (L238, L281, L316, L336, L445, L463, L599).
- **Impact**: Forensic traceability is broken for 10 catalog mutations.

### 7. HIGH — Automation Workflow Execution Has No Governance Gate (7 mutations)
- **File**: `server/automation/automation-router.ts`
- **Affected**: #153–#159
- **Risk**: `executeWorkflow` (L199) runs arbitrary workflow logic with no governance check. `publishWorkflow` (L153) creates immutable snapshots with no review gate.

### 8. HIGH — Policy CRUD Is Self-Referentially Ungoverned (5 mutations)
- **File**: `server/routers/policies.ts`
- **Affected**: #55–#59
- **Risk**: Policy creation, update, deletion, and activation have no governance gate. Policies that govern other entities are themselves ungoverned.

### 9. HIGH — Mock/Simulated Data in Production Paths
- **Files**: `agents.ts` L407 (`Math.random() > 0.2`), L450 (hardcoded `temperature: "0.7"`), `routers.ts` L293–303 (simulated download with `setTimeout`)
- **Risk**: Features presented as real but producing meaningless output.

### 10. MEDIUM — Triggers/Actions Use `protectedProcedure` for Admin Operations
- **Files**: `triggers.ts` L370–403, `actions.ts` L269 (inline `ctx.user.role !== "admin"` check)
- **Risk**: `approve`/`reject` operations comment "admin only" but use `protectedProcedure`. `actions.create` uses inline role check instead of `adminProcedure` — inconsistent auth model.
