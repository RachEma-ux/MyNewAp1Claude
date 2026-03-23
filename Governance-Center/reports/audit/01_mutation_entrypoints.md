# audit/01_mutation_entrypoints.md — COMPLETE

## Scope

**35 router files audited. 184 mutation entrypoints identified.**

Files: `server/routers/agents.ts`, `server/routers/agents-promotions.ts`, `server/provider-connections/router.ts`, `server/routers/catalog-manage.ts`, `server/routers/keyRotation.ts`, `server/routers/deploy.ts`, `server/routers/discovery-ops.ts`, `server/catalog-import/router.ts`, `server/routers/policies.ts`, `server/routers/triggers.ts`, `server/routers/actions.ts`, `server/routers/protocols.ts`, `server/routers/llm.ts`, `server/routers/llm-creation.ts`, `server/routers/llm-providers.ts`, `server/routers/conversations.ts`, `server/routers/wcpWorkflows.ts`, `server/routers/wiki.ts`, `server/routers/templates.ts`, `server/providers/router.ts`, `server/chat/router.ts`, `server/models/download-router.ts`, `server/models/benchmark-router.ts`, `server/models/version-router.ts`, `server/documents/documents-router.ts`, `server/documents/documents-crud-router.ts`, `server/automation/automation-router.ts`, `server/secrets/secrets-router.ts`, `server/inference/inference-router.ts`, `server/embeddings/embeddings-router.ts`, `server/vectordb/vectordb-router.ts`, `server/hardware/hardware-router.ts`, `server/_core/systemRouter.ts`, `server/governance/router.ts`, `server/routers.ts` (inline)

---

## Domain 1: Agents (server/routers/agents.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 1 | `agents.create` | protected | 71–91 | N | N | N | N | Y | N | `createdBy: ctx.user.id` (L87). No governance. | **FAIL** |
| 2 | `agents.update` | protected | 105–146 | N | N | N | N | N | N | Workspace filter (L115–116) but no actor logged. | **FAIL** |
| 3 | `agents.delete` | protected | 151–184 | N | N | N | N | N | N | Soft-delete `status:"archived"` (L178). No audit. | **FAIL** |
| 4 | `agents.runDriftDetection` | protected | 287–373 | N | N | N | N | N | N | Returns drift report. No audit of who triggered. | **FAIL** |
| 5 | `agents.exportCompliance` | protected | 378–416 | N | N | N | N | N | N | `Math.random() > 0.2` for compliance (L407). Mock. | **FAIL** |
| 6 | `agents.autoRemediate` | protected | 424–461 | N | N | N | N | N | N | Hardcoded `temperature:"0.7"` (L450). No policy eval. | **FAIL** |
| 7 | `agents.deployTemplate` | protected | 482–506 | N | N | N | N | Y | N | `createdBy: ctx.user.id` (L498). Bypasses governance. | **FAIL** |
| 8 | `agents.promote` | protected | 511–596 | N | Y | N | N | Y | N | `evaluateAgentCompliance()` (L557). Returns `{success:false}` not throw (L569–577). UI-enforce-only. | **PARTIAL** |

**Subtotal: 0 PASS, 1 PARTIAL, 7 FAIL**

---

## Domain 2: Agent Promotions (server/routers/agents-promotions.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 9 | `agentPromotions.createRequest` | protected | 19–83 | N | N | Y(mock) | N | Y | N | `checkActiveIncidents()` L410–414 always returns `[]`. `requestedBy: ctx.user.id` (L75). | **FAIL** |
| 10 | `agentPromotions.approve` | protected | 160–226 | N | N | N | Y | Y | N | Writes `agentHistory` `promotion_approved`, `actorId: ctx.user.id` (L217–223). | **PARTIAL** |
| 11 | `agentPromotions.reject` | protected | 231–297 | N | N | N | Y | Y | N | Writes `agentHistory` `promotion_rejected`, `actorId: ctx.user.id` (L288–294). | **PARTIAL** |
| 12 | `agentPromotions.execute` | protected | 302–370 | N | N | Y(mock) | N | N | N | Mock freeze (L331). Promotion logic not implemented (L354–355 comment placeholder). | **FAIL** |

**Subtotal: 0 PASS, 2 PARTIAL, 2 FAIL**

---

