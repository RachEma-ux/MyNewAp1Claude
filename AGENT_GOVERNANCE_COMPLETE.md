# Agent Governance Module - Complete Implementation

**Version:** 1.0.0  
**Date:** January 3, 2026  
**Status:** Production-Ready

---

## Executive Summary

The Agent Governance Module is an enterprise-grade system for managing AI agents across their entire lifecycle, from sandbox development to governed production deployment. It implements policy-as-code, cryptographic proof bundles, admission control, and comprehensive observability.

**Key Features:**
- 🔒 **Policy-as-Code** - OPA-based governance with hot reload
- 🛡️ **Admission Control** - 7-layer validation prevents tampered/expired agents
- 📜 **Proof Bundles** - Cryptographic signatures ensure agent integrity
- 🔄 **Revalidation** - Automatic agent revalidation on policy changes
- 📊 **Observability** - Structured logging, Prometheus metrics, audit trails
- 🎯 **7 Creation Modes** - Template, scratch, clone, workflow, conversation, event, import

---

## Architecture Overview

### Three-Tier Governance Model

```
┌─────────────────────────────────────────────────────────────┐
│                     SANDBOX (Development)                    │
│  - No external calls                                         │
│  - No persistent writes                                      │
│  - Full testing environment                                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ Promotion (OPA Evaluation)
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  GOVERNED (Production)                       │
│  - Cryptographic proof bundle                                │
│  - Policy hash + spec hash + signature                       │
│  - Admission control enforced                                │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ Policy Hot Reload
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              GOVERNED_INVALIDATED (Quarantine)               │
│  - Agent fails new policy                                    │
│  - Cannot start                                              │
│  - Requires remediation                                      │
└─────────────────────────────────────────────────────────────┘
```

### Core Components

1. **Agent Service** (`server/services/agentService.ts`)
   - Sandbox creation and management
   - Agent CRUD operations
   - Containment validation

2. **Policy Service** (`server/services/policyService.ts`)
   - Policy snapshot management
   - Hot reload with versioning
   - Agent revalidation triggers

3. **Promotion Service** (`server/services/promotionService.ts`)
   - OPA policy evaluation
   - Proof bundle generation
   - HMAC-SHA256 signing

4. **Runtime Selector** (`server/services/runtimeSelector.ts`)
   - Embedded vs external orchestrator
   - Runtime configuration management

5. **Interceptor Framework** (`modules/agents/interceptors/`)
   - Admission control chain
   - 7-layer validation checks
   - Fail-closed behavior

6. **Revalidation Workflow** (`server/services/revalidationWorkflow.ts`)
   - Policy change detection
   - Bulk agent revalidation
   - Status persistence

7. **Observability** (`server/services/governance*.ts`)
   - Structured logging with decision codes
   - Prometheus-style metrics
   - Audit trail

---

## Implementation Status

### ✅ Phase 0: Project Scaffolding
- [x] Module structure (`modules/agents/`)
- [x] Domain types and interfaces
- [x] Database schema (agent_specs, agent_proofs, policy_versions)

### ✅ Phase 1: Backend Services
- [x] Agent Service (createSandbox, updateSandbox, listAgents)
- [x] Policy Service (fetchSnapshot, hotReload, revalidate)
- [x] Promotion Service (promote with OPA evaluation)
- [x] Runtime Selector (embedded/external)

### ✅ Phase 2: Embedded Orchestrator Runtime
- [x] Interceptor Framework with fail-closed behavior
- [x] Admission Interceptor (7 validation checks)
- [x] Policy Registry (hot reload support)
- [x] Embedded Runtime implementation

### ✅ Phase 3: External Orchestrator Support
- [x] External Runtime client
- [x] REST API integration
- [x] Retry/backoff logic
- [x] TLS/mTLS support structure

### ✅ Phase 4: OPA Policy Evaluation
- [x] Promotion policy (`modules/agents/policies/promotion.rego`)
- [x] Policy evaluation framework
- [x] Deny rules with reasons
- [x] Budget/temperature/capability validation

### ✅ Phase 5: UI Components
- [x] Agent creation wizard (7 modes)
- [x] Agent editor page (Anatomy, Governance, Diff, History tabs)
- [x] Agents list page with search and bulk operations
- [x] Promotion workflow UI
- [x] Drift detection dashboard
- [x] Compliance export page

### ✅ Phase 6: Revalidation Workflows
- [x] Revalidation workflow service
- [x] Governance state persistence
- [x] Policy hot reload triggers
- [x] UI feedback loop

### ✅ Phase 7: Observability & Audit
- [x] Structured logging (governanceLogger.ts)
- [x] Decision code taxonomy
- [x] Prometheus metrics (governanceMetrics.ts)
- [x] Audit trail structure

### ✅ Phase 8: PKI/mTLS Security
- [x] TLS configuration structure
- [x] Certificate reference system
- [x] mTLS support in External Runtime

