# Inter-Workspace Protocol
# Phase 3 — Runtime & Federation

Status: Canonical Specification
Owner: Digital HQ Control Plane
Scope: Communication and coordination between workspaces

---

## 1. Purpose

Defines how workspaces interact with each other within the same organization, including:

- Cross-workspace messaging
- Shared resource negotiation
- Coordinated workflows
- Dependency declarations

---

## 2. Communication Model

### 2.1 Message Types

| Type         | Direction         | Description                          |
|-------------|------------------|--------------------------------------|
| Request     | Workspace → Workspace | Ask for data or action             |
| Response    | Workspace → Workspace | Reply to a request                 |
| Notification| Workspace → Workspace | Inform without expecting reply     |
| Broadcast   | Workspace → All       | Organization-wide announcement     |

### 2.2 Addressing

Each workspace is addressable by:
- Workspace ID (UUID)
- Workspace slug (human-readable)

Messages must include:
- sourceWorkspaceId
- targetWorkspaceId
- messageType
- payload
- correlationId
- timestamp

---

## 3. Authorization Rules

### 3.1 Deny-by-Default
Workspaces cannot communicate unless explicitly permitted.

### 3.2 Communication Allowlist
Each workspace declares:
- allowedPeers (list of workspace IDs or patterns)
- allowedMessageTypes (per peer)
- maxMessageRate (per peer)

### 3.3 Governance Gate
Cross-workspace communication must pass through governance middleware:
- Sender's governance profile checked
- Receiver's governance profile checked
- Both must allow the interaction

---

## 4. Protocol Lifecycle

```
discovery → negotiate → establish → active → terminate
```

- **discovery**: Workspace queries registry for available peers
- **negotiate**: Both workspaces validate compatibility
- **establish**: Communication channel opened with audit record
- **active**: Messages exchanged within allowed bounds
- **terminate**: Channel closed with audit record

---

## 5. Rate Limiting

- Per-peer rate limits enforced
- Global cross-workspace rate limit enforced
- Violations trigger throttle → deny → freeze escalation

---

## 6. Audit Requirements

Every cross-workspace message must record:
- Source workspace ID
- Target workspace ID
- Message type
- Payload hash (not full payload)
- Decision (allow | deny)
- Timestamp

---

## 7. Failure Modes

- Target workspace unreachable → retry with backoff → emit event
- Target workspace frozen → deny with reason
- Authorization failure → deny with audit event
- Rate limit exceeded → throttle with notification

---

End of Document
