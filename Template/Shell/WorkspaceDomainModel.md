# Workspace Domain Model
# Phase 2 — Backend Control-Plane Architecture (Spec Only)

Status: Canonical Specification
Owner: Digital HQ Control Plane
Scope: Workspace DB entities and relations

---

## 1. Purpose

Defines the backend data model required to support:

- Workspace provisioning
- Governance enforcement
- Resource allocation
- Drift detection
- Evidence tracking
- Freeze operations

This is a logical domain model. Not tied to a specific database engine.

---

## 2. Core Entities

### 2.1 Workspace

Fields:
- id (UUID)
- name
- status (provisioning | active | frozen | archived)
- templateId
- templateVersion
- governanceProfileId
- governanceProfileVersion
- resourceTierId
- resourceTierVersion
- createdAt
- createdBy
- updatedAt
- frozenAt (nullable)

Relationships:
- HasMany WorkspaceModule
- HasMany WorkspaceAuditEvent
- HasMany WorkspaceDriftEvent
- HasOne WorkspaceSnapshot

---

### 2.2 WorkspaceModule

Fields:
- id
- workspaceId
- moduleKey
- enabled (boolean)
- config (JSON)
- updatedAt

---

### 2.3 WorkspaceSnapshot

Fields:
- id
- workspaceId
- snapshotVersion
- templateId
- governanceProfileId
- resourceTierId
- moduleState (JSON)
- quotasState (JSON)
- identityState (JSON)
- createdAt

Purpose:
- Baseline for drift comparison

---

### 2.4 WorkspaceAuditEvent

Fields:
- id
- workspaceId
- eventType
- severity
- actorId
- metadata (JSON)
- createdAt

---

### 2.5 WorkspaceDriftEvent

Fields:
- id
- workspaceId
- driftType
- severity
- detectedAt
- resolvedAt (nullable)
- resolutionAction

---

### 2.6 FreezeRecord

Fields:
- id
- workspaceId
- freezeMode (readOnly | blockMutations | blockAll)
- reason
- triggeredBy
- triggeredAt
- liftedAt (nullable)
- liftedBy (nullable)

---

## 3. Referential Integrity Rules

- templateId + version must exist in registry
- governanceProfileId + version must exist in registry
- resourceTierId + version must exist in registry
- Snapshot must be created at provisioning

---

## 4. Immutable Fields

After provisioning:
- templateId + version immutable
- governanceProfileId + version immutable unless approved
- resourceTierId + version immutable unless approved

---

End of Document
