# Agent Governance Module Documentation

## Overview

The Agent Governance Module provides enterprise-grade lifecycle management for AI agents with policy enforcement, cryptographic proofs, and compliance reporting. This system ensures agents operate within defined boundaries while maintaining full auditability.

---

## Architecture

### **Three-State Lifecycle**

1. **Draft** - Partial spec, autosaved every 2 seconds, no execution
2. **Sandbox** - Full testing environment, isolated from production
3. **Governed** - Production-ready with cryptographic proof bundles

### **Governance Status**

- `SANDBOX` - Testing mode, no policy enforcement
- `GOVERNED_VALID` - Compliant with current policy
- `GOVERNED_RESTRICTED` - Policy violation, limited functionality
- `GOVERNED_INVALIDATED` - Critical drift, execution blocked

---

## Features

### **1. Agent Creation (7 Modes)**

Navigate to **Agents → Create** to access:

1. **From Template** - Deploy pre-built agents (Research Assistant, Code Helper, etc.)
2. **From Scratch** - Manual configuration with full control
3. **Clone Existing** - Fork an existing agent
4. **From Workflow** - Automation-first approach
5. **From Conversation** - Intent extraction from chat
6. **From Event Trigger** - Event-driven agents
7. **Import Spec** - Upload JSON/YAML agent definitions

Each mode opens the **WizardShell** with 6 steps:
- Identity → Role → LLM → Capabilities → Limits → Review

### **2. Promotion Workflow**

**Path:** Agents → Approvals

- Request promotion from sandbox to governed status
- 24-hour SLA for approval decisions
- Multi-approver support with comment threads
- Automatic proof bundle generation on execution
- Incident freeze mechanism blocks promotions during outages

**API Endpoints:**
```typescript
// Request promotion
trpc.agents.requestPromotion.useMutation({ agentId: string })

// Approve/Reject
trpc.agents.approvePromotion.useMutation({ requestId: string, comment?: string })
trpc.agents.rejectPromotion.useMutation({ requestId: string, reason: string })

// Execute approved promotion
trpc.agents.executePromotion.useMutation({ requestId: string })
```

### **3. Drift Detection**

**Path:** Agents → Drift Detection

Runs every 10 minutes to detect:
- **Policy Change** - Agent no longer complies with updated policy
- **Spec Tampering** - Hash mismatch indicates unauthorized modification
- **Expired** - Agent past expiry date

**Dashboard Features:**
- Real-time drift summary (total, by type, by severity)
- 7-day trend chart (drifted vs compliant agents)
- Severity distribution bar chart
- One-click auto-remediation for safe violations

**API Endpoints:**
```typescript
// Detect all drift
trpc.agents.detectAllDrift.useQuery()

// Detect specific agent drift
trpc.agents.detectDrift.useQuery({ agentId: string })

// Get drift history
trpc.agents.getDriftHistory.useQuery({ agentId: string, limit?: number })
```

### **4. Autonomous Remediation**

**Path:** Drift Detection Dashboard → Auto-Remediate button

Automatically fixes safe violations:
- **Budget adjustments** - Reduce limits to comply with policy
- **Capability removal** - Strip forbidden capabilities

Blocked for:
- Spec tampering (critical security violation)
- Expiry (requires manual renewal)
- Critical policy violations (human review required)

**API Endpoints:**
```typescript
// Check if drift can be auto-remediated
trpc.agents.canAutoRemediate.useQuery({ agentId: string, driftType: string })

// Trigger auto-remediation
trpc.agents.autoRemediate.useMutation({ agentId: string, driftType: string })

// Get remediation history
trpc.agents.getRemediationHistory.useQuery({ agentId: string, limit?: number })
```

### **5. Compliance Export**

**Path:** Agents → Compliance Export

Generate attestation reports for:
- **SOC 2 Type II** - Trust Services Criteria
- **ISO 27001** - Information Security Management
- **HIPAA** - Healthcare data protection
- **GDPR** - EU data privacy

**Report Contents:**
- Agent governance events (creation, promotion, deletion)
- Policy version history with change tracking
- Drift detection results and remediation actions
- Cryptographic proofs (spec hashes, policy hashes, signatures)
- Complete audit trail with actor attribution