## Domain 3: Provider Connections (server/provider-connections/router.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 13 | `providerConnections.test` | protected | 38–47 | N | N | N | N | N | N | Delegates to `testConnection()` (L46). No ctx passed. | **FAIL** |
| 14 | `providerConnections.create` | protected | 52–68 | N | N | N | N | Y | N | `createdBy: ctx.user?.id ?? 1` (L65). Service may audit internally. | **FAIL** |
| 15 | `providerConnections.validateAndStore` | protected | 74–87 | N | N | N | N | Y | N | `actor: ctx.user?.id ?? 1` (L85). Encrypts+stores PAT. | **FAIL** |
| 16 | `providerConnections.activate` | protected | 92–97 | N | N | N | N | Y | N | `ctx.user?.id ?? 1` (L95). Transitions to ACTIVE. | **FAIL** |
| 17 | `providerConnections.disable` | protected | 102–107 | N | N | N | N | Y | N | `ctx.user?.id ?? 1` (L105). | **FAIL** |
| 18 | `providerConnections.healthCheck` | protected | 112–116 | N | N | N | N | N | N | No ctx passed. | **FAIL** |
| 19 | `providerConnections.rotate` | protected | 121–134 | N | N | N | N | Y | N | `actor: ctx.user?.id ?? 1` (L132). PAT rotation — high risk. | **FAIL** |
| 20 | `providerConnections.delete` | protected | 203–208 | N | N | N | N | N | N | Cascade-deletes secrets. No ctx passed. | **FAIL** |

**Subtotal: 0 PASS, 0 PARTIAL, 8 FAIL**

---

## Domain 4: Catalog Management (server/routers/catalog-manage.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 21 | `catalogManage.create` | protected | 191–228 | N | N | N | Y | N | N | `audit("catalog.entry.created")` (L214). `createdBy: 1` hardcoded (L212). | **PARTIAL** |
| 22 | `catalogManage.update` | protected | 233–241 | N | N | N | Y | N | N | `updateCatalogEntry(id, data, 1)` actor hardcoded (L238). | **PARTIAL** |
| 23 | `catalogManage.delete` | protected | 246–253 | N | N | N | Y | N | N | `audit()` helper uses `actor: 1` (L36–44). | **PARTIAL** |
| 24 | `catalogManage.discoverProvider` | protected | 131–167 | N | N | N | Y | Y | N | Rate limited (10/min, L147). `ctx.user?.id ?? 0` (L135). | **PARTIAL** |
| 25 | `catalogManage.validate` | protected | 268–477 | N | N | N | Y | N | N | `updateCatalogEntry(..., 1)` at L281,L316,L336,L445,L463. All hardcoded. | **PARTIAL** |
| 26 | `catalogManage.approve` | admin | 487–586 | N | Y | N | Y | Y | Y | `evaluateStageReview()` (L511–535). Throws CONFLICT (L529–534). `ctx.user.id` (L526). | **PASS** |
| 27 | `catalogManage.reject` | admin | 591–605 | N | N | N | Y | N | N | `updateCatalogEntry(..., 1)` actor hardcoded (L599). | **PARTIAL** |
| 28 | `catalogManage.activate` | admin | 611–654 | N | Y | N | Y | Y | Y | `evaluateStageReview()` (L624–639). Throws CONFLICT (L641–646). `ctx.user.id` (L638). | **PASS** |
| 29 | `catalogManage.publish` | admin | 678–780 | N | Y | N | Y | Y | Y | `evaluateStageReview()` (L708–729). Throws CONFLICT (L725–729). SHA256 snapshot (L754). | **PASS** |
| 30 | `catalogManage.recall` | admin | 926–934 | N | N | N | Y | N | N | `audit("catalog.bundle.recalled")` (L932). No actor passed. | **PARTIAL** |

**Subtotal: 3 PASS, 7 PARTIAL, 0 FAIL**

---

