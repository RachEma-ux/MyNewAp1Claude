# Template Drift Detection Model
# Phase 2 — Drift & Integrity Layer

Status: Canonical Specification
Owner: Digital HQ Control Plane
Scope: Workspace Templates, Governance Profiles, Resource Tiers

---

## 1. Purpose

Template Drift Detection ensures that registry artifacts remain:

- Immutable once locked
- Consistent with recorded checksums
- Aligned with schema definitions
- Referentially valid
- Evidence-backed

It protects the integrity of the Template Registry over time.

Drift detection applies to:

- Workspace Templates
- Governance Profiles
- Resource Tiers
- Registry Index (templates.index.json)

---

## 2. Drift Categories

### 2.1 Artifact Drift

Occurs when:

- A referenced file content changes
- Checksum mismatch detected
- File missing
- Evidence file missing

Severity:
- High (locked version modified)
- Medium (approved but not locked)
- Low (draft)

---

### 2.2 Schema Drift

Occurs when:

- Template no longer validates against its schema
- Governance profile violates schema
- Resource tier violates schema

Severity:
- Critical if locked
- High if approved
- Medium if draft

---

### 2.3 Referential Drift

Occurs when:

- Referenced governance profile does not exist
- Referenced resource tier does not exist
- Parent template missing
- Version mismatch

Severity:
- Critical (locked)
- High (approved)

---

### 2.4 Lifecycle Drift

Occurs when:

- Status changed without version bump
- Deprecated object still marked provisionable
- Locked object modified without version change

Severity:
- Critical

---

### 2.5 Evidence Drift

Occurs when:

- Promotion receipt missing
- Validation report missing
- Evidence timestamp inconsistent with registry

Severity:
- High

---

## 3. Drift Detection Triggers

Drift checks must run:

- On every PR touching Template/Shell
- On scheduled scan (daily)
- Before provisioning
- Before template promotion

---

## 4. Drift Severity Mapping

| Severity   | Meaning                         | Action |
|------------|--------------------------------|--------|
| Low        | Non-blocking inconsistency     | Log    |
| Medium     | Requires review                | Flag   |
| High       | Integrity violation            | Block  |
| Critical   | Tampering or contract breach   | Freeze |

---

## 5. Enforcement Actions

Low:
- Emit audit event

Medium:
- Require admin review

High:
- Block promotion/provisioning

Critical:
- Trigger Freeze Protocol

---

## 6. Non-Bypassable Rule

Drift checks must execute:

- Server-side
- Pre-provision
- Pre-promotion
- Pre-registry commit

Client-side validation is insufficient.

---

End of Document