**Export Formats:**
- JSON (structured, machine-readable)
- CSV (spreadsheet, human-readable)

**API Endpoints:**
```typescript
// Export compliance report
trpc.agents.exportCompliance.useMutation({
  framework: "SOC2" | "ISO27001" | "HIPAA" | "GDPR",
  startDate: Date,
  endDate: Date,
  format: "json" | "csv"
})

// Generate specific attestation
trpc.agents.generateAttestation.useMutation({
  type: "agent_lifecycle" | "policy_compliance" | "promotion_workflow",
  agentId?: string,
  startDate: Date,
  endDate: Date
})
```

### **6. Policy-as-Code (OPA)**

**Path:** Agents → Policies

- Upload `.rego` policy files
- Hot-reload support (update without restart)
- Cosign signature verification for policy bundles
- Version history with rollback capability

**Policy Structure:**
```rego
package agent_governance

# Budget limits
max_daily_budget := 1000

# Allowed capabilities
allowed_capabilities := ["read_files", "search_web"]

# Promotion rules
allow_promotion {
  input.agent.budget.daily <= max_daily_budget
  every capability in input.agent.capabilities {
    capability in allowed_capabilities
  }
}
```

### **7. Protocol Management**

**Path:** Agents → Protocols

- Upload `.md` protocol files
- Markdown preview with syntax highlighting
- Search and filter by tags
- Version control for protocol updates

---

## Database Schema

### **agents**
```sql
CREATE TABLE agents (
  id VARCHAR(191) PRIMARY KEY,
  workspaceId INT,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  mode ENUM('draft', 'sandbox', 'governed') DEFAULT 'draft',
  governanceStatus ENUM('SANDBOX', 'GOVERNED_VALID', 'GOVERNED_RESTRICTED', 'GOVERNED_INVALIDATED'),
  spec JSON NOT NULL,
  proofBundle JSON,
  capabilities JSON,
  budget JSON,
  llm JSON,
  expiresAt TIMESTAMP NULL,
  createdBy INT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### **agent_proofs**
```sql
CREATE TABLE agent_proofs (
  id VARCHAR(191) PRIMARY KEY,
  agentId VARCHAR(191) NOT NULL,
  specHash VARCHAR(255) NOT NULL,
  policyHash VARCHAR(255) NOT NULL,
  signature TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agentId) REFERENCES agents(id) ON DELETE CASCADE
);
```

### **promotion_requests**
```sql
CREATE TABLE promotion_requests (
  id VARCHAR(191) PRIMARY KEY,
  agentId VARCHAR(191) NOT NULL,
  requestedBy INT NOT NULL,
  status ENUM('pending', 'approved', 'rejected', 'executed') DEFAULT 'pending',
  approvedBy INT,
  rejectedBy INT,
  rejectionReason TEXT,
  slaDeadline TIMESTAMP,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agentId) REFERENCES agents(id) ON DELETE CASCADE
);
```

### **agent_history**
```sql
CREATE TABLE agent_history (
  id VARCHAR(191) PRIMARY KEY,
  agentId VARCHAR(191) NOT NULL,
  eventType ENUM('created', 'promoted', 'modified', 'status_changed') NOT NULL,
  changes JSON,
  actor VARCHAR(255),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agentId) REFERENCES agents(id) ON DELETE CASCADE
);
```

---

## Testing

### **Test Suites (55+ Tests)**

1. **drift-detection.test.ts** (10 tests)
   - Policy drift detection
   - Spec tampering detection
   - Expiry detection
   - Drift categorization

2. **autonomous-remediation.test.ts** (12 tests)
   - Auto-remediation eligibility checks
   - Budget adjustment fixes
   - Capability removal fixes
   - Remediation history tracking

3. **compliance-export.test.ts** (8 tests)
   - SOC2/ISO/HIPAA/GDPR report generation
   - Date range filtering
   - JSON/CSV export formats
   - Cryptographic proof inclusion

4. **agents-integration.test.ts** (15 tests)
   - Agent CRUD operations
   - Promotion workflow
   - Governance status transitions
   - History tracking

5. **agents-e2e.test.ts** (10 tests)
   - Full lifecycle workflows
   - Policy violation handling
   - Rejection and resubmission
   - Bulk operations

### **Running Tests**

```bash
# Run all agent tests
pnpm test server/agents/