## Domain 5: Key Rotation (server/routers/keyRotation.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 31 | `keyRotation.serviceCerts.create` | protected | ~70 | N | N | N | N | N | N | Creates certificate entry. No governance. | **FAIL** |
| 32 | `keyRotation.serviceCerts.activate` | protected | ~95 | N | N | N | N | N | N | Activates certificate. No audit. | **FAIL** |
| 33 | `keyRotation.serviceCerts.revoke` | protected | ~115 | N | N | N | N | N | N | Revokes certificate. No audit. | **FAIL** |
| 34 | `keyRotation.attestationKeys.create` | protected | ~165 | N | N | N | N | N | N | Creates attestation key. No governance. | **FAIL** |
| 35 | `keyRotation.attestationKeys.activate` | protected | ~190 | N | N | N | N | N | N | Activates key. No audit. | **FAIL** |
| 36 | `keyRotation.attestationKeys.deprecate` | protected | ~210 | N | N | N | N | N | N | Deprecates key. No audit. | **FAIL** |
| 37 | `keyRotation.rotations.create` | protected | ~306 | N | N | N | Y | Y | N | `initiatedBy: ctx.user.id`. Calls `logRotationAction`. | **PARTIAL** |
| 38 | `keyRotation.rotations.complete` | protected | ~330 | N | N | N | Y | N | N | Calls `logRotationAction`. No principal in complete. | **PARTIAL** |
| 39 | `keyRotation.rotations.fail` | protected | ~350 | N | N | N | Y | N | N | Calls `logRotationAction`. | **PARTIAL** |
| 40 | `keyRotation.rotations.rollback` | protected | ~370 | N | N | N | Y | N | N | Calls `logRotationAction`. | **PARTIAL** |
| 41 | `keyRotation.policies.create` | protected | ~410 | N | N | N | N | Y | N | `createdBy: ctx.user.id`. No governance. | **FAIL** |
| 42 | `keyRotation.policies.activate` | protected | ~440 | N | N | N | N | N | N | Activates rotation policy. No audit. | **FAIL** |
| 43 | `keyRotation.policies.deactivate` | protected | ~460 | N | N | N | N | N | N | Deactivates rotation policy. No audit. | **FAIL** |

**Subtotal: 0 PASS, 4 PARTIAL, 9 FAIL**

---

## Domain 6: Deployments (server/routers/deploy.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 44 | `deploy.trigger` | protected | 133 | N | N | N | N | N | N | Triggers GitHub Actions dispatch. No governance. | **FAIL** |
| 45 | `deploy.cancel` | protected | 438 | N | N | N | N | N | N | Cancels workflow run. No audit. | **FAIL** |
| 46 | `deploy.rerun` | protected | 458 | N | N | N | N | N | N | Re-runs workflow. No audit. | **FAIL** |

**Subtotal: 0 PASS, 0 PARTIAL, 3 FAIL**

---

## Domain 7: Discovery Ops (server/routers/discovery-ops.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 47 | `discoveryOps.markInReview` | admin | 461 | N | N | N | N | Y | N | `ctx.user?.id` stored. No governance gate. | **PARTIAL** |
| 48 | `discoveryOps.reject` | admin | 486 | N | N | N | N | Y | N | `ctx.user?.id` stored. No governance gate. | **PARTIAL** |
| 49 | `discoveryOps.accept` | admin | 518 | N | N | N | N | Y | N | `ctx.user?.id` stored. No governance gate. | **PARTIAL** |
| 50 | `discoveryOps.reopen` | admin | 555 | N | N | N | N | Y | N | `ctx.user?.id` stored. No governance gate. | **PARTIAL** |
| 51 | `discoveryOps.cleanup` | admin | 672 | N | N | N | N | N | N | Deletes old events. No audit trail. | **FAIL** |

**Subtotal: 0 PASS, 4 PARTIAL, 1 FAIL**

---

## Domain 8: Catalog Import (server/catalog-import/router.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 52 | `catalogImport.discoverFromApi` | protected | 32 | N | N | N | N | N | N | Stores API keys in catalog config (L69–73). Security risk. | **FAIL** |
| 53 | `catalogImport.parseFile` | protected | 113 | N | N | N | N | N | N | Stub — not implemented. | **FAIL** |
| 54 | `catalogImport.bulkCreate` | protected | 159 | N | N | N | Y | Y | N | Import audit log (L250–261). `userId: ctx.user?.id ?? 1`. | **PARTIAL** |

**Subtotal: 0 PASS, 1 PARTIAL, 2 FAIL**

---

## Domain 9: Policies (server/routers/policies.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 55 | `policies.create` | protected | 67 | N | N | N | N | Y | N | `createdBy: ctx.user.id` (L95). Self-referential risk. | **FAIL** |
| 56 | `policies.update` | protected | 118 | N | N | N | N | N | N | Ownership check but no audit. | **FAIL** |
| 57 | `policies.delete` | protected | 167 | N | N | N | N | N | N | No audit. | **FAIL** |
| 58 | `policies.activate` | protected | 205 | N | N | N | N | N | N | Activates policy. No audit. | **FAIL** |
| 59 | `policies.createFromTemplate` | protected | 308 | N | N | N | N | Y | N | `createdBy: ctx.user.id`. No audit. | **FAIL** |

**Subtotal: 0 PASS, 0 PARTIAL, 5 FAIL**

---

