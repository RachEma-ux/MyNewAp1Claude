# audit/02_gate_coverage_report.md (partial — 4-file subset)

## Coverage Summary

| Verdict | Count | Entrypoints |
|---------|-------|-------------|
| **PASS** | 3 | `catalogManage.approve` (#26), `catalogManage.activate` (#28), `catalogManage.publish` (#29) |
| **PARTIAL** | 10 | `agents.promote` (#8), `agentPromotions.approve` (#10), `agentPromotions.reject` (#11), `catalogManage.create` (#21), `catalogManage.update` (#22), `catalogManage.delete` (#23), `catalogManage.discoverProvider` (#24), `catalogManage.validate` (#25), `catalogManage.reject` (#27), `catalogManage.recall` (#30) |
| **FAIL** | 17 | `agents.create` (#1), `agents.update` (#2), `agents.delete` (#3), `agents.runDriftDetection` (#4), `agents.exportCompliance` (#5), `agents.autoRemediate` (#6), `agents.deployTemplate` (#7), `agentPromotions.createRequest` (#9), `agentPromotions.execute` (#12), `providerConnections.test` (#13), `providerConnections.create` (#14), `providerConnections.validateAndStore` (#15), `providerConnections.activate` (#16), `providerConnections.disable` (#17), `providerConnections.healthCheck` (#18), `providerConnections.rotate` (#19), `providerConnections.delete` (#20) |

**Checksum: 3 + 10 + 17 = 30 ✓** (matches audit/01 row count)

**Coverage % = PASS / Total = 3 / 30 = 10.0%**

---

## Top 5 Bypass Risks

### 1. CRITICAL — Provider Connection Lifecycle Has Zero Governance

- **Files**: `server/provider-connections/router.ts` L38–208
- **Affected entrypoints**: #13–#20 (all 8 mutations)
- **Risk**: All 8 mutations (`test`, `create`, `validateAndStore`, `activate`, `disable`, `healthCheck`, `rotate`, `delete`) have no policyGate, no policyEvaluation, no freeze check. PAT rotation (L121–134) and activation (L92–97) are high-risk operations that create live connections to external providers with no governance enforcement.
- **Impact**: Any authenticated user can create, activate, rotate secrets for, and delete provider connections. A compromised account can establish arbitrary external connections.

### 2. CRITICAL — Agent Promotion Freeze Check Is a No-Op Mock

- **File**: `server/routers/agents-promotions.ts` L410–414
- **Affected entrypoints**: #9 (`createRequest`), #12 (`execute`)
- **Evidence**:
  ```typescript
  async function checkActiveIncidents(db: any): Promise<any[]> {
    // Mock implementation - check incidents table
    // In production, query incidents table for active incidents
    return [];
  }
  ```
- **Risk**: Freeze is structurally present but functionally dead. Agent promotions can never be blocked by incidents. The `execute` entrypoint (#12) additionally has no promotion logic implemented (L354–355: comment placeholder).

### 3. HIGH — Agent Promote Is a UI-Enforce-Only Gate (Not a Hard Gate)

- **File**: `server/routers/agents.ts` L569–596
- **Affected entrypoint**: #8 (`agents.promote`)
- **Evidence — non-compliance path (L569–577)**:
  ```typescript
  if (!evaluationResult.compliant) {
    return {
      success: false,
      compliant: false,
      violations: evaluationResult.violations,
      score: evaluationResult.score,
      policyName: activePolicy[0].name,
    };
  }
  ```
- **Evidence — compliance path (L580–596)**:
  ```typescript
  // Promotion approved - update agent status
  await db
    .update(agents)
    .set({
      status: "governed",
      updatedAt: new Date(),
    })
    .where(eq(agents.id, input.id));

  return {
    success: true,
    compliant: true,
  ```
- **Analysis**: No DB mutation occurs on the non-compliance path — the `db.update` at L581–587 is only reached when `evaluationResult.compliant` is truthy. The agent status is NOT changed when evaluation fails. However, this is **not a hard gate**: the response is HTTP 200 with `{success: false}`, not HTTP 409. A client that ignores the `success` field sees a successful response. The correct pattern would be `throw new TRPCError({ code: "CONFLICT" })` to ensure the failure is protocol-level, not payload-level.
- **Revised classification**: UI-enforce-only risk. The backend does prevent the state mutation, but the API contract does not signal failure at the transport layer. A non-browser caller (curl, script, bot) could misinterpret the 200 response as success.

### 4. HIGH — Hardcoded Actor ID `1` Breaks Principal Attribution Across Catalog

- **File**: `server/routers/catalog-manage.ts`
- **Affected entrypoints**: #21–#25, #27, #30 (7 of 10 catalog mutations)
- **Evidence — audit helper (L36–44)**:
  ```typescript
  function audit(eventType: string, catalogEntryId: number | null, payload: any, bundleId?: number) {
    createCatalogAuditEvent({
      eventType,
      catalogEntryId,
      publishBundleId: bundleId ?? null,
      actor: 1,
      actorType: "user",
      payload,
    }).catch((e) => console.warn(...));
  }
  ```
- **Evidence — direct calls**: `createCatalogEntry({...createdBy: 1})` (L212), `updateCatalogEntry(id, data, 1)` (L238, L281, L316, L336, L445, L463, L599).
- **Risk**: All catalog audit events and entity ownership attribute to synthetic user ID `1` regardless of the actual actor. The real `ctx.user.id` is available in every procedure context but never passed. This breaks forensic traceability for the entire catalog management surface.

### 5. HIGH — Agent CRUD Has No Governance Surface

- **File**: `server/routers/agents.ts` L71–506
- **Affected entrypoints**: #1–#7 (7 mutations)
- **Evidence**: None of `agents.create` (L71), `agents.update` (L105), `agents.delete` (L151), `agents.deployTemplate` (L482), `agents.autoRemediate` (L424), `agents.exportCompliance` (L378), `agents.runDriftDetection` (L287) import or call any function from `server/governance/*`. The file imports `evaluateAgentCompliance` from `server/services/policyEvaluation` (L7) but only `agents.promote` uses it. The remaining 6 mutations execute with zero governance awareness — no gate, no audit, no freeze check. `autoRemediate` mutates agent config with a hardcoded strategy (`temperature: "0.7"`, L450) and no policy validation.

---

## Systemic Findings (subset)

1. **No universal `enforceGate()` middleware exists.** Governance enforcement is opt-in per-procedure, not injected via middleware or base procedure. The 3 PASS entrypoints (#26, #28, #29) each inline their own `evaluateStageReview()` call. Every other mutation must independently remember to call governance — and 17 of 30 do not. Evidence: `server/routers/catalog-manage.ts` L511, L624, L708 each duplicate the same gate pattern; no shared wrapper.

2. **Freeze enforcement is absent at the router layer outside `server/governance/router.ts`.** The governance router checks `isFrozen()` (governance/router.ts L326, L334, L562, L568) but none of the 4 audited files call `isFrozen()`. The only freeze-like mechanism in audited files is the mock `checkActiveIncidents()` in #9/#12 (`agents-promotions.ts` L410–414) which always returns `[]`. No audited mutation can be blocked by a freeze.

3. **Principal attribution is structurally broken in `catalogManage`.** 7 of 10 catalog mutations (#21–#25, #27, #30) hardcode actor ID `1` via `createCatalogEntry(..., createdBy: 1)` and the `audit()` helper (`catalog-manage.ts` L36–44). Only the 3 PASS entrypoints (#26, #28, #29) pass `ctx.user.id`. This is not a typo — it is a systematic pattern where `ctx` is available but unused.

4. **Policy evaluation exists in two separate systems that do not integrate.** `agents.promote` (#8) uses `evaluateAgentCompliance()` from `server/services/policyEvaluation` (agents.ts L7, L557). `catalogManage.approve/activate/publish` (#26, #28, #29) use `evaluateStageReview()` from `server/governance/stage-review` (catalog-manage.ts L50, L511). These two evaluation paths share no interface, no common verdict type, and no shared enforcement function. A unified `enforceGate()` would need to reconcile both.

5. **Audit logging is inconsistent across domains.** `catalogManage` uses a fire-and-forget `audit()` helper (catalog-manage.ts L36–44, `.catch()` swallows errors). `agentPromotions` writes directly to `agentHistory` table (agents-promotions.ts L217–223, L288–294). `providerConnections` delegates to `appendAuditLog` in the service layer (service.ts L26) but the router itself logs nothing. `agents` has zero audit logging. There is no unified audit sink.

6. **No mutation in the audited files calls `policyGate` or `requireGate`.** The `policyGate` column is N for all 30 rows. The governance engine's `requireGate()` function (`server/governance/requireGate.ts`) is never imported or called by any of the 4 audited router files. Enforcement exists only via `evaluateStageReview()` in 3 catalog admin procedures.

7. **Soft-delete without governance creates hidden state.** `agents.delete` (#3, agents.ts L177–181) sets `status: "archived"` but logs no audit event and checks no governance gate. An agent can be silently archived by any workspace member, removing it from active queries (`ne(agents.status, "archived")` at L23, L198) with no trail.

8. **Mock/simulated data in production paths.** `agents.exportCompliance` (#5, agents.ts L407) uses `Math.random() > 0.2` to generate compliance status. `agents.autoRemediate` (#6, agents.ts L450) applies a hardcoded `temperature: "0.7"` without evaluating what the actual policy requires. Both are presented as real features but produce meaningless output.

9. **`protectedProcedure` is the only auth gate for high-risk operations.** PAT rotation (#19, provider-connections/router.ts L121–134), connection activation (#16, L92–97), and secret deletion (#20, L203–208) all use `protectedProcedure` — meaning any logged-in user can execute them. None use `adminProcedure`. No RBAC check beyond "is authenticated" exists for these operations.

---

## Next Files to Audit

Priority order based on `server/routers.ts` (L44–79) router composition, ranked by mutation risk:

- [ ] `server/routers/keyRotation.ts` — key rotation = secret lifecycle, likely ungoverned
- [ ] `server/routers/deploy.ts` — deployment management, high blast radius
- [ ] `server/routers/discovery-ops.ts` — discovery monitoring, promotion, audit ops
- [ ] `server/catalog-import/router.ts` — catalog import & discovery (external data ingestion)
- [ ] `server/routers/policies.ts` — policy CRUD, self-referential governance risk
- [ ] `server/routers/triggers.ts` — automation triggers, background execution
- [ ] `server/routers/actions.ts` — automation actions
- [ ] `server/routers/protocols.ts` — protocol definitions
- [ ] `server/routers/llm.ts` — LLM control plane (imports llm-creation, llm-providers)
- [ ] `server/providers/router.ts` — provider registry CRUD