# Run specific test suite
pnpm test drift-detection.test.ts

# Run with coverage
pnpm test --coverage
```

---

## Security

### **Cryptographic Proofs**

Every governed agent has a proof bundle:
```json
{
  "specHash": "sha256:abc123...",
  "policyHash": "sha256:def456...",
  "signature": "cosign signature...",
  "timestamp": "2026-01-03T12:00:00Z"
}
```

### **Hash Computation**

```typescript
import crypto from "crypto";

function computeSpecHash(spec: AgentSpec): string {
  const canonical = JSON.stringify(spec, Object.keys(spec).sort());
  return crypto.createHash("sha256").update(canonical).digest("hex");
}
```

### **Signature Verification**

Uses Cosign for policy bundle verification:
```bash
cosign verify --key cosign.pub policy-bundle.tar.gz
```

---

## Best Practices

### **1. Agent Design**

- Set expiry dates for temporary agents
- Use minimal capabilities (principle of least privilege)
- Document purpose and expected behavior in spec
- Test thoroughly in sandbox before promotion

### **2. Policy Management**

- Version all policy changes
- Test policies against existing agents before deployment
- Use gradual rollout for breaking changes
- Maintain policy documentation alongside code

### **3. Drift Remediation**

- Review auto-remediation logs regularly
- Investigate repeated drift patterns
- Update policies to prevent recurring violations
- Escalate critical drift to security team

### **4. Compliance**

- Export reports monthly for audit trail
- Store reports in immutable storage (S3 with versioning)
- Include reports in compliance documentation
- Review attestations before external audits

---

## Troubleshooting

### **Agent stuck in "pending" promotion**

**Cause:** SLA deadline passed without approval

**Solution:**
1. Check promotion requests page for status
2. Approve or reject the request
3. If SLA breached, escalate to admin

### **Drift detection not running**

**Cause:** Cron job disabled or failed

**Solution:**
1. Check server logs for drift detection errors
2. Manually trigger detection from dashboard
3. Verify database connectivity

### **Auto-remediation failing**

**Cause:** Insufficient permissions or invalid drift type

**Solution:**
1. Check remediation history for error messages
2. Verify agent is in governed mode
3. Ensure drift type is eligible for auto-remediation

### **Compliance export timeout**

**Cause:** Large date range or too many agents

**Solution:**
1. Reduce date range to smaller intervals
2. Export by framework separately
3. Use CSV format for faster generation

---

## API Reference

### **Agent Management**

```typescript
// Create agent
trpc.agents.create.useMutation({
  name: string,
  description?: string,
  spec: AgentSpec,
  expiresAt?: Date
})

// Update agent
trpc.agents.update.useMutation({
  id: string,
  spec: AgentSpec
})

// Delete agent
trpc.agents.delete.useMutation({ id: string })

// List agents
trpc.agents.list.useQuery({ mode?: string, status?: string })

// Get agent by ID
trpc.agents.getById.useQuery({ id: string })
```

### **Governance Operations**

```typescript
// Move to sandbox
trpc.agents.moveToSandbox.useMutation({ id: string })

// Promote to governed
trpc.agents.promote.useMutation({ id: string })

// Mark as restricted
trpc.agents.markRestricted.useMutation({ id: string, reason: string })

// Invalidate agent
trpc.agents.invalidate.useMutation({ id: string, reason: string })
```

### **History & Audit**

```typescript
// Get agent history
trpc.agents.getHistory.useQuery({ id: string, limit?: number })

// Get promotion events
trpc.agents.getPromotionEvents.useQuery({ requestId: string })
```

---

## Roadmap

### **Planned Features**

- [ ] Multi-workspace agent sharing
- [ ] Agent templates marketplace
- [ ] Real-time drift alerts (webhook/email)
- [ ] Policy simulation mode
- [ ] Bulk promotion workflow
- [ ] Agent performance metrics
- [ ] Cost tracking and budgeting
- [ ] Integration with external policy engines

---

## Support

For issues or questions:
- Check troubleshooting section above
- Review test suites for usage examples
- Submit feedback at https://help.manus.im
