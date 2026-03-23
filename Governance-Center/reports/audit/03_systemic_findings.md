# audit/03_systemic_findings.md — COMPLETE

## Systemic Findings (Full Repo)

### 1. `requireGate()` Is Dead Code — The Canonical Enforcement Function Has Zero Callers

- **File**: `server/governance/requireGate.ts` L70–185
- **Evidence**: Exports `requireGate()` and `canPassGate()`. Implements freeze check (L88–143), scorecard evaluation (L146–153), gate verdict (L152–154), and audit logging (L157–174). **Zero imports in any of the 35 router files.**
- **Impact**: The governance engine's single enforcement point exists but is never wired into the mutation layer. All 184 mutations bypass it.

### 2. No Universal Governance Middleware Exists

- **Evidence**: `server/_core/trpc.ts` exports `publicProcedure`, `protectedProcedure`, `adminProcedure`. None of these inject governance checks. Governance is opt-in per-procedure — each mutation must independently import and call governance functions. 180 of 184 mutations do not.
- **Impact**: Adding governance requires modifying every router individually. A `governedProcedure` base procedure would inject enforcement globally.

### 3. Two Separate Policy Evaluation Systems That Do Not Integrate

- **System A**: `evaluateAgentCompliance()` from `server/services/policyEvaluation.ts` — used by `agents.promote` only (agents.ts L7, L557).
- **System B**: `evaluateStageReview()` from `server/governance/stage-review.ts` — used by catalog lifecycle only (catalog-manage.ts L50, L511, L624, L708).
- **System C**: `LLMPolicyEngine.evaluate()` from `server/policies/llm-policy-engine.ts` — used by `llm.validatePolicy` only (llm-providers.ts L61), informational only.
- **Evidence**: These three systems share no interface, no common verdict type, no shared enforcement function. `requireGate()` would unify them but is never called.
- **Impact**: Policy evaluation is domain-specific and non-composable. A new domain must build its own evaluation from scratch.

### 4. Freeze Enforcement Is Absent Outside Governance Router

- **Evidence**: `isFrozen()` is imported and called in exactly 1 file: `server/governance/router.ts` (L562, L568). The 34 other router files never call `isFrozen()`. The only freeze-like mechanism outside governance is `checkActiveIncidents()` in `agents-promotions.ts` (L410–414), which is a mock that always returns `[]`.
- **Impact**: A governance freeze has no effect on 180 of 184 mutations. Freezing a subject blocks only `governance.stageTransition`.

### 5. Audit Logging Is Fragmented Across 5 Incompatible Patterns

| Pattern | Sink | Reliability | Files |
|---------|------|-------------|-------|
| `audit()` helper | `createCatalogAuditEvent()` fire-and-forget `.catch()` | Swallows errors | `catalog-manage.ts` |
| `agentHistory` table | Direct DB insert | Reliable but domain-specific | `agents-promotions.ts` |
| `getAuditLogger().log()` | Audit logger service | Structured, no `.catch()` | `providers/router.ts`, `secrets-router.ts` |
| `llmCreationAuditEvents` table | Direct DB insert (some `.catch()`) | Partially reliable | `llm-creation.ts` |
| `logRotationAction()` | Unknown (service layer) | Unknown | `keyRotation.ts` |
| **None** | — | — | **25 router files (156 mutations)** |

- **Impact**: No unified audit sink. Cross-domain forensic queries are impossible without joining 5+ tables with different schemas.

### 6. Principal Attribution Is Structurally Broken in Multiple Domains

| Pattern | Count | Files |
|---------|-------|-------|
| `actor: 1` or `createdBy: 1` hardcoded | 10 mutations | `catalog-manage.ts` |
| `ctx.user?.id ?? 1` fallback to synthetic ID | 5 mutations | `provider-connections/router.ts` |
| `ctx.user?.id ?? 0` | 1 mutation | `catalog-manage.ts` L135 |
| No principal recorded at all | ~114 mutations | 25 files |

