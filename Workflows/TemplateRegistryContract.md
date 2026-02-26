# Template Registry Contract

# Phase 2B — Registry Layer

Status: Canonical Specification
Owner: Digital HQ Control Plane
Scope: Workspace Templates + Governance Profiles + Resource Tiers

---

## 1. Purpose

The Template Registry is the authoritative catalog for all provisionable infrastructure templates.

It provides:

- Discovery (what templates exist)
- Governance (what is allowed to be used)
- Determinism (exact version selection)
- Integrity (immutability, checksums)
- Traceability (audit metadata, lineage)

The registry is consumed by:

- Workspace Provisioning workflow
- Template Promotion workflow
- Policy enforcement and validation
- Drift detection systems
- Admin governance tooling

---

## 2. Registry Principles

1. **Deny-by-default**
   - Anything not in the registry is not provisionable.

2. **Immutable versions**
   - Any `locked` version is immutable.
   - Modifications require a new version.

3. **Explicit lifecycle**
   - draft/submitted/approved/locked/deprecated states are preserved.

4. **Strict referential integrity**
   - Workspace templates reference governance profiles and resource tiers by ID+version (or allowed ranges with explicit constraints).

5. **Lineage and inheritance**
   - Templates may declare parent template lineage.
   - Registry must preserve version lineage across time.

6. **Evidence-first**
   - Registry entries must link to promotion evidence and validation receipts.

---

## 3. Registry Objects

The registry MUST support three object types:

### 3.1 Workspace Template
Represents a provisionable execution-domain blueprint.

### 3.2 Governance Profile
Represents a governance posture and enforcement control catalog.

### 3.3 Resource Tier
Represents a resource allocation + quota + cost envelope.

All three are versioned and lifecycle-managed.

---

## 4. Storage Layout (Conceptual)

Registry is represented as machine-readable files (source of truth) plus optional DB mirrors.

Canonical files:

- `Template/Shell/templates.index.json` (registry index)
- Template artifacts referenced by the index (md, tsx, ts, json schema, etc.)

Optional mirrors:

- Control-plane DB projection of index for fast querying
- Search cache for UI

---

## 5. Registry Index Contract

### 5.1 Required Sections

`templates.index.json` MUST include:

- `registryVersion`
- `generatedAt`
- `objects` array (workspaceTemplate / governanceProfile / resourceTier)
- `lineage` array (optional but recommended)
- `policies` object (global registry constraints)

### 5.2 Required Object Fields

Every registry object entry MUST include:

- `kind` (workspaceTemplate | governanceProfile | resourceTier)
- `id` (stable slug)
- `version` (semver)
- `status` (draft | submitted | approved | locked | deprecated)
- `displayName`
- `description`
- `paths` (artifact pointers: md, schema, shell template, backend scaffold)
- `checksums` (sha256 for each referenced file)
- `compatibility` (allowed refs and constraints)
- `relationships` (parent/inheritsFrom, related profiles/tiers)
- `evidence` (promotion receipts)
- `audit` (createdBy, approvedBy, timestamps)

### 5.3 Provisioning Eligibility Rule

A registry entry is provisionable if and only if:

- `status = locked`
- `deprecated != true`
- checksums exist and match artifacts
- required referenced artifacts exist
- compatibility constraints are satisfied

---

## 6. Version Lineage Rules

### 6.1 Immutable History
Registry must retain older versions, even if deprecated.

### 6.2 Upgrade Semantics
Lineage may indicate:

- `supersedes`: oldVersion → newVersion
- `compatibleWith`: explicit compatibility notes
- `breaking`: whether upgrade requires migration

### 6.3 Inheritance Semantics
Workspace templates may inherit from another template:

- Parent must exist in registry
- Parent version must be explicit
- Child may override only allowed fields per schema
- Registry must record parent-child link

---

## 7. Compatibility Rules

Registry entries MUST declare compatibility in a machine-usable way:

WorkspaceTemplate must declare:

- Allowed governance profile IDs/versions (or allowed ranges)
- Allowed resource tier IDs/versions (or allowed ranges)

GovernanceProfile may declare:

- Applicable scopes (workspace/module/dataset/etc.)
- Enforcement constraints

ResourceTier may declare:

- Allowed model tags/ids
- Allowed integration tags/ids

---

## 8. Checksums and Integrity

### 8.1 Required
Each artifact referenced by the registry MUST include a sha256 checksum.

### 8.2 Validation
Registry validation requires:

- referenced file exists
- checksum matches file content
- lifecycle status is consistent

### 8.3 Tamper Evidence
If a referenced artifact changes without version bump, checksum mismatch must be treated as:

- registry violation
- potential freeze trigger (in enforcement stage)

---

## 9. Evidence & Audit Requirements

Registry must link to promotion evidence:

- validation report reference
- approver identity
- approval timestamp
- version assignment record

Minimum audit fields:

- `createdBy`
- `createdAt`
- `submittedBy`
- `submittedAt`
- `approvedBy`
- `approvedAt`

---

## 10. Non-Goals

This contract does NOT define:

- runtime resource scheduling implementation
- database schema for mirrors
- UI layouts for registry browsing

It defines the canonical registry index and integrity rules only.

---

## 11. Version Lineage & Upgrade Rules (Canonical)

### 11.1 Lineage Record
Each registry object MAY include lineage entries:
- fromVersion
- toVersion
- breaking (boolean)
- migrationRequired (boolean)
- migrationNotes (string)

### 11.2 Breaking Change Definition
A change is BREAKING if it impacts any of:
- Required schema fields (add/remove/rename required)
- Default modules that remove a capability users rely on
- Governance posture that increases enforcement (monitor → enforce)
- Resource tier ceilings that decrease quotas/limits
- Export/integration rules that tighten access
- Injection points/evidence requirements that become stricter

### 11.3 Upgrade Constraints
- Auto-upgrade is allowed only when: breaking=false AND migrationRequired=false.
- Otherwise, explicit admin approval is required.
- Locked versions are immutable; upgrades always create a new version.

### 11.4 Inheritance Constraints
If a workspace template inherits from a parent:
- Parent id+version must exist in registry.
- Child must declare parent reference explicitly.
- Child may override only fields allowed by the schema and policy.
- Parent updates do not implicitly change child versions; a child must be re-versioned to adopt parent changes.

---

End of Document
