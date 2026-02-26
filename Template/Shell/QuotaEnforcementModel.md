# Quota Enforcement Model
# Phase 2D — Resource Governance Layer

Status: Canonical Specification
Owner: Digital HQ Control Plane
Scope: Runtime quota enforcement for workspaces

---

## 1. Purpose

Defines how resource quotas declared in Resource Tiers are enforced at runtime, including enforcement actions and escalation behavior.

---

## 2. Quota Types

| Quota              | Unit      | Enforcement Point          |
|--------------------|-----------|---------------------------|
| CPU cores          | logical   | Provisioning + runtime     |
| Memory (MB)        | megabytes | Provisioning + runtime     |
| Storage (GB)       | gigabytes | Provisioning + runtime     |
| GPU count          | devices   | Provisioning               |
| GPU memory (MB)    | megabytes | Runtime                    |
| Artifact storage   | gigabytes | Runtime                    |

---

## 3. Enforcement Actions

Each quota specifies an enforcement action (from resource-tier.schema.json):

### 3.1 Throttle
- Reduce throughput / degrade performance
- Do not terminate active work
- Emit warning event
- Allow grace period before escalation

### 3.2 Deny
- Reject new requests that would exceed quota
- Active work continues
- Emit denial event
- No grace period

### 3.3 Freeze
- Block all mutations on the workspace
- Active work paused (not terminated)
- Emit freeze event
- Require admin intervention to unfreeze

---

## 4. Enforcement Flow

```
request → check quota → within limit?
  → yes: allow
  → no: apply enforcement action (throttle | deny | freeze)
       → emit audit event
       → notify workspace owner
```

---

## 5. Quota Tracking

The system must track:

- Current usage per quota dimension
- Peak usage (rolling window)
- Remaining capacity
- Time to projected exhaustion
- Violation count (rolling window)

---

## 6. Grace Period Rules

- Throttle action includes a configurable grace period (default: 15 minutes)
- During grace period, soft warnings are emitted
- After grace period, enforcement activates
- Deny and Freeze have no grace period

---

## 7. Escalation Chain

```
Warning (80% utilization)
  → Throttle (90% utilization)
    → Deny (100% utilization)
      → Freeze (sustained violation or bypass attempt)
```

Escalation thresholds are configurable per tier but defaults apply if unset.

---

## 8. Non-Bypassable Enforcement

Quota checks must:

- Execute server-side at API boundary
- Apply before request processing
- Not be circumventable by UI or client
- Apply to all actors (human and AI agents)

---

## 9. Audit Requirements

Every quota event must record:

- Workspace ID
- Quota type
- Current usage
- Limit
- Action taken
- Actor (if applicable)
- Timestamp

---

End of Document