### ✅ Phase 9: Comprehensive Testing
- [x] Integration test suite (55+ tests)
- [x] Admission control tests
- [x] Promotion workflow tests
- [x] Policy hot reload tests
- [x] Full lifecycle tests

### ✅ Phase 10: Documentation
- [x] Architecture documentation
- [x] API reference
- [x] Implementation guide
- [x] Troubleshooting guide

---

## API Reference

### Agent Service

```typescript
// Create sandbox agent
const agent = await createSandbox({
  workspaceId: string,
  name: string,
  version: string,
  description: string,
  roleClass: "compliance" | "analysis" | "ideation",
  anatomy: AgentAnatomy,
});

// Update sandbox agent
const updated = await updateSandbox(agentId, updates);

// List agents
const agents = await listAgents(workspaceId, filters);
```

### Promotion Service

```typescript
// Promote sandbox to governed
const governed = await promoteToGoverned({
  agentId: number,
  actorId: string,
  actorRole: string,
  orgLimits: { maxMonthlyBudgetUsd: number },
});
```

### Policy Service

```typescript
// Fetch policy snapshot
const snapshot = await fetchSnapshot(workspaceId);

// Hot reload policy
const result = await hotReload({
  workspaceId: string,
  bundle: PolicyBundle,
  actor: string,
});

// Revalidate agents
const result = await executeRevalidation(policyHash);
```

### Observability

```typescript
// Log admission decision
getGovernanceLogger().logAdmission({
  agentId,
  workspaceId,
  decision: "allow" | "deny",
  reason,
  errorCodes,
});

// Increment metrics
getGovernanceMetrics().inc("agent_starts_allowed_total");

// Export Prometheus metrics
const metrics = getGovernanceMetrics().export();
```

---

## Admission Control

### 7-Layer Validation

1. **Proof Bundle Exists** - Governed agents must have cryptographic proof
2. **Spec Hash Match** - Agent spec must match signed hash (detects tampering)
3. **Policy Hash Match** - Policy must match signed hash (detects policy drift)
4. **Signer Not Revoked** - Signing authority must be valid
5. **Signature Valid** - HMAC-SHA256 signature must verify
6. **Not Expired** - Sandbox agents must not exceed expiry time
7. **Containment Valid** - Sandbox agents must have external_calls=false, persistent_writes=false

**Fail-Closed Behavior:** Any validation failure denies agent start.

---

## Policy-as-Code

### OPA Promotion Policy

Located at `modules/agents/policies/promotion.rego`

**Checks:**
- User authorization (agent_admin or policy_admin role)
- Anatomy completeness (MVA - Minimum Viable Anatomy)
- Sandbox containment (no external calls, no persistent writes)
- Capabilities validation (at least one capability)
- Temperature limits by role class:
  - Compliance: ≤ 0.3
  - Analysis: ≤ 0.7
  - Ideation: ≤ 1.0
- Budget validation (within org limits)

**Output:**
```json
{
  "allow": true/false,
  "denies": ["reason 1", "reason 2", ...]
}
```

---

## Metrics

### Prometheus Counters

- `agent_starts_allowed_total` - Successful agent starts
- `agent_starts_denied_total{reason}` - Denied starts by reason
- `agent_invalidation_events_total` - Agent invalidations
- `policy_reload_success_total` - Successful policy reloads
- `policy_reload_failure_total` - Failed policy reloads
- `promotion_attempts_total` - Promotion attempts
- `promotion_denies_total{reason}` - Promotion denials by reason

### Structured Logs

**Decision Codes:**
- `ADMISSION_ALLOW` - Agent start allowed
- `ADMISSION_DENY_PROOF_MISSING` - Missing proof bundle
- `ADMISSION_DENY_SPEC_HASH_MISMATCH` - Tampered spec detected
- `ADMISSION_DENY_POLICY_HASH_MISMATCH` - Policy drift detected
- `ADMISSION_DENY_SIGNER_REVOKED` - Revoked signing authority
- `ADMISSION_DENY_SIGNATURE_INVALID` - Invalid signature
- `ADMISSION_DENY_SANDBOX_EXPIRED` - Expired sandbox
- `ADMISSION_DENY_CONTAINMENT_VIOLATION` - Containment breach
- `PROMOTION_ATTEMPT` - Promotion requested
- `PROMOTION_DENIED` - Promotion rejected by policy
- `PROMOTION_SUCCESS` - Promotion succeeded
- `POLICY_HOTRELOAD` - Policy reloaded
- `POLICY_REVALIDATION` - Agents revalidated

---

## Database Schema

### agent_specs