## Domain 10: Triggers (server/routers/triggers.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 60 | `triggers.create` | protected | 148 | N | N | N | N | N | N | Local hard-rule validation (L85–142) but no governance gate. | **FAIL** |
| 61 | `triggers.approve` | protected | 370 | N | N | N | N | N | N | Comment says "admin only" but uses `protectedProcedure`. | **FAIL** |
| 62 | `triggers.reject` | protected | 385 | N | N | N | N | N | N | Same — missing `adminProcedure`. | **FAIL** |
| 63 | `triggers.delete` | protected | 403 | N | N | N | N | N | N | No audit. | **FAIL** |

**Subtotal: 0 PASS, 0 PARTIAL, 4 FAIL**

---

## Domain 11: Actions (server/routers/actions.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 64 | `actions.create` | protected | 269 | N | N | N | N | N | N | Inline admin check `ctx.user.role !== "admin"` (L271) instead of `adminProcedure`. | **FAIL** |
| 65 | `actions.approve` | protected | 370 | N | N | N | N | N | N | Compliance scoring (L439–485) but no governance gate. | **FAIL** |
| 66 | `actions.reject` | protected | 396 | N | N | N | N | N | N | No governance. | **FAIL** |
| 67 | `actions.delete` | protected | 421 | N | N | N | N | N | N | No audit. | **FAIL** |

**Subtotal: 0 PASS, 0 PARTIAL, 4 FAIL**

---

## Domain 12: Protocols (server/routers/protocols.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 68 | `protocols.create` | protected | 72 | N | N | N | N | Y | N | `createdBy: ctx.user.id` (L86). No governance. | **FAIL** |
| 69 | `protocols.update` | protected | 101 | N | N | N | N | N | N | No audit. | **FAIL** |
| 70 | `protocols.delete` | protected | 134 | N | N | N | N | N | N | No audit. | **FAIL** |
| 71 | `protocols.uploadFromFile` | protected | 166 | N | N | N | N | N | N | No audit. | **FAIL** |

**Subtotal: 0 PASS, 0 PARTIAL, 4 FAIL**

---

## Domain 13: LLM Control Plane (server/routers/llm.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 72 | `llm.create` | protected | 107 | N | N | N | N | Y | N | `createdBy: ctx.user.id`. No governance. | **FAIL** |
| 73 | `llm.update` | protected | 131 | N | N | N | N | N | N | No audit. | **FAIL** |
| 74 | `llm.archive` | protected | 185 | N | N | N | N | N | N | Soft-archive. No audit. | **FAIL** |
| 75 | `llm.createVersion` | protected | 196 | N | N | N | N | Y | N | `createdBy: ctx.user.id`. | **FAIL** |
| 76 | `llm.updateCallable` | protected | 234 | N | N | N | N | N | N | No audit. | **FAIL** |
| 77 | `llm.createPromotion` | protected | 245 | N | N | N | N | Y | N | `requestedBy: ctx.user.id`. No governance. | **FAIL** |
| 78 | `llm.approvePromotion` | protected | 288 | N | N | N | N | Y | N | `approvedBy: ctx.user.id`. No governance gate. | **PARTIAL** |
| 79 | `llm.rejectPromotion` | protected | 300 | N | N | N | N | Y | N | `rejectedBy: ctx.user.id`. No governance gate. | **PARTIAL** |
| 80 | `llm.executePromotion` | protected | 307 | N | N | N | N | N | N | Creates version in target env. No governance. | **FAIL** |

**Subtotal: 0 PASS, 2 PARTIAL, 7 FAIL**

---

## Domain 14: LLM Creation Pipeline (server/routers/llm-creation.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 81 | `llm.createCreationProject` | protected | 49 | N | N | N | Y | Y | N | Audit: `llmCreationAuditEvents` (L112–120). `actor: ctx.user.id`. | **PARTIAL** |
| 82 | `llm.updateCreationProject` | protected | 276 | N | N | N | Y | Y | N | Audit event (L288–296). `actor: ctx.user.id`. | **PARTIAL** |
| 83 | `llm.createDataset` | protected | 316 | N | N | N | Y | Y | N | Audit event (L328–337). `actor: ctx.user.id`. | **PARTIAL** |
| 84 | `llm.updateDataset` | protected | 354 | N | N | N | N | N | N | No audit. | **FAIL** |
| 85 | `llm.startTraining` | protected | 384 | N | N | N | Y | Y | N | Audit event (L409–418). Enqueues job. | **PARTIAL** |
| 86 | `llm.updateTrainingRun` | protected | 456 | N | N | N | N | N | N | No audit. | **FAIL** |
| 87 | `llm.createEvaluation` | protected | 491 | N | N | N | Y | Y | N | Audit event (L504–513). Enqueues job. | **PARTIAL** |
| 88 | `llm.updateEvaluation` | protected | 549 | N | N | N | N | N | N | No audit. | **FAIL** |
| 89 | `llm.startQuantization` | protected | 591 | N | N | N | Y | Y | N | Audit event (L605–614). Enqueues job. | **PARTIAL** |
| 90 | `llm.updateQuantization` | protected | 649 | N | N | N | N | N | N | No audit. | **FAIL** |
| 91 | `llm.cancelJob` | protected | 722 | N | N | N | N | N | N | No audit. | **FAIL** |
| 92 | `llm.pauseTraining` | protected | 733 | N | N | N | N | N | N | No audit. | **FAIL** |

