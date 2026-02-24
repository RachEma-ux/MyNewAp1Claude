# Governance Page — Workspace #2

**Timestamp:** 2026-02-24T17:40:41.179Z
**Overall Status:** Non-Compliant

---

## System Health

| # | Check | Status | Details | Category |
|---|-------|--------|---------|----------|
| 1 | Policy Engine Availability | PASS | OPA endpoint configured | architecture |
| 2 | Orchestrator Boundary | PASS | Orchestrator boundary enforcement active | architecture |
| 3 | Audit Logging | PASS | Governance audit logger operational | audit |
| 4 | RBAC Enforcement | PASS | Role-based access control active via tRPC middleware | rbac |
| 5 | Secrets Externalized | PASS | No hardcoded secret patterns detected | secrets |
| 6 | Startup Conditions | FAIL | Errors: COOKIE_SECRET or JWT_SECRET required in production for session security | deployment |
| 7 | Governance Log Activity | PASS | 5 recent governance events logged | audit |
| 8 | Audit Log Activity | PASS | 10 recent audit events | audit |
| 9 | Lifecycle Guard | PASS | Lifecycle stage validation operational (submit -> register -> validate -> publish -> catalog) | lifecycle |
| 10 | Publication Gate | PASS | Triple validation rule active (compliance matrix + YAML spec + admin checklist) | lifecycle |
| 11 | Key Rotation | PASS | Key rotation service available | secrets |
| 12 | Environment Profile | WARN | NODE_ENV=production, DEV_MODE=true | deployment |

**Result:** 10 passed, 1 failed, 1 warning

---

## Risk Report

**Publication Blocked:** Yes
**Block Reason:** 0 Critical and 1 High findings block lifecycle progression

### Findings

| ID | Severity | Category | Title | Description | Target |
|----|----------|----------|-------|-------------|--------|
| RF-0012 | HIGH | missing_rbac | Auth bypass in production | DEV_MODE=true bypasses authentication in production | deployment |

### Summary

| Critical | High | Medium | Low | Total |
|----------|------|--------|-----|-------|
| 0 | 1 | 0 | 0 | 1 |

---

## Governance Metrics

| Metric | Value |
|--------|-------|
| agent_starts_allowed_total | 0 |
| agent_starts_denied_total | 0 |
| agent_invalidation_events_total | 0 |
| policy_reload_success_total | 0 |
| policy_reload_failure_total | 0 |
| promotion_attempts_total | 0 |
| promotion_denies_total | 0 |
| architecture_validation_total | 12 |
| architecture_violations_total | 12 |
| governance_engine_init_total | 1 |

---

## Recommendations

- Consider disabling DEV_MODE in production for full auth enforcement

---

## Action Registry

**Total Registered Actions:** 228

### Risk Level Breakdown

| Risk | Count | Description |
|------|-------|-------------|
| R1 | 68 | Low risk, no approval or evidence needed |
| R2 | 73 | Moderate risk, no approval needed |
| R3 | 62 | Above threshold, approval required (role_any), evidence typically required |
| R4 | 21 | High risk, approval required (role_any or dual_control), evidence required |
| R5 | 4 | Critical risk, dual_control approval, extensive evidence |

---

## Governed Actions by Domain

### Auth (1 action)

| Action Key | Risk | Approval | Evidence | Capability |
|------------|------|----------|----------|------------|
| auth.logout | R1 | none | - | auth.session |

### Workspace (4 actions)

| Action Key | Risk | Approval | Evidence | Capability |
|------------|------|----------|----------|------------|
| workspace.create | R1 | none | - | workspace.manage |
| workspace.update | R1 | none | - | workspace.manage |
| workspace.updateRoutingProfile | R2 | none | - | workspace.manage |
| workspace.delete | R3 | role_any | reason | workspace.manage |

### Model (22 actions)

| Action Key | Risk | Approval | Evidence | Capability |
|------------|------|----------|----------|------------|
| model.create | R1 | none | - | model.manage |
| model.update | R1 | none | - | model.manage |
| model.delete | R2 | none | - | model.manage |
| model.startDownload | R2 | none | - | model.manage |
| modelDownload.start | R2 | none | - | model.manage |
| modelDownload.cancel | R1 | none | - | model.manage |
| modelDownload.pause | R1 | none | - | model.manage |
| modelDownload.resume | R1 | none | - | model.manage |
| modelDownload.retry | R1 | none | - | model.manage |
| modelDownload.delete | R2 | none | - | model.manage |
| modelDownload.cleanup | R2 | none | - | model.manage |
| modelDownload.convert | R2 | none | - | model.manage |
| modelBenchmark.run | R1 | none | - | model.manage |
| modelVersion.create | R2 | none | - | model.manage |
| modelVersion.activate | R3 | role_any | reason | model.manage |
| modelVersion.archive | R2 | none | - | model.manage |
| modelVersion.delete | R2 | none | - | model.manage |
| modelVersion.rollback | R3 | role_any | reason | model.manage |

