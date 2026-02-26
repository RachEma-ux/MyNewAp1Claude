# Workspace Decommissioning Protocol
# Phase 3 — Runtime & Federation

Status: Canonical Specification
Owner: Digital HQ Control Plane
Scope: Safe shutdown and removal of workspaces

---

## 1. Purpose

Defines how workspaces are safely decommissioned while preserving:

- Audit history
- Evidence integrity
- Data retention obligations
- Resource release
- Cross-workspace dependency handling

---

## 2. Decommissioning Lifecycle

```
request → validate → drain → archive → release → decommissioned
```

1. **request**: Actor requests workspace decommissioning with justification
2. **validate**: System checks dependencies, active jobs, shared data
3. **drain**: Active jobs wind down, new requests blocked
4. **archive**: Audit logs, evidence, and designated data archived
5. **release**: Resource allocations returned to pool
6. **decommissioned**: Workspace record marked terminal

---

## 3. Pre-Decommission Validation

Before decommissioning, the system must verify:

- No active jobs or running agents
- No pending cross-workspace requests
- No active data shares (or shares revoked)
- No dependent workspaces (or dependencies resolved)
- Audit log export complete
- Evidence archive complete

Failure at any step blocks decommissioning.

---

## 4. Data Handling

### 4.1 Retention Classes

| Class        | Handling                              |
|-------------|--------------------------------------|
| Audit logs  | Archived (retention per governance)   |
| Evidence    | Archived (immutable, never deleted)   |
| User data   | Deleted after retention period        |
| Config      | Archived with workspace record        |
| Secrets     | Securely destroyed                    |

### 4.2 Retention Period
Derived from governance profile. Default: 90 days after decommission.

### 4.3 Destruction Certificate
After retention period, a destruction certificate must be generated:
- Asset inventory
- Destruction method
- Actor
- Timestamp

---

## 5. Resource Release

- Resource tier allocation released to parent pool
- Pool utilization recalculated
- Release recorded in audit log

---

## 6. Cross-Workspace Impact

- All outbound data shares revoked
- All inbound data shares terminated
- All federation links disconnected
- Peer workspaces notified

---

## 7. Approval Rules

| Workspace Status | Approval Required      |
|-----------------|----------------------|
| Active          | Admin approval        |
| Frozen          | Admin approval        |
| Archived        | Auto-approve (admin)  |

Emergency decommissioning requires elevated role + justification.

---

## 8. Irreversibility

Decommissioning is irreversible once the release phase completes.

To restore, a new workspace must be provisioned from the same template.

---

## 9. Audit Requirements

Every decommission event must record:
- Workspace ID
- Phase (request | validate | drain | archive | release | decommissioned)
- Actor
- Justification
- Timestamp
- Destruction certificate reference (after retention)

---

End of Document