**Subtotal: 0 PASS, 6 PARTIAL, 6 FAIL**

---

## Domain 15: LLM Providers (server/routers/llm-providers.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 93 | `llm.validatePolicy` | protected | 60 | N | Y | N | N | N | N | Calls `LLMPolicyEngine.evaluate()` (L61). Not a gate — informational. | **PARTIAL** |
| 94 | `llm.testProviderConnection` | protected | 126 | N | N | N | N | N | N | Tests provider. No audit. | **FAIL** |
| 95 | `llm.configureProvider` | protected | 146 | N | N | N | N | N | N | Stores credentials. `ctx.user.id` logged to console only (L152). | **FAIL** |
| 96 | `llm.deleteProviderCredentials` | protected | 183 | N | N | N | N | N | N | Deletes credentials. No audit. | **FAIL** |
| 97 | `llm.downloadModel` | protected | 228 | N | N | N | N | N | N | No audit. | **FAIL** |
| 98 | `llm.removeModel` | protected | 235 | N | N | N | N | N | N | No audit. | **FAIL** |

**Subtotal: 0 PASS, 1 PARTIAL, 5 FAIL**

---

## Domain 16: Conversations (server/routers/conversations.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 99 | `conversations.createConversation` | protected | 63 | N | N | N | N | Y | N | `userId: ctx.user.id`. Low governance risk. | **FAIL** |
| 100 | `conversations.addMessage` | protected | 142 | N | N | N | N | N | N | No audit. | **FAIL** |
| 101 | `conversations.deleteConversation` | protected | 184 | N | N | N | N | N | N | No audit. | **FAIL** |

**Subtotal: 0 PASS, 0 PARTIAL, 3 FAIL**

---

## Domain 17: WCP Workflows (server/routers/wcpWorkflows.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 102 | `wcpWorkflows.saveWorkflow` | protected | 20 | N | N | N | N | Y | N | `userId: ctx.user.id`. No governance. | **FAIL** |
| 103 | `wcpWorkflows.deleteWorkflow` | protected | 132 | N | N | N | N | N | N | No audit. | **FAIL** |
| 104 | `wcpWorkflows.createExecution` | protected | 181 | N | N | N | N | Y | N | Async `executeWorkflow()` (L220). No governance gate. | **FAIL** |

**Subtotal: 0 PASS, 0 PARTIAL, 3 FAIL**

---

## Domain 18: Wiki (server/routers/wiki.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 105 | `wiki.createPage` | protected | 82 | N | N | N | N | Y | N | `authorId: ctx.user.id`. No governance. | **FAIL** |
| 106 | `wiki.updatePage` | protected | 109 | N | N | N | N | N | N | No audit. | **FAIL** |
| 107 | `wiki.deletePage` | protected | 119 | N | N | N | N | N | N | No audit. | **FAIL** |
| 108 | `wiki.publishPage` | protected | 129 | N | N | N | N | N | N | No governance gate for publish. | **FAIL** |
| 109 | `wiki.unpublishPage` | protected | 138 | N | N | N | N | N | N | No audit. | **FAIL** |
| 110 | `wiki.revertToRevision` | protected | 161 | N | N | N | N | N | N | No audit. | **FAIL** |

**Subtotal: 0 PASS, 0 PARTIAL, 6 FAIL**

---

## Domain 19: Templates (server/routers/templates.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 111 | `templates.useTemplate` | protected | 57 | N | N | N | N | Y | N | `userId: ctx.user.id` (L80). Creates workflow from template. | **FAIL** |
| 112 | `templates.create` | protected | 105 | N | N | N | N | Y | N | `createdBy: ctx.user.id` (L110). Comment says "admin only" but uses `protectedProcedure`. | **FAIL** |
| 113 | `templates.update` | protected | 128 | N | N | N | N | Y | N | Ownership check (L144). | **FAIL** |
| 114 | `templates.delete` | protected | 160 | N | N | N | N | Y | N | Ownership check (L174). | **FAIL** |

