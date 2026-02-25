# Template Promotion Protocol

**Status:** Canonical Governance Specification
**Scope:** Workspace Template Governance
**Applies To:** All Workspace Templates (Generic and Specialized)

---

# 1. Purpose

This document defines the governance lifecycle for Workspace Templates.

Templates are infrastructure artifacts.

They are:

- Editable during authoring
- Governed during promotion
- Immutable once approved
- Versioned upon release
- Auditable at all stages

This protocol ensures:

- User freedom during design
- Administrative control before provisioning
- Version integrity
- Deterministic infrastructure behavior
- Audit-grade traceability

---

# 2. Governance Model Overview

Templates operate under a hybrid governance model:

- Users may freely edit templates in Draft mode.
- Admin validation is required before use.
- Approval triggers a mandatory version bump.
- Only locked templates can provision workspaces.

Core enforcement rule:

> Draft is mutable.
> Locked is immutable.
> Only locked templates may provision infrastructure.

---

# 3. Template Lifecycle

Templates progress through the following states:

1. draft
2. submitted
3. approved
4. locked
5. deprecated

---

## 3.1 draft

Editable by authorized users.

Characteristics:
- Fully mutable
- Not provisionable
- Can be modified without version bump
- Can be deleted

---

## 3.2 submitted

Frozen pending review.

Characteristics:
- Temporarily immutable
- Under admin review
- Cannot provision

Transitions:
- submitted → approved
- submitted → draft (rejected)

---

## 3.3 approved

Validated by admin.

Characteristics:
- Governance checks passed
- Version bump required
- Snapshot created
- Eligible for locking

Transitions:
- approved → locked

---

## 3.4 locked

Immutable, provisionable version.

Characteristics:
- Read-only
- Assigned semantic version
- Published to Template Registry
- Eligible for workspace provisioning
- Cannot be modified

Changes require:
- Creating a new draft version

---

## 3.5 deprecated

No longer provisionable.

Characteristics:
- Existing workspaces unaffected
- Hidden from new provisioning
- Retained for historical reference

---

# 4. Promotion Flow

## Step 1 — Draft Creation

User creates or edits template in draft state.

No constraints beyond schema validation.

---

## Step 2 — Submission for Review

User submits draft for governance validation.

System actions:
- Freeze draft
- Capture snapshot
- Record submission event

---

## Step 3 — Admin Validation

Admin must validate against:

### Structural Validation
- Schema compliance
- Required metadata present
- Version format correct

### Governance Validation
- Allowed governance profiles only
- No policy bypass logic
- Correct injection points

### Resource Validation
- Compatible resource tiers
- No unauthorized resource elevation
- Quota compatibility

### Module Validation
- Allowed modules only
- No restricted module exposure
- Module dependency integrity

### Security Validation
- No forbidden integrations
- No unsafe external bindings
- No cross-workspace leakage

---

## Step 4 — Approval Decision

If rejected:
- Return to draft
- Attach rejection reasons

If approved:
- System increments semantic version
- Template snapshot sealed
- Status transitions to locked
- Template published to registry

---

# 5. Versioning Rules

Templates must use Semantic Versioning:

MAJOR.MINOR.PATCH

Rules:

- MAJOR: breaking structural change
- MINOR: additive module/resource changes
- PATCH: metadata or non-structural fixes

Version is assigned only during approval.

Drafts do not have final version numbers.

Locked templates are immutable per version.

---

# 6. Template Registry Integration

Upon locking:

Digital HQ must register:

- templateId
- version
- lifecycle state
- parent template (if inherited)
- allowed resource tiers
- allowed governance profiles
- checksum / integrity digest
- creation timestamp
- approver identity

Only locked templates appear in provisioning selector.

---

# 7. Provisioning Eligibility Rules

A template may provision workspaces only if:

- State = locked
- Version is valid
- Not deprecated
- Schema passes validation
- Governance profile still active
- Resource tiers available

---

# 8. Deprecation Protocol

Templates may be deprecated when:

- Replaced by new version
- Governance policy changes
- Security risk discovered

Deprecation rules:

- Cannot provision new workspaces
- Existing workspaces continue operating
- Deprecation event logged

---

# 9. Audit & Evidence Requirements

Each promotion must emit:

- Submission record
- Validation report
- Approval record
- Version assignment record
- Immutable snapshot reference
- Registry publication record
- Audit log entries

Evidence must be immutable.

---

# 10. Non-Goals

This protocol does NOT define:

- Runtime execution behavior
- Module internal logic
- Workspace provisioning flow
- UI implementation details

It strictly governs template lifecycle and promotion.

---

# 11. Architectural Guarantees

This protocol guarantees:

- No uncontrolled infrastructure provisioning
- No mutable production templates
- No silent configuration drift
- Deterministic workspace creation
- Full audit traceability

Templates remain flexible during design.
Infrastructure remains stable in production.

---

End of Document