- **Evidence**: `ctx.user.id` is available in every `protectedProcedure` context but is explicitly ignored or hardcoded in 16 mutations and completely absent in 114.
- **Impact**: 70% of mutations cannot be attributed to the actor who performed them.

### 7. `protectedProcedure` Is the Only Auth Gate for High-Risk Operations

- **Evidence**: Of 184 mutations, 169 use `protectedProcedure` (any logged-in user), 14 use `adminProcedure`, 1 uses `publicProcedure`.
- **High-risk operations using only `protectedProcedure`**: PAT rotation (#19, provider-connections/router.ts L121–134), certificate creation (#31, keyRotation.ts), secret lifecycle (#160–162, secrets-router.ts), workflow execution (#158, automation-router.ts), deployment triggers (#44, deploy.ts), model loading into memory (#163, inference-router.ts).
- **Impact**: Any authenticated user can perform every mutation except 14 admin-only operations. No RBAC beyond "is authenticated" exists for 92% of the API surface.

### 8. Mock/Simulated Data in Production Paths

| Mock | File | Line | Impact |
|------|------|------|--------|
| `Math.random() > 0.2` for compliance status | `agents.ts` | L407 | `exportCompliance` produces random verdicts |
| Hardcoded `temperature: "0.7"` remediation | `agents.ts` | L450 | `autoRemediate` ignores actual policy |
| `checkActiveIncidents()` returns `[]` | `agents-promotions.ts` | L410–414 | Freeze check is non-functional |
| `setTimeout` simulated download | `routers.ts` | L293–303 | `models.startDownload` fakes progress |
| `parseFile` stub (not implemented) | `catalog-import/router.ts` | L113 | Mutation exists but does nothing |
| Promotion logic placeholder | `agents-promotions.ts` | L354–355 | `execute` has no implementation |

### 9. Soft-Delete Without Governance Creates Hidden State

- **Evidence**: `agents.delete` (agents.ts L177–181) sets `status: "archived"`. `llm.archive` (llm.ts L185) sets `status: "archived"`. Both execute with no governance gate, no audit event, no actor attribution.
- **Filter**: Archived agents are excluded from queries via `ne(agents.status, "archived")` (agents.ts L23, L198).
- **Impact**: Any workspace member can silently remove agents/LLMs from active views with no trail.

### 10. API Keys Stored in Catalog Config Without Governance

- **File**: `server/catalog-import/router.ts` L69–73
- **Evidence**: `discoverFromApi` stores the provider's API key directly into the catalog entry's `config` field. No encryption, no governance gate, no audit of who stored it.
- **Impact**: API credentials may be exposed in catalog entries returned by read queries.

### 11. Trigger/Action Admin Operations Missing `adminProcedure`

- **Files**: `triggers.ts` L370 (`approve`), L385 (`reject`), L403 (`delete`); `actions.ts` L269 (`create`)
- **Evidence**: Comments say "admin only" but procedures use `protectedProcedure`. `actions.create` uses inline check `ctx.user.role !== "admin"` (L271) instead of `adminProcedure`.
- **Impact**: Inconsistent auth model. Some admin checks are at the middleware level, others are inline and bypassable if the role field is spoofed or missing.

### 12. Cascade Deletion Without Access Checks

- **File**: `server/documents/documents-crud-router.ts` L119
- **Evidence**: `bulkDelete` takes an array of document IDs and deletes them without workspace access checks. Compare: single `delete` (L85) checks `hasWorkspaceAccess()`.
- **Impact**: Any authenticated user can bulk-delete documents they don't own.

### 13. Governance Engine's Own Mutations Are Partially Ungoverned

- **File**: `server/governance/router.ts`
- **Evidence**: `driftToggle` (L640) starts/stops drift detection with no audit of who toggled it. `unfreezeSubject` (L666) unfreezes governance subjects with no audit trail. Only `stageTransition` (L539) has full governance.
- **Impact**: The governance system itself has 2 of 3 mutations that bypass governance.