**Subtotal: 0 PASS, 0 PARTIAL, 4 FAIL**

---

## Domain 20: Providers Hub (server/providers/router.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 115 | `providers.create` | protected | 92 | N | N | N | Y | N | N | `getAuditLogger().log(PROVIDER_CONNECT)` (L149). No principal in audit. | **PARTIAL** |
| 116 | `providers.update` | protected | 170 | N | N | N | Y | N | N | `getAuditLogger().log(PROVIDER_UPDATE)` (L185). No principal. | **PARTIAL** |
| 117 | `providers.delete` | protected | 201 | N | N | N | Y | N | N | `getAuditLogger().log(PROVIDER_DELETE)` (L209). No principal. | **PARTIAL** |
| 118 | `providers.testConnection` | protected | 224 | N | N | N | N | N | N | No audit. | **FAIL** |
| 119 | `providers.workspace.assign` | protected | 341 | N | N | N | N | N | N | No audit. | **FAIL** |
| 120 | `providers.workspace.update` | protected | 353 | N | N | N | N | N | N | No audit. | **FAIL** |
| 121 | `providers.workspace.remove` | protected | 364 | N | N | N | N | N | N | No audit. | **FAIL** |
| 122 | `providers.batch.cancelJob` | protected | 410 | N | N | N | N | N | N | No audit. | **FAIL** |
| 123 | `providers.capabilities.update` | protected | 563 | N | N | N | N | N | N | No audit. | **FAIL** |
| 124 | `providers.test.runFullTest` | protected | 600 | N | N | N | N | N | N | No audit. | **FAIL** |

**Subtotal: 0 PASS, 3 PARTIAL, 7 FAIL**

---

## Domain 21: Chat (server/chat/router.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 125 | `chat.sendMessage` | protected | 25 | N | N | N | N | Y | N | Tracks usage (L102). `ctx.user.id` for workspace. | **FAIL** |
| 126 | `chat.deleteConversation` | protected | 134 | N | N | N | N | N | N | No audit. | **FAIL** |
| 127 | `chat.bulkDeleteConversations` | protected | 145 | N | N | N | N | N | N | No audit. | **FAIL** |
| 128 | `chat.sendMessageStream` | protected | 177 | N | N | N | N | Y | N | Tracks usage (L228). | **FAIL** |
| 129 | `chat.saveConversation` | protected | 262 | N | N | N | N | Y | N | `userId: ctx.user.id` (L277). | **FAIL** |
| 130 | `chat.testProvider` | protected | 300 | N | N | N | N | N | N | No audit. | **FAIL** |

**Subtotal: 0 PASS, 0 PARTIAL, 6 FAIL**

---

## Domain 22: Model Downloads (server/models/download-router.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 131 | `modelDownload.create` | protected | 148 | N | N | N | N | Y | N | `userId: ctx.user.id` (L151). | **FAIL** |
| 132 | `modelDownload.updateProgress` | protected | 198 | N | N | N | N | N | N | No audit. | **FAIL** |
| 133 | `modelDownload.updateStatus` | protected | 216 | N | N | N | N | N | N | No audit. | **FAIL** |
| 134 | `modelDownload.pause` | protected | 228 | N | N | N | N | N | N | No audit. | **FAIL** |
| 135 | `modelDownload.resume` | protected | 236 | N | N | N | N | N | N | No audit. | **FAIL** |
| 136 | `modelDownload.cancel` | protected | 244 | N | N | N | N | N | N | No audit. | **FAIL** |
| 137 | `modelDownload.updatePriority` | protected | 257 | N | N | N | N | N | N | No audit. | **FAIL** |
| 138 | `modelDownload.delete` | protected | 265 | N | N | N | N | N | N | No audit. | **FAIL** |
| 139 | `modelDownload.addToCatalog` | protected | 394 | N | N | N | N | N | N | No audit. | **FAIL** |

**Subtotal: 0 PASS, 0 PARTIAL, 9 FAIL**

---

## Domain 23: Model Benchmarks (server/models/benchmark-router.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 140 | `modelBenchmark.runBenchmark` | protected | 24 | N | N | N | N | Y | N | `ctx.user.id` passed to service (L25). | **FAIL** |

**Subtotal: 0 PASS, 0 PARTIAL, 1 FAIL**

---

