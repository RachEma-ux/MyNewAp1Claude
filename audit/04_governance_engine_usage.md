# audit/04_governance_engine_usage.md — COMPLETE

## Governance Engine Inventory

### Source Files (server/governance/)

| File | Purpose | Used By |
|------|---------|---------|
| `requireGate.ts` | **Canonical enforcement function** — freeze + scorecard + audit | **NOBODY** (0 callers) |
| `stage-review.ts` | Per-stage checklist evaluation | `catalog-manage.ts` (3×), `governance/router.ts` (2×) |
| `scorecard/` | Scorecard engine — control evaluation | `requireGate.ts`, `governance/router.ts` |
| `lifecycle-guard.ts` | Lifecycle transition validation | `stage-review.ts`, `governance/router.ts` |
| `publication-gate.ts` | Publication readiness evaluation | `stage-review.ts`, `governance/router.ts` |
| `rbac-model.ts` | Role-based access control model | `governance/router.ts` |
| `risk-classifier.ts` | Risk severity classification | `governance/router.ts`, `stage-review.ts` |
| `governance-engine.ts` | Engine singleton with `enforcePermission()` | `governance/router.ts` |
| `architecture-validator.ts` | Architecture pattern validation | `governance/router.ts` |
| `catalog-lint.ts` | Control catalog quality linting | `governance/router.ts` |
| `gate-coverage.ts` | Gate coverage map generator | `governance/router.ts` |
| `production-hardening.ts` | Security control validation | `governance/router.ts` |
| `self-check.ts` | Runtime governance health check | `governance/router.ts` |
| `artifact-store.ts` | Evidence vault artifact storage | `scorecard/` |

---

## Function Usage Map

### `requireGate()` — server/governance/requireGate.ts L70

**The canonical enforcement function. MUST be called before ANY lifecycle mutation.**

| Caller | File | Line | Status |
|--------|------|------|--------|
| *(none)* | — | — | **DEAD CODE** |

**0 / 184 mutations call `requireGate()`.**

---

### `evaluateStageReview()` — server/governance/stage-review.ts

| Caller | File | Line | Context |
|--------|------|------|---------|
| `catalogManage.approve` | `catalog-manage.ts` | L511 | Throws CONFLICT on fail. **PASS** |
| `catalogManage.activate` | `catalog-manage.ts` | L624 | Throws CONFLICT on fail. **PASS** |
| `catalogManage.publish` | `catalog-manage.ts` | L708 | Throws CONFLICT on fail. **PASS** |
| `governance.evaluateStageReview` (query) | `governance/router.ts` | L508 | Informational — returns result, does not block |
| `governance.stageTransition` | `governance/router.ts` | L575 | Via `executeStageTransition()`. Throws CONFLICT. **PASS** |

**5 call sites, 4 enforce (throw), 1 informational.**

---

### `executeStageTransition()` — server/governance/stage-review.ts

| Caller | File | Line | Context |
|--------|------|------|---------|
| `governance.stageTransition` | `governance/router.ts` | L575 | Full transition with freeze + review + lifecycle guard |

**1 call site.**

---

### `evaluateAgentCompliance()` — server/services/policyEvaluation.ts

| Caller | File | Line | Context |
|--------|------|------|---------|
| `agents.promote` | `agents.ts` | L557 | Returns `{success:false}` instead of throwing. **PARTIAL** |

**1 call site. Not fail-closed.**

---

### `isFrozen()` — server/governance/scorecard.ts

| Caller | File | Line | Context |
|--------|------|------|---------|
| `governance.stageTransition` | `governance/router.ts` | L562 | Subject freeze check |
| `governance.stageTransition` | `governance/router.ts` | L568 | System-wide freeze check |
| `requireGate()` | `requireGate.ts` | L88, L117 | **Called within requireGate — but requireGate itself is never called** |

**2 effective call sites (both in governance router). 0 in business logic routers.**

---

### `LLMPolicyEngine.evaluate()` — server/policies/llm-policy-engine.ts

| Caller | File | Line | Context |
|--------|------|------|---------|
| `llm.validatePolicy` | `llm-providers.ts` | L61 | Informational — returns evaluation result, no enforcement |

**1 call site. Not a gate — purely advisory.**

---

