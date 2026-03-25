# Organization Management — Module Governance Package

## Overview

Organization Management (OM) is the future module that will own the platform's formal organizational structure.

OM is introduced here first as a **governance-defined module** before runtime implementation, in line with the platform's governance-first rule.

OM is not Digital HQ.
OM is not HR.
OM is not PM Central.

OM is the module that will own:

- org units
- jobs
- positions
- reporting relationships
- company entities
- cost centers
- organizational roles
- vacancy / filled / frozen / temporary states
- authority-chain derivation from structure

## Governance Package Status

**Documentation-pack status:** Full initial governance pack created.

**Runtime status:** Pre-implementation / not yet built as a first-class runtime module.

This means:

- the governance packet is intentionally ahead of runtime
- OM is now governance-defined
- implementation must follow this packet and the global doctrine

## Relationship to Other Modules

### HR
HR owns people and workforce capability:

- employees
- contracts
- skills
- certifications
- calendars
- availability
- performance

HR does not own long-term organizational structure once OM is introduced.

### PM Central / PS
PM Central owns project demand and delivery:

- portfolios
- projects
- WBS
- project roles
- execution
- reporting

PM Central requests resources. It does not directly own employee master data.

### Workspace
Workspace is the governed execution environment that consumes OM / HR / PS outputs.

Workspace does not own OM master data.

### AI Types
AI Types remains the source of AI-side participant and capability definitions for Crew.

## Bridge Doctrine

The OM–HR–PS operating model depends on a governed bridge made of:

- `resource_request`
- `resource_assignment`

These are not owned solely by OM.
They are part of a cross-domain governed transaction layer.

## Where to Start

Read in this order:

1. [MODULE_GOVERNANCE_PROFILE.md](MODULE_GOVERNANCE_PROFILE.md)
2. [MODULE_CONTROL_SURFACE.md](MODULE_CONTROL_SURFACE.md)
3. [MODULE_AUDIT_MODEL.md](MODULE_AUDIT_MODEL.md)
4. [MODULE_PERIODIC_CHECKS.md](MODULE_PERIODIC_CHECKS.md)
5. [MODULE_RISKS.md](MODULE_RISKS.md)
6. [MODULE_OPEN_GAPS.md](MODULE_OPEN_GAPS.md)
7. [MODULE_RUNTIME_REFERENCES.md](MODULE_RUNTIME_REFERENCES.md)

## Current Runtime Clarification

At the time of this pack creation:

- OM-like capabilities are partially present under HR surfaces
- Digital HQ exposes control-plane and navigation surfaces, but is not OM
- no first-class OM runtime module exists yet
- no authoritative OM router / schema / service layer exists yet

This packet exists specifically to prevent ad hoc implementation drift.
