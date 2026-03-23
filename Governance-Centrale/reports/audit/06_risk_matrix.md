# audit/06_risk_matrix.md — COMPLETE

## Risk Ranking Matrix

### Severity Criteria

- **CRITICAL**: Governance bypass that could lead to unauthorized access, data exfiltration, or undetectable state changes in production-critical systems.
- **HIGH**: Governance gap that breaks audit trail, enables unauthorized operations, or allows state mutations without review.
- **MEDIUM**: Missing governance that affects traceability, consistency, or operational visibility but has limited blast radius.

---

## CRITICAL (5)

| Rank | Risk | Affected Mutations | File(s) | Evidence |
|------|------|--------------------|---------|----------|
| C1 | **`requireGate()` is dead code — canonical enforcement function has zero callers** | 184/184 | `requireGate.ts` L70–185 | Function exists with freeze+scorecard+audit. Zero imports in any router. The entire governance engine has no enforcement path. |
| C2 | **Provider Connection Lifecycle has zero governance — PAT rotation, activation, deletion ungoverned** | 8 | `provider-connections/router.ts` L38–208 | All 8 mutations: no policyGate, no policyEval, no freeze, no RBAC beyond `protectedProcedure`. PAT rotation (L121–134) creates live external connections. |
| C3 | **Key Rotation has zero governance — certificate and secret lifecycle ungoverned** | 13 | `keyRotation.ts` | All 13 mutations use `protectedProcedure`. Certificate create/activate/revoke (6 mutations) have zero principal attribution. Any user can manage rotation policies. |
| C4 | **Cascade deletion without access check in `documentsCrud.bulkDelete`** | 1 | `documents-crud-router.ts` L119 | Takes array of IDs, deletes without `hasWorkspaceAccess()`. Compare: single `delete` (L85) checks access. Any user can delete any documents. |
| C5 | **API keys stored in catalog config without encryption or governance** | 1 | `catalog-import/router.ts` L69–73 | `discoverFromApi` stores provider API keys directly in catalog entry `config` field. No encryption, no audit, no governance gate. Keys exposed in read queries. |

---

## HIGH (5)

| Rank | Risk | Affected Mutations | File(s) | Evidence |
|------|------|--------------------|---------|----------|
| H1 | **Agent Promotion freeze check is a no-op mock** | 2 | `agents-promotions.ts` L410–414 | `checkActiveIncidents()` always returns `[]`. Freeze structurally present but functionally dead. `execute` (#12) has no promotion logic (L354–355 placeholder). |
| H2 | **Hardcoded actor ID `1` breaks principal attribution across catalog** | 10 | `catalog-manage.ts` L36–44 | `audit()` helper uses `actor: 1`. Direct calls use `createdBy: 1` (L212), `updateCatalogEntry(id, data, 1)` at 7 call sites. `ctx.user.id` is available but unused. |
| H3 | **Automation workflow execution has no governance gate** | 7 | `automation-router.ts` | `executeWorkflow` (L199) runs arbitrary workflow logic. `publishWorkflow` (L153) creates immutable snapshots. No governance, no freeze check, no review gate for any of 7 mutations. |
| H4 | **Policy CRUD is self-referentially ungoverned** | 5 | `policies.ts` | Policy create/update/delete/activate/createFromTemplate — all `protectedProcedure`, no governance gate. Policies governing other entities are themselves ungoverned. A compromised account can modify/delete governance rules. |
| H5 | **Agent CRUD has no governance surface — 7 mutations with zero governance awareness** | 7 | `agents.ts` L71–506 | `create`, `update`, `delete`, `deployTemplate`, `autoRemediate`, `exportCompliance`, `runDriftDetection` — none import governance functions. `autoRemediate` mutates config with hardcoded strategy (L450). |

---

## MEDIUM (5)

| Rank | Risk | Affected Mutations | File(s) | Evidence |
|------|------|--------------------|---------|----------|
| M1 | **`agents.promote` returns HTTP 200 on failure (UI-enforce-only gate)** | 1 | `agents.ts` L569–577 | Returns `{success:false}` instead of throwing `TRPCError({code:"CONFLICT"})`. Backend prevents DB mutation but API contract does not signal failure at transport layer. |
| M2 | **Trigger/Action admin ops use `protectedProcedure` instead of `adminProcedure`** | 5 | `triggers.ts` L370–403, `actions.ts` L269–421 | `approve`/`reject`/`delete` comment "admin only" but use `protectedProcedure`. `actions.create` uses inline role check (L271) instead of middleware. |
| M3 | **Mock/simulated data in production paths** | 4 | `agents.ts` L407,L450; `agents-promotions.ts` L354; `routers.ts` L293 | `Math.random()` for compliance, hardcoded remediation, placeholder promotion logic, simulated downloads. Features presented as real but producing meaningless output. |
| M4 | **LLM promotion lifecycle has no governance gate** | 4 | `llm.ts` L245–320 | `createPromotion`, `approvePromotion`, `rejectPromotion`, `executePromotion` — all `protectedProcedure`. `executePromotion` creates new version in target environment with no review. |
| M5 | **Governance engine's own mutations are partially ungoverned** | 2 | `governance/router.ts` L640,L666 | `driftToggle` (start/stop detection) and `unfreezeSubject` have no audit of who performed the action. Admin-only but no trail. |

---

## Summary Table

| Severity | Count | Affected Mutations |
|----------|-------|--------------------|
| CRITICAL | 5 | 207 (includes overlap with C1 covering all 184) |
| HIGH | 5 | 31 |
| MEDIUM | 5 | 16 |

## Risk by Domain (Top 10 Most At-Risk)

| Domain | Mutations | FAIL | Risk Level | Primary Risk |
|--------|-----------|------|------------|--------------|
| Provider Connections | 8 | 8 | CRITICAL | Zero governance on PAT/secret lifecycle |
| Key Rotation | 13 | 9 | CRITICAL | Zero governance on certificate lifecycle |
| Automation | 7 | 7 | HIGH | Workflow execution without review |
| Agents | 8 | 7 | HIGH | CRUD + remediation without governance |
| Policies | 5 | 5 | HIGH | Self-referentially ungoverned |
| Model Downloads | 9 | 9 | MEDIUM | No audit, no governance |
| LLM Control Plane | 27 | 18 | MEDIUM | Promotion lifecycle ungoverned |
| Documents | 7 | 7 | MEDIUM | Cascade delete without access check |
| Deploy | 3 | 3 | MEDIUM | GitHub Actions dispatch without governance |
| Chat | 6 | 6 | LOW | User data, limited blast radius |
