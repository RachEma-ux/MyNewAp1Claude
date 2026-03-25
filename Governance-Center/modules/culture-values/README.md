# Culture Values — Module Governance Package

## Overview

Culture Values is the future module/domain that will own the enterprise values framework and the governed behavior model used across the platform.

Culture Values is **not** Organization Management (OM).
Culture Values is **not** Human Resources (HR).
Culture Values is **not** PM Central.

Culture Values is the domain that will own:

- enterprise values catalog
- value categories / types
- value ownership
- expected behavior definitions
- anti-pattern definitions
- policy linkage
- vendor / partner value clauses
- evaluation rule definitions

## Governance Package Status

**Documentation-pack status:** Full initial governance pack created.

**Runtime status:** Pre-implementation / not yet built as a first-class runtime module.

This means:

- the governance packet is intentionally ahead of runtime
- Culture Values is now governance-defined
- implementation must follow this packet and the global doctrine

## Relationship to Other Modules

### Organization Management (OM)
OM owns enterprise structure:

- org units
- jobs
- positions
- reporting relationships
- entities
- cost centers

Culture Values does not own structure.

### Human Resources (HR)
HR owns workforce reality:

- employees
- contracts
- skills
- certifications
- calendars
- availability
- performance

HR consumes Culture Values for:

- hiring scorecards
- onboarding acknowledgements
- performance reviews
- 360 feedback
- recognition criteria

### PM Central / Project System (PS)
PM Central owns project demand and delivery.

PM Central consumes Culture Values for:

- delivery behavior expectations
- project team conduct expectations
- values-aligned execution norms

### Workspace
Workspace is the governed execution environment.

Workspace consumes Culture Values to surface:

- execution norms
- context-specific behavior expectations
- visible behavioral guidance

### Governance Center
Governance consumes Culture Values for:

- compliance interpretation
- drift detection
- escalation rules
- partner controls

## Core Design Rule

Values are defined centrally.
Behavior expectations are contextualized locally.
Local context must not contradict enterprise values.

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

- no first-class Culture Values runtime module exists yet
- no authoritative values engine exists yet
- no enterprise values lifecycle runtime exists yet
- no automated drift detection exists yet

This packet exists specifically to prevent values logic from being scattered across OM, HR, PM, and Workspace without a governed source of truth.