## Domain 24: Model Versions (server/models/version-router.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 141 | `modelVersion.create` | protected | 46 | N | N | N | N | N | N | No principal. No audit. | **FAIL** |
| 142 | `modelVersion.setLatest` | protected | 54 | N | N | N | N | N | N | No audit. | **FAIL** |
| 143 | `modelVersion.deprecate` | protected | 62 | N | N | N | N | N | N | No audit. | **FAIL** |
| 144 | `modelVersion.updateChangelog` | protected | 75 | N | N | N | N | N | N | No audit. | **FAIL** |
| 145 | `modelVersion.delete` | protected | 83 | N | N | N | N | N | N | No audit. | **FAIL** |

**Subtotal: 0 PASS, 0 PARTIAL, 5 FAIL**

---

## Domain 25: Documents RAG (server/documents/documents-router.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 146 | `documents.uploadFile` | protected | 28 | N | N | N | N | N | N | No principal. No audit. | **FAIL** |
| 147 | `documents.ingest` | protected | 71 | N | N | N | N | N | N | No audit. | **FAIL** |

**Subtotal: 0 PASS, 0 PARTIAL, 2 FAIL**

---

## Domain 26: Documents CRUD (server/documents/documents-crud-router.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 148 | `documentsCrud.create` | protected | 48 | N | N | N | N | Y | N | `uploadedBy: ctx.user.id` (L55). Workspace access check. | **FAIL** |
| 149 | `documentsCrud.update` | protected | 69 | N | N | N | N | N | N | Workspace access check. No audit. | **FAIL** |
| 150 | `documentsCrud.delete` | protected | 85 | N | N | N | N | N | N | Workspace access check. No audit. | **FAIL** |
| 151 | `documentsCrud.upload` | protected | 108 | N | N | N | N | Y | N | `ctx.user.id` (L114). Workspace access check. | **FAIL** |
| 152 | `documentsCrud.bulkDelete` | protected | 119 | N | N | N | N | N | N | No workspace check. No audit. | **FAIL** |

**Subtotal: 0 PASS, 0 PARTIAL, 5 FAIL**

---

## Domain 27: Automation (server/automation/automation-router.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 153 | `automation.createWorkflow` | protected | 40 | N | N | N | N | Y | N | `userId: ctx.user.id` (L62). Validates workflow structure. | **FAIL** |
| 154 | `automation.updateWorkflow` | protected | 113 | N | N | N | N | Y | N | `ctx.user.id` (L131). Validates structure. | **FAIL** |
| 155 | `automation.deleteWorkflow` | protected | 139 | N | N | N | N | Y | N | `ctx.user.id` (L140). | **FAIL** |
| 156 | `automation.publishWorkflow` | protected | 153 | N | N | N | N | Y | N | `ctx.user.id` (L156). Creates immutable version. No governance gate. | **FAIL** |
| 157 | `automation.rollbackToVersion` | protected | 180 | N | N | N | N | Y | N | `ctx.user.id` (L184). | **FAIL** |
| 158 | `automation.executeWorkflow` | protected | 199 | N | N | N | N | Y | N | `ctx.user.id` (L203). Runs workflow with no governance gate. | **FAIL** |
| 159 | `automation.cancelExecution` | protected | 366 | N | N | N | N | N | N | No audit. | **FAIL** |

**Subtotal: 0 PASS, 0 PARTIAL, 7 FAIL**

---

## Domain 28: Secrets (server/secrets/secrets-router.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 160 | `secrets.create` | protected | 24 | N | N | N | Y | Y | N | `getAuditLogger().log(SECRET_CREATE)` (L31). `actor_id: ctx.user.id` (L32). | **PARTIAL** |
| 161 | `secrets.update` | protected | 69 | N | N | N | Y | Y | N | `getAuditLogger().log(SECRET_UPDATE)` (L74). `actor_id: ctx.user.id`. | **PARTIAL** |
| 162 | `secrets.delete` | protected | 89 | N | N | N | Y | Y | N | `getAuditLogger().log(SECRET_DELETE)` (L91). `actor_id: ctx.user.id`. | **PARTIAL** |

**Subtotal: 0 PASS, 3 PARTIAL, 0 FAIL**

---

## Domain 29: Inference (server/inference/inference-router.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 163 | `inference.loadModel` | protected | 24 | N | N | N | N | N | N | Loads model into memory. No audit. | **FAIL** |
| 164 | `inference.unloadModel` | protected | 43 | N | N | N | N | N | N | No audit. | **FAIL** |
| 165 | `inference.infer` | protected | 65 | N | N | N | N | N | N | Runs inference. No audit. | **FAIL** |

**Subtotal: 0 PASS, 0 PARTIAL, 3 FAIL**

---

