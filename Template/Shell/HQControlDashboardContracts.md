# HQ Control Dashboard Contracts
# Phase 3 — Runtime & Federation

Status: Canonical Specification
Owner: Digital HQ Control Plane
Scope: Dashboard data contracts for audit, drift, freeze, and resource views

---

## 1. Purpose

Defines the data contracts that HQ dashboards consume. Dashboards are read-only views over the control plane. They do not mutate state.

This spec defines what data is exposed, not how the UI renders it.

---

## 2. Dashboard Views

### 2.1 Workspace Overview Dashboard

Data contract:
- workspaceId
- workspaceName
- status (provisioning | active | frozen | archived)
- templateId + version
- governanceProfileId + version
- resourceTierId + version
- complianceScore
- driftStatus (clean | drifted | frozen)
- lastAuditEvent timestamp
- createdAt

Filters:
- By status
- By template
- By governance profile
- By compliance score range

---

### 2.2 Audit Dashboard

Data contract:
- eventId
- workspaceId
- eventType
- severity (low | medium | high | critical)
- actorId
- timestamp
- metadata summary

Filters:
- By workspace
- By severity
- By event type
- By date range

Aggregations:
- Events per day
- Events by severity
- Events by workspace
- Top actors

---

### 2.3 Drift Dashboard

Data contract:
- driftEventId
- workspaceId
- driftType (artifact | schema | referential | lifecycle | evidence | module | governance | resource | identity)
- severity
- detectedAt
- resolvedAt (nullable)
- resolutionAction

Filters:
- By workspace
- By drift type
- By severity
- By resolution status (open | resolved)

Aggregations:
- Open drifts count
- Drifts by type
- Mean time to resolution
- Drifts by severity trend

---

### 2.4 Freeze Dashboard

Data contract:
- freezeId
- workspaceId
- freezeMode (readOnly | blockMutations | blockAll)
- reason
- triggeredBy
- triggeredAt
- liftedAt (nullable)
- liftedBy (nullable)
- duration (computed)

Filters:
- By workspace
- By freeze mode
- By status (active | lifted)
- By date range

Aggregations:
- Active freezes count
- Freezes by mode
- Average freeze duration
- Freeze frequency trend

---

### 2.5 Resource Dashboard

Data contract:
- workspaceId
- tierId + version
- quotaType (cpu | memory | storage | gpu)
- allocated
- used
- remaining
- utilizationPercent
- budgetPeriod
- budgetAmount
- budgetSpent
- budgetRemaining
- burnRate

Filters:
- By workspace
- By tier
- By quota type
- By utilization threshold

Aggregations:
- Total resource utilization
- Budget burn rate trend
- Top consumers
- Projected exhaustion dates

---

### 2.6 Federation Dashboard

Data contract:
- peerId
- peerName
- trustLevel (untrusted | verified | trusted | delegated)
- governanceCompatibility (compatible | partial | incompatible)
- activeChannels count
- lastInteraction timestamp
- openViolations count

Filters:
- By trust level
- By compatibility
- By violation status

Aggregations:
- Peers by trust level
- Cross-boundary traffic volume
- Violation trend

---

## 3. Data Freshness

| Dashboard    | Freshness Target   |
|-------------|-------------------|
| Overview    | Near real-time (< 30s) |
| Audit       | Near real-time (< 30s) |
| Drift       | Near real-time (< 60s) |
| Freeze      | Real-time (< 5s)       |
| Resource    | Near real-time (< 60s) |
| Federation  | Periodic (< 5min)      |

---

## 4. Access Control

All dashboards require:
- Authenticated user
- Admin or auditor role
- Workspace-scoped access (users see only their workspaces)
- Org-scoped access (admins see all workspaces)

---

## 5. Non-Goals

Dashboards do NOT:
- Mutate state
- Trigger actions (except navigating to action pages)
- Replace audit logs (they visualize them)
- Store data (they query the control plane)

---

End of Document