### Provider (20 actions)

| Action Key | Risk | Approval | Evidence | Capability |
|------------|------|----------|----------|------------|
| provider.create | R3 | role_any | reason | provider.manage |
| provider.update | R2 | none | - | provider.manage |
| provider.delete | R3 | role_any | reason | provider.manage |
| provider.testConnection | R1 | none | - | provider.manage |
| provider.enableModel | R2 | none | - | provider.manage |
| provider.disableModel | R2 | none | - | provider.manage |
| provider.setDefault | R2 | none | - | provider.manage |
| provider.updateModelConfig | R2 | none | - | provider.manage |
| provider.updateRateLimits | R2 | none | - | provider.manage |
| provider.resetStats | R1 | none | - | provider.manage |
| provider.refreshModels | R1 | none | - | provider.manage |
| provider.batchToggle | R2 | none | - | provider.manage |
| providerConnection.test | R1 | none | - | provider.manage |
| providerConnection.create | R3 | role_any | reason | provider.manage |
| providerConnection.validateAndStore | R3 | role_any | reason | provider.manage |
| providerConnection.activate | R3 | role_any | - | provider.manage |
| providerConnection.disable | R2 | none | - | provider.manage |
| providerConnection.healthCheck | R1 | none | - | provider.manage |
| providerConnection.rotate | R4 | role_any | reason, payload_hash | provider.manage |
| providerConnection.delete | R3 | role_any | reason | provider.manage |

### Chat (6 actions)

| Action Key | Risk | Approval | Evidence | Capability |
|------------|------|----------|----------|------------|
| chat.send | R1 | none | - | chat.use |
| chat.createConversation | R1 | none | - | chat.use |
| chat.clearConversation | R1 | none | - | chat.use |
| chat.deleteConversation | R1 | none | - | chat.use |
| chat.updateSettings | R1 | none | - | chat.use |
| chat.generateTitle | R1 | none | - | chat.use |

### Conversation (3 actions)

| Action Key | Risk | Approval | Evidence | Capability |
|------------|------|----------|----------|------------|
| conversation.create | R1 | none | - | chat.use |
| conversation.update | R1 | none | - | chat.use |
| conversation.delete | R1 | none | - | chat.use |

### Agent (19 actions)

| Action Key | Risk | Approval | Evidence | Capability |
|------------|------|----------|----------|------------|
| agent.create | R2 | none | - | agent.manage |
| agent.update | R2 | none | - | agent.manage |
| agent.delete | R3 | role_any | reason | agent.manage |
| agent.runDriftDetection | R2 | none | - | agent.manage |
| agent.exportCompliance | R2 | none | - | agent.manage |
| agent.autoRemediate | R3 | role_any | reason, plan | agent.manage |
| agent.deployTemplate | R3 | role_any | reason | agent.manage |
| agent.promote | R4 | role_any | reason, diff | agent.manage |
| agent.register | R2 | none | - | agent.manage |
| agent.updateConfig | R2 | none | - | agent.manage |
| agent.admitToSandbox | R3 | role_any | reason | agent.manage |
| agent.controlPlane.promote | R4 | dual_control | reason, diff, tests_passed | agent.manage |
| agent.disable | R3 | role_any | reason | agent.manage |
| agent.invoke | R2 | none | - | agent.manage |
| agent.diff | R1 | none | - | agent.manage |
| agentPromotion.createRequest | R3 | role_any | reason, plan | agent.manage |
| agentPromotion.approve | R4 | dual_control | reason | agent.manage |
| agentPromotion.reject | R2 | none | reason | agent.manage |
| agentPromotion.execute | R4 | role_any | reason, tests_passed | agent.manage |

### Document (7 actions)