## Domain 30: Embeddings (server/embeddings/embeddings-router.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 166 | `embeddings.generate` | protected | 20 | N | N | N | N | N | N | No audit. | **FAIL** |
| 167 | `embeddings.clearCache` | protected | 46 | N | N | N | N | N | N | No audit. | **FAIL** |

**Subtotal: 0 PASS, 0 PARTIAL, 2 FAIL**

---

## Domain 31: Vector DB (server/vectordb/vectordb-router.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 168 | `vectordb.createCollection` | protected | 21 | N | N | N | N | N | N | No audit. | **FAIL** |
| 169 | `vectordb.deleteCollection` | protected | 36 | N | N | N | N | N | N | No audit. | **FAIL** |
| 170 | `vectordb.insert` | protected | 60 | N | N | N | N | N | N | No audit. | **FAIL** |

**Subtotal: 0 PASS, 0 PARTIAL, 3 FAIL**

---

## Domain 32: Hardware (server/hardware/hardware-router.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 171 | `hardware.clearCache` | protected | 74 | N | N | N | N | N | N | Clears model cache. No audit. | **FAIL** |

**Subtotal: 0 PASS, 0 PARTIAL, 1 FAIL**

---

## Domain 33: System (server/_core/systemRouter.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 172 | `system.notifyOwner` | admin | 23 | N | N | N | N | N | N | Admin-only notification. No audit. | **FAIL** |

**Subtotal: 0 PASS, 0 PARTIAL, 1 FAIL**

---

## Domain 34: Governance Engine (server/governance/router.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 173 | `governance.stageTransition` | protected | 539 | N | Y | Y | Y | Y | Y | Calls `isFrozen()` (L562,L568). `executeStageTransition()` (L575). Throws CONFLICT (L578). `ctx.user.id` (L559). | **PASS** |
| 174 | `governance.driftToggle` | admin | 640 | N | N | N | N | N | N | Starts/stops drift detection. No audit of who toggled. | **FAIL** |
| 175 | `governance.unfreezeSubject` | admin | 666 | N | N | N | N | N | N | Unfreezes subject. No audit of who unfroze. | **FAIL** |

**Subtotal: 1 PASS, 0 PARTIAL, 2 FAIL**

---

## Domain 35: Inline Mutations (server/routers.ts)

| # | Entrypoint | Auth | Lines | policyGate | policyEval | Freeze | Audit | Principal | FailClosed | Evidence | Verdict |
|---|-----------|------|-------|------------|------------|--------|-------|-----------|------------|----------|---------|
| 176 | `auth.logout` | public | 82–86 | N | N | N | N | N | N | Clears cookie. Public procedure. | **FAIL** |
| 177 | `workspaces.create` | protected | 98–115 | N | N | N | N | Y | N | `ownerId: ctx.user.id` (L112). | **FAIL** |
| 178 | `workspaces.update` | protected | 127–147 | N | N | N | N | N | N | Workspace access check (L140). No audit. | **FAIL** |
| 179 | `workspaces.updateRoutingProfile` | protected | 167–192 | N | N | N | N | N | N | Workspace access check (L184). No audit. | **FAIL** |
| 180 | `workspaces.delete` | protected | 194–203 | N | N | N | N | Y | N | Ownership check (L198). No audit. | **FAIL** |
| 181 | `models.create` | protected | 226–243 | N | N | N | N | N | N | No principal. No audit. | **FAIL** |
| 182 | `models.update` | protected | 245–260 | N | N | N | N | N | N | No audit. | **FAIL** |
| 183 | `models.delete` | protected | 262–267 | N | N | N | N | N | N | No audit. | **FAIL** |
| 184 | `models.startDownload` | protected | 270–306 | N | N | N | N | N | N | Simulated download (setTimeout). No audit. | **FAIL** |

**Subtotal: 0 PASS, 0 PARTIAL, 9 FAIL**

---

## Grand Totals

| Verdict | Count | % |
|---------|-------|---|
| **PASS** | 4 | 2.2% |
| **PARTIAL** | 34 | 18.5% |
| **FAIL** | 146 | 79.3% |
| **Total** | 184 | 100% |

**Checksum: 4 + 34 + 146 = 184 ✓**

## Verdict Legend

- **PASS**: Calls `evaluateStageReview` or equivalent, throws on failure (fail-closed), logs audit with real principal.
- **PARTIAL**: Has audit logging OR policy evaluation OR principal attribution, but missing one or more of: fail-closed enforcement, real principal, freeze check.
- **FAIL**: No governance gate, no policy evaluation, no meaningful audit logging. Mutation executes unconditionally for any authenticated user.
