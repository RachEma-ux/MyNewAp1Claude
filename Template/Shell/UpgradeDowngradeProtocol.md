# Upgrade / Downgrade Protocol
# Phase 2D — Resource Governance Layer

Status: Canonical Specification
Owner: Digital HQ Control Plane
Scope: Resource Tier transitions for active workspaces

---

## 1. Purpose

Defines how a workspace transitions from one Resource Tier to another while maintaining governance integrity.

---

## 2. Transition Types

### 2.1 Upgrade

Moving to a higher-capacity tier:
- More CPU, memory, storage, GPU
- Higher rate limits
- Higher budget cap
- Broader model/integration access

### 2.2 Downgrade

Moving to a lower-capacity tier:
- Reduced quotas
- Tighter rate limits
- Lower budget cap
- Narrower model/integration access

### 2.3 Lateral Move

Moving to a different tier at the same level:
- Different GPU class but same compute
- Different network posture
- Different model access profile

---

## 3. Transition Workflow

```
request → validate → approve → snapshot → migrate → verify → activate
```

1. **request**: Actor requests tier change with justification
2. **validate**: System checks new tier compatibility with template + governance profile
3. **approve**: Admin approval required if breaking=true or policy requires it
4. **snapshot**: Current workspace state captured (pre-migration baseline)
5. **migrate**: Quotas, limits, and access rules updated
6. **verify**: Post-migration drift check runs
7. **activate**: New tier is active; audit entry created

---

## 4. Approval Rules

| Transition | Auto-Approve? | Condition |
|-----------|--------------|-----------|
| Upgrade (non-breaking) | Yes | If requestor has permission and pool has capacity |
| Upgrade (breaking) | No | Admin approval required |
| Downgrade (non-breaking) | Yes | If no active usage exceeds new limits |
| Downgrade (breaking) | No | Admin approval + impact assessment required |
| Lateral move | No | Admin review required |

---

## 5. Breaking Transition Definition

A tier transition is breaking if:

- Active resource usage exceeds new tier limits
- Running jobs would be terminated
- Model access would be revoked for in-use models
- Integration credentials would be invalidated
- Budget cap would be exceeded by current spend

---

## 6. Rollback Rules

If migration fails or verification detects drift:

- Automatic rollback to pre-migration snapshot
- Rollback must restore previous tier binding
- Rollback must emit audit event
- Failed migration does not count as a version change

---

## 7. Cooldown Period

- After a tier change, a cooldown period applies (configurable, default 1 hour)
- During cooldown, no further tier changes are allowed
- Prevents tier-flapping and abuse
- Admin override can bypass cooldown with justification

---

## 8. Audit Requirements

Every tier transition must record:

- Workspace ID
- From tier (ID + version)
- To tier (ID + version)
- Transition type (upgrade | downgrade | lateral)
- Breaking (boolean)
- Approval method (auto | manual)
- Approver (if manual)
- Pre-migration snapshot reference
- Post-migration verification result
- Timestamp

---

End of Document
