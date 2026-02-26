# Budget Enforcement Model
# Phase 2D — Resource Governance Layer

Status: Canonical Specification
Owner: Digital HQ Control Plane
Scope: Cost governance and budget enforcement for workspaces

---

## 1. Purpose

Defines how budget caps declared in Resource Tiers are enforced, including metering dimensions, enforcement actions, and cost visibility.

---

## 2. Budget Structure

Each Resource Tier declares a budget envelope:

- Currency (ISO code or internal token)
- Period (daily | weekly | monthly | quarterly | yearly)
- Amount (cap for the period)

---

## 3. Metering Dimensions

Cost is tracked across these dimensions (from resource-tier.schema.json):

| Dimension       | Description                    |
|----------------|-------------------------------|
| cpuSeconds     | Compute time consumed          |
| gpuSeconds     | GPU time consumed              |
| storageGBDays  | Storage over time              |
| egressGB       | Network egress                 |
| apiCalls       | API request count              |
| tokensIn       | LLM input tokens consumed      |
| tokensOut      | LLM output tokens generated    |

Each tier declares which dimensions apply.

---

## 4. Enforcement Actions

### 4.1 Throttle
- Reduce request throughput
- Deprioritize non-critical operations
- Emit budget warning
- Allow essential operations to continue

### 4.2 Deny
- Reject new cost-incurring requests
- Allow read-only operations
- Emit budget denial event

### 4.3 Freeze
- Block all operations except HQ override
- Emit budget freeze event
- Require admin budget increase or period reset

---

## 5. Enforcement Flow

```
request → estimate cost → check budget remaining
  → sufficient: allow + record cost
  → insufficient: apply enforcement action
       → emit audit event
       → notify workspace owner + admin
```

---

## 6. Budget Tracking

The system must maintain:

- Current period spend (per dimension)
- Total period spend (aggregated)
- Remaining budget
- Burn rate (cost per hour, projected)
- Projected exhaustion date
- Period start/end timestamps

---

## 7. Alert Thresholds

| Threshold | Action                      |
|-----------|----------------------------|
| 50%       | Informational notification  |
| 75%       | Warning to workspace owner  |
| 90%       | Alert to owner + admin      |
| 100%      | Enforcement action triggers  |

Thresholds are configurable per tier but defaults apply if unset.

---

## 8. Period Reset

- At period boundary, spend counters reset to zero
- Reset does not clear audit history
- Reset does not unfreeze (freeze requires explicit admin action)
- Carry-over is not supported (unused budget does not roll over)

---

## 9. Cost Extensions

The `cost.extensions` field in Resource Tiers supports:

- Org-specific billing metadata
- Plugin-specific cost tracking
- Vendor-specific pricing models

Extensions are namespaced: `org.*`, `plugin.*`, `vendor.*`

---

## 10. Non-Bypassable Enforcement

Budget checks must:

- Execute server-side before cost-incurring operations
- Apply to all actors (human and AI agents)
- Not be circumventable by UI
- Apply at API and provisioning boundaries

---

## 11. Audit Requirements

Every budget event must record:

- Workspace ID
- Dimension
- Cost incurred
- Budget remaining
- Action taken
- Actor
- Timestamp

---

End of Document