| Action Key | Risk | Approval | Evidence | Capability |
|------------|------|----------|----------|------------|
| document.create | R1 | none | - | document.manage |
| document.update | R1 | none | - | document.manage |
| document.delete | R2 | none | - | document.manage |
| document.upload | R2 | none | - | document.manage |
| document.bulkDelete | R3 | role_any | reason | document.manage |
| document.process | R2 | none | - | document.manage |
| document.reprocess | R2 | none | - | document.manage |

### Automation (22 actions)

| Action Key | Risk | Approval | Evidence | Capability |
|------------|------|----------|----------|------------|
| workflow.create | R2 | none | - | workflow.manage |
| workflow.update | R2 | none | - | workflow.manage |
| workflow.delete | R3 | role_any | reason | workflow.manage |
| workflow.publish | R3 | role_any | reason | workflow.manage |
| workflow.rollback | R3 | role_any | reason | workflow.manage |
| workflow.execute | R2 | none | - | workflow.manage |
| workflow.cancel | R2 | none | - | workflow.manage |
| trigger.create | R2 | none | - | workflow.manage |
| trigger.approve | R3 | role_any | reason | workflow.manage |
| trigger.reject | R2 | none | reason | workflow.manage |
| trigger.delete | R3 | role_any | reason | workflow.manage |
| action.create | R2 | none | - | workflow.manage |
| action.approve | R3 | role_any | reason | workflow.manage |
| action.reject | R2 | none | reason | workflow.manage |
| action.delete | R3 | role_any | reason | workflow.manage |
| template.create | R1 | none | - | workflow.manage |
| template.update | R1 | none | - | workflow.manage |
| template.delete | R2 | none | - | workflow.manage |
| template.duplicate | R1 | none | - | workflow.manage |
| wcpWorkflow.create | R2 | none | - | workflow.manage |
| wcpWorkflow.update | R2 | none | - | workflow.manage |
| wcpWorkflow.delete | R3 | role_any | reason | workflow.manage |

### Protocol (4 actions)

| Action Key | Risk | Approval | Evidence | Capability |
|------------|------|----------|----------|------------|
| protocol.create | R2 | none | - | workflow.manage |
| protocol.update | R2 | none | - | workflow.manage |
| protocol.delete | R3 | role_any | reason | workflow.manage |
| protocol.activate | R3 | role_any | - | workflow.manage |

### Secret (3 actions)

| Action Key | Risk | Approval | Evidence | Capability |
|------------|------|----------|----------|------------|
| secret.create | R3 | role_any | reason | secret.manage |
| secret.update | R3 | role_any | reason | secret.manage |
| secret.delete | R3 | role_any | reason | secret.manage |

### Key Rotation (13 actions)

| Action Key | Risk | Approval | Evidence | Capability |
|------------|------|----------|----------|------------|
| keyRotation.createKey | R3 | role_any | reason | secret.manage |
| keyRotation.activateKey | R4 | dual_control | reason, payload_hash | secret.manage |
| keyRotation.revokeKey | R4 | dual_control | reason | secret.manage |
| keyRotation.createVersion | R3 | role_any | reason | secret.manage |
| keyRotation.activateVersion | R4 | dual_control | reason | secret.manage |
| keyRotation.deprecateVersion | R3 | role_any | reason | secret.manage |
| keyRotation.createRotation | R4 | dual_control | reason, plan | secret.manage |
| keyRotation.completeRotation | R4 | role_any | reason, tests_passed | secret.manage |
| keyRotation.failRotation | R3 | none | reason | secret.manage |
| keyRotation.rollbackRotation | R4 | dual_control | reason | secret.manage |
| keyRotation.createPolicy | R3 | role_any | reason | secret.manage |
| keyRotation.activatePolicy | R3 | role_any | - | secret.manage |
| keyRotation.deactivatePolicy | R3 | role_any | - | secret.manage |

### Policy (5 actions)

| Action Key | Risk | Approval | Evidence | Capability |
|------------|------|----------|----------|------------|
| policy.create | R3 | role_any | reason | policy.manage |
| policy.update | R3 | role_any | reason, diff | policy.manage |
| policy.delete | R3 | role_any | reason | policy.manage |
| policy.activate | R3 | role_any | reason | policy.manage |
| policy.createFromTemplate | R3 | role_any | reason | policy.manage |

### Wiki (6 actions)