### `getGovernanceEngine().enforcePermission()` — server/governance/governance-engine.ts

| Caller | File | Line | Context |
|--------|------|------|---------|
| `governance.selfCheck` | `governance/router.ts` | L92 | RBAC check for self-check query |
| Various query endpoints | `governance/router.ts` | Multiple | RBAC for governance dashboard queries |

**Called only within governance router queries, never for mutations.**

---

### `getAuditLogger().log()` — server/services/auditLogger.ts

| Caller | File | Mutation Count | Context |
|--------|------|---------------|---------|
| `providers/router.ts` | L149, L185, L209 | 3 | PROVIDER_CONNECT, PROVIDER_UPDATE, PROVIDER_DELETE |
| `secrets-router.ts` | L31, L74, L91 | 3 | SECRET_CREATE, SECRET_UPDATE, SECRET_DELETE |
| `requireGate.ts` | L92, L121, L157 | — | Within requireGate (dead code) |
| `governance/router.ts` | Multiple | — | Governance engine internal |

**6 mutations use `getAuditLogger()` out of 184 total (3.3%).**

---

## Governance Coverage Heat Map

```
                    requireGate  stageReview  agentEval  isFrozen  auditLog  TOTAL
agents.ts               ○            ○           ◐          ○         ○        1/5
agents-promotions.ts     ○            ○           ○          ○         ◐        1/5
provider-connections     ○            ○           ○          ○         ○        0/5
catalog-manage.ts        ○            ●           ○          ○         ◐        2/5
keyRotation.ts           ○            ○           ○          ○         ○        0/5
deploy.ts                ○            ○           ○          ○         ○        0/5
discovery-ops.ts         ○            ○           ○          ○         ○        0/5
catalog-import           ○            ○           ○          ○         ○        0/5
policies.ts              ○            ○           ○          ○         ○        0/5
triggers.ts              ○            ○           ○          ○         ○        0/5
actions.ts               ○            ○           ○          ○         ○        0/5
protocols.ts             ○            ○           ○          ○         ○        0/5
llm.ts                   ○            ○           ○          ○         ○        0/5
llm-creation.ts          ○            ○           ○          ○         ◐        1/5
llm-providers.ts         ○            ○           ○          ○         ○        0/5
conversations.ts         ○            ○           ○          ○         ○        0/5
wcpWorkflows.ts          ○            ○           ○          ○         ○        0/5
wiki.ts                  ○            ○           ○          ○         ○        0/5
templates.ts             ○            ○           ○          ○         ○        0/5
providers/router.ts      ○            ○           ○          ○         ●        1/5
chat/router.ts           ○            ○           ○          ○         ○        0/5
download-router.ts       ○            ○           ○          ○         ○        0/5
benchmark-router.ts      ○            ○           ○          ○         ○        0/5
version-router.ts        ○            ○           ○          ○         ○        0/5
documents-router.ts      ○            ○           ○          ○         ○        0/5
documents-crud.ts        ○            ○           ○          ○         ○        0/5
automation-router.ts     ○            ○           ○          ○         ○        0/5
secrets-router.ts        ○            ○           ○          ○         ●        1/5
inference-router.ts      ○            ○           ○          ○         ○        0/5
embeddings-router.ts     ○            ○           ○          ○         ○        0/5
vectordb-router.ts       ○            ○           ○          ○         ○        0/5
hardware-router.ts       ○            ○           ○          ○         ○        0/5
systemRouter.ts          ○            ○           ○          ○         ○        0/5
governance/router.ts     ○            ●           ○          ●         ○        2/5
routers.ts (inline)      ○            ○           ○          ○         ○        0/5

Legend: ● = fully used  ◐ = partially used  ○ = not used
```

## Summary

| Metric | Value |
|--------|-------|
| Governance functions available | 6 (`requireGate`, `evaluateStageReview`, `evaluateAgentCompliance`, `isFrozen`, `LLMPolicyEngine.evaluate`, `getAuditLogger`) |
| Functions with non-zero router callers | 4 |
| `requireGate()` callers | **0** |
| Router files using any governance function | **6 of 35** (17%) |
| Router files with zero governance imports | **29 of 35** (83%) |
| Total governance function calls in routers | **14** across 184 mutations |
