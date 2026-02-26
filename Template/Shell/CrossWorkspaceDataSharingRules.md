# Cross-Workspace Data Sharing Rules
# Phase 3 — Runtime & Federation

Status: Canonical Specification
Owner: Digital HQ Control Plane
Scope: Data access and sharing between workspaces

---

## 1. Purpose

Defines rules for sharing data assets (documents, datasets, embeddings, artifacts) between workspaces while maintaining governance integrity.

---

## 2. Sharing Model

### 2.1 Share Types

| Type          | Description                                        |
|--------------|----------------------------------------------------|
| Reference    | Target workspace gets read-only reference (pointer) |
| Copy         | Target workspace gets an immutable copy             |
| Sync         | Target workspace gets live-synced replica            |
| Export       | Data exported to external system                     |

### 2.2 Sharing Direction

- Unidirectional: source → target (default)
- Bidirectional: source ↔ target (requires explicit approval from both)

---

## 3. Authorization Rules

### 3.1 Deny-by-Default
No data sharing unless explicitly permitted by both workspaces.

### 3.2 Share Policy Declaration

Source workspace declares:
- shareableAssets (asset types or IDs)
- allowedTargets (workspace IDs or patterns)
- allowedShareTypes (reference | copy | sync | export)
- classification (public | internal | confidential | restricted)

Target workspace declares:
- acceptableShareTypes
- acceptableSources
- acceptableClassifications

### 3.3 Classification Gate

Data classified above the target workspace's clearance level cannot be shared.

| Classification | Clearance Required |
|---------------|-------------------|
| public        | any               |
| internal      | internal+         |
| confidential  | confidential+     |
| restricted    | restricted only   |

---

## 4. Governance Enforcement

Before any share:
1. Source governance profile validates export is allowed
2. Target governance profile validates import is allowed
3. Both resource tiers checked for storage/quota impact
4. Evidence record created for the share event

---

## 5. Revocation Rules

- Source can revoke a share at any time
- Revocation of references takes effect immediately
- Revocation of copies emits notification but copy persists (immutable)
- Revocation of syncs terminates replication
- All revocations emit audit events

---

## 6. Data Lineage

Every shared asset must track:
- Origin workspace ID
- Origin asset ID
- Share timestamp
- Share type
- Classification at time of share
- Actor who initiated share

---

## 7. Audit Requirements

Every share event must record:
- Source workspace ID
- Target workspace ID
- Asset ID
- Share type
- Classification
- Decision (allow | deny)
- Actor
- Timestamp

---

End of Document