| Action Key | Risk | Approval | Evidence | Capability |
|------------|------|----------|----------|------------|
| wiki.create | R1 | none | - | wiki.manage |
| wiki.update | R1 | none | - | wiki.manage |
| wiki.delete | R2 | none | - | wiki.manage |
| wiki.reorder | R1 | none | - | wiki.manage |
| wiki.move | R1 | none | - | wiki.manage |
| wiki.addTag | R1 | none | - | wiki.manage |

### LLM Engine (28 actions)

| Action Key | Risk | Approval | Evidence | Capability |
|------------|------|----------|----------|------------|
| llm.create | R2 | none | - | llm.manage |
| llm.update | R2 | none | - | llm.manage |
| llm.delete | R3 | role_any | reason | llm.manage |
| llm.activate | R3 | role_any | - | llm.manage |
| llm.benchmark | R1 | none | - | llm.manage |
| llm.updateCapabilities | R2 | none | - | llm.manage |
| llm.updatePricing | R2 | none | - | llm.manage |
| llm.setDefault | R2 | none | - | llm.manage |
| llm.configureRouting | R2 | none | - | llm.manage |
| llmProvider.register | R3 | role_any | reason | llm.manage |
| llmProvider.configureProvider | R3 | role_any | reason | llm.manage |
| llmProvider.deleteCredentials | R3 | role_any | reason | llm.manage |
| llmProvider.updateStatus | R2 | none | - | llm.manage |
| llmProvider.test | R1 | none | - | llm.manage |
| llmProvider.sync | R2 | none | - | llm.manage |
| llmCreation.create | R3 | role_any | reason, plan | llm.manage |
| llmCreation.update | R2 | none | - | llm.manage |
| llmCreation.delete | R3 | role_any | reason | llm.manage |
| llmCreation.startTraining | R4 | role_any | reason, plan, sources | llm.manage |
| llmCreation.cancelTraining | R2 | none | reason | llm.manage |
| llmCreation.startQuantization | R3 | role_any | reason | llm.manage |
| llmCreation.updateDataset | R2 | none | - | llm.manage |
| llmCreation.deleteDataset | R2 | none | - | llm.manage |
| llmCreation.uploadDataset | R2 | none | - | llm.manage |
| llmCreation.createEvaluation | R2 | none | - | llm.manage |
| llmCreation.deleteEvaluation | R2 | none | - | llm.manage |
| llmCreation.addCheckpoint | R1 | none | - | llm.manage |
| llmCreation.removeCheckpoint | R1 | none | - | llm.manage |

### Deploy (3 actions)

| Action Key | Risk | Approval | Evidence | Capability |
|------------|------|----------|----------|------------|
| deploy.trigger | R4 | role_any | reason, signed_commit | deploy.manage |
| deploy.cancel | R3 | role_any | reason | deploy.manage |
| deploy.rerun | R4 | role_any | reason | deploy.manage |

### Catalog (24 actions)

| Action Key | Risk | Approval | Evidence | Capability |
|------------|------|----------|----------|------------|
| catalog.discover | R2 | none | - | catalog.manage |
| catalog.submitFromDiscovery | R3 | role_any | reason | catalog.manage |
| catalog.create | R3 | role_any | reason | catalog.manage |
| catalog.update | R2 | none | - | catalog.manage |
| catalog.delete | R3 | role_any | reason | catalog.manage |
| catalog.validate | R3 | role_any | probe_results | catalog.manage |
| catalog.approve | R4 | dual_control | reason | catalog.manage |
| catalog.reject | R2 | none | reason | catalog.manage |
| catalog.activate | R4 | role_any | reason, tests_passed | catalog.manage |
| catalog.publish | R5 | dual_control | reason, diff, tests_passed, signed_commit | catalog.manage |
| catalog.syncProviders | R3 | role_any | - | catalog.manage |
| catalog.syncRegistry | R3 | role_any | - | catalog.manage |
| catalog.recall | R5 | dual_control | reason | catalog.manage |
| catalog.classify | R2 | none | - | catalog.manage |
| catalog.autoClassify | R2 | none | - | catalog.manage |
| catalog.bulkAutoClassify | R2 | none | - | catalog.manage |
| catalogImport.importUrl | R3 | role_any | sources | catalog.manage |
| catalogImport.retryAll | R2 | none | - | catalog.manage |
| catalogImport.resolveConflict | R3 | role_any | reason | catalog.manage |
| discoveryOps.markInReview | R2 | none | - | catalog.manage |
| discoveryOps.reject | R3 | role_any | reason | catalog.manage |
| discoveryOps.accept | R3 | role_any | reason | catalog.manage |
| discoveryOps.batchAutoPromote | R3 | role_any | - | catalog.manage |
| discoveryOps.cleanup | R3 | role_any | reason | catalog.manage |