```sql
CREATE TABLE agent_specs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  workspace_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL,
  description TEXT,
  role_class ENUM('compliance', 'analysis', 'ideation'),
  mode ENUM('sandbox', 'governed') DEFAULT 'sandbox',
  governance_status ENUM('SANDBOX', 'GOVERNED_VALID', 'GOVERNED_RESTRICTED', 'GOVERNED_INVALIDATED'),
  anatomy JSON NOT NULL,
  governance JSON,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_workspace (workspace_id),
  INDEX idx_mode (mode),
  INDEX idx_status (governance_status)
);
```

### agent_proofs

```sql
CREATE TABLE agent_proofs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  agent_id INT NOT NULL,
  policy_hash VARCHAR(64) NOT NULL,
  spec_hash VARCHAR(64) NOT NULL,
  signature VARCHAR(512) NOT NULL,
  authority VARCHAR(255) NOT NULL,
  signed_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agent_specs(id) ON DELETE CASCADE,
  INDEX idx_agent (agent_id)
);
```

### policy_versions

```sql
CREATE TABLE policy_versions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  workspace_id VARCHAR(255) NOT NULL,
  policy_set VARCHAR(255) NOT NULL,
  hash VARCHAR(64) NOT NULL,
  bundle JSON NOT NULL,
  actor VARCHAR(255),
  reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_workspace (workspace_id),
  INDEX idx_hash (hash)
);
```

---

## Troubleshooting

### Agent Start Denied

**Symptom:** Agent fails to start with admission control error

**Diagnosis:**
1. Check governance status: `SELECT governance_status FROM agent_specs WHERE id = ?`
2. Review admission logs: `getGovernanceLogger().getLogsByAgent(agentId)`
3. Verify proof bundle: Check `governance.proofBundle` field

**Solutions:**
- **PROOF_MISSING:** Promote agent to governed
- **SPEC_HASH_MISMATCH:** Agent was tampered with, restore from backup or recreate
- **POLICY_HASH_MISMATCH:** Revalidate agent against current policy
- **EXPIRED:** Sandbox expired, promote to governed or recreate

### Promotion Denied

**Symptom:** Promotion fails with policy denies

**Diagnosis:**
1. Check promotion logs: Look for `PROMOTION_DENIED` events
2. Review deny reasons in response
3. Verify actor permissions

**Solutions:**
- **Budget exceeds limit:** Reduce `economics.monthlyBudgetUsd`
- **Temperature too high:** Adjust `anatomy.reasoning.temperature` for role class
- **Incomplete anatomy:** Add missing MVA fields (reasoning, inputs, actions, memory)
- **Containment violation:** Set `external_calls=false`, `persistent_writes=false`

### Policy Hot Reload Fails

**Symptom:** Policy reload returns error

**Diagnosis:**
1. Check policy reload logs
2. Verify policy bundle format
3. Test policy syntax with OPA CLI

**Solutions:**
- **Invalid bundle:** Validate JSON/YAML structure
- **OPA syntax error:** Run `opa check promotion.rego`
- **Missing fields:** Ensure all required policy fields present

---

## Security Considerations

1. **Proof Bundle Integrity**
   - Use HMAC-SHA256 for signing
   - Rotate signing keys regularly
   - Store keys in secure vault (not in code)

2. **Admission Control**
   - Always fail-closed (deny by default)
   - Log all admission decisions
   - Monitor denied starts for tampering attempts

3. **Policy Management**
   - Require admin role for policy changes
   - Audit all policy modifications
   - Test policies in staging before production

4. **mTLS (Optional)**
   - Use SPIFFE-style identities
   - Implement certificate revocation
   - Verify server certificates

---

## Performance Considerations

1. **Admission Control**
   - Validation runs on every agent start
   - Optimize proof bundle verification
   - Cache policy snapshots

2. **Revalidation**
   - Runs on every policy hot reload
   - Can be slow for large agent counts
   - Consider async processing for 1000+ agents

3. **Metrics**
   - In-memory counters (fast)
   - Export to Prometheus for persistence
   - Reset counters periodically to prevent memory growth

---

## Future Enhancements

1. **Advanced Features**
   - [ ] Real-time SSE for governance events
   - [ ] Agent versioning with rollback
   - [ ] Multi-workspace policy inheritance
   - [ ] Cost tracking and budget alerts

2. **Security**
   - [ ] Full PKI implementation with Root CA
   - [ ] Certificate rotation automation
   - [ ] Hardware security module (HSM) integration

3. **Observability**
   - [ ] Grafana dashboards
   - [ ] Alerting rules
   - [ ] Distributed tracing

4. **Testing**
   - [ ] Performance benchmarks
   - [ ] Chaos engineering tests
   - [ ] Security penetration testing

---

## Support

For issues or questions:
- Review logs: `getGovernanceLogger().getRecentLogs()`
- Check metrics: `getGovernanceMetrics().toJSON()`
- Consult troubleshooting guide above
- Contact platform team

---

**End of Documentation**