### Embedding (2 actions)

| Action Key | Risk | Approval | Evidence | Capability |
|------------|------|----------|----------|------------|
| embedding.generate | R1 | none | - | embedding.manage |
| embedding.clearCache | R1 | none | - | embedding.manage |

### Vector DB (3 actions)

| Action Key | Risk | Approval | Evidence | Capability |
|------------|------|----------|----------|------------|
| vectordb.createCollection | R2 | none | - | vectordb.manage |
| vectordb.deleteCollection | R3 | role_any | reason | vectordb.manage |
| vectordb.upsertPoints | R2 | none | - | vectordb.manage |

### Inference (3 actions)

| Action Key | Risk | Approval | Evidence | Capability |
|------------|------|----------|----------|------------|
| inference.run | R1 | none | - | inference.use |
| inference.batch | R2 | none | - | inference.use |
| inference.hybrid | R2 | none | - | inference.use |

### Hardware (1 action)

| Action Key | Risk | Approval | Evidence | Capability |
|------------|------|----------|----------|------------|
| hardware.clearCache | R1 | none | - | system.manage |

### System (1 action)

| Action Key | Risk | Approval | Evidence | Capability |
|------------|------|----------|----------|------------|
| system.updateSetting | R2 | none | - | system.manage |

### Governance (3 actions)

| Action Key | Risk | Approval | Evidence | Capability |
|------------|------|----------|----------|------------|
| governance.stageTransition | R4 | role_any | reason | governance.manage |
| governance.driftToggle | R3 | role_any | - | governance.manage |
| governance.unfreezeSubject | R4 | dual_control | reason | governance.manage |

### PMT — Project Management (8 actions)

| Action Key | Risk | Approval | Evidence | Capability |
|------------|------|----------|----------|------------|
| pmt.project.create | R1 | none | - | pmt.manage |
| pmt.project.update | R1 | none | - | pmt.manage |
| pmt.project.delete | R2 | none | - | pmt.manage |
| pmt.task.create | R1 | none | - | pmt.manage |
| pmt.task.update | R1 | none | - | pmt.manage |
| pmt.task.delete | R2 | none | - | pmt.manage |
| pmt.dependency.add | R1 | none | - | pmt.manage |
| pmt.dependency.remove | R1 | none | - | pmt.manage |

### Knowledge (7 actions)

| Action Key | Risk | Approval | Evidence | Capability |
|------------|------|----------|----------|------------|
| knowledge.document.create | R1 | none | - | knowledge.manage |
| knowledge.document.update | R1 | none | - | knowledge.manage |
| knowledge.document.delete | R2 | none | - | knowledge.manage |
| knowledge.chunk.create | R1 | none | - | knowledge.manage |
| knowledge.chunk.update | R1 | none | - | knowledge.manage |
| knowledge.decision.create | R1 | none | - | knowledge.manage |
| knowledge.decision.update | R1 | none | - | knowledge.manage |

### Agents — Workspace Orchestration (6 actions)

| Action Key | Risk | Approval | Evidence | Capability |
|------------|------|----------|----------|------------|
| agents.workspace.create | R2 | none | - | agents.manage |
| agents.workspace.update | R2 | none | - | agents.manage |
| agents.workspace.delete | R3 | role_any | reason | agents.manage |
| agents.run.request | R3 | role_any | - | agents.manage |
| agents.run.execute | R3 | none | - | agents.manage |
| agents.run.complete | R2 | none | - | agents.manage |

### Collaboration (6 actions)

| Action Key | Risk | Approval | Evidence | Capability |
|------------|------|----------|----------|------------|
| collaboration.thread.create | R1 | none | - | collaboration.manage |
| collaboration.thread.update | R1 | none | - | collaboration.manage |
| collaboration.thread.delete | R2 | none | - | collaboration.manage |
| collaboration.message.create | R1 | none | - | collaboration.manage |
| collaboration.message.update | R1 | none | - | collaboration.manage |
| collaboration.message.delete | R2 | none | - | collaboration.manage |

### Module Management (2 actions)

| Action Key | Risk | Approval | Evidence | Capability |
|------------|------|----------|----------|------------|
| module.setEnabled | R3 | role_any | reason | module.manage |
| module.seed | R2 | none | - | module.manage |
