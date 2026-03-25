# MODULE_AUDIT_MODEL — Organization Management

## Purpose

Defines the audit expectations for Organization Management (OM).

OM changes affect structural authority, reporting, position ownership, and downstream staffing decisions. For that reason, OM must be treated as a structurally sensitive domain.

## What Must Be Audited

### Structural mutations
- org unit created
- org unit updated
- org unit deactivated
- org unit deleted if ever allowed

### Job mutations
- job created
- job updated
- job retired / deprecated

### Position mutations
- position created
- position updated
- position state changed
- position reassigned to another org unit
- position linked to a different job

### Reporting mutations
- reporting relationship created
- reporting relationship changed
- reporting relationship removed

### Entity / cost-center mutations
- entity created or updated
- cost-center linkage changed

## Required Audit Fields

Each audited event should capture, at minimum:

- actor identity
- action name
- entity type
- entity identifier
- previous value snapshot where relevant
- new value snapshot where relevant
- timestamp
- request / trace id if available
- governance decision context if applicable

## Why OM Audit Matters

OM is the source of truth for:

- structural authority
- approval chain derivation
- position ownership
- organizational accountability

If OM mutations are not auditable, downstream HR and PS decisions become untrustworthy.

## Current Runtime Status

OM does not yet exist as a first-class runtime module.

Therefore, this audit model is currently doctrinal / pre-runtime.

Related observations:
- some OM-like capabilities currently appear in HR
- some control-plane surfaces appear in Digital HQ
- neither should be treated as a substitute for dedicated OM audit once OM exists

## Audit Strength Target

When implemented, OM should support:

- immutable structural change trail
- actor attribution for all high-impact changes
- evidence for reporting-line and position-state changes
- traceable link from structural changes to staffing approval chain derivation

## Known Pre-Implementation Gaps

- no dedicated OM router exists yet
- no dedicated OM audit service exists yet
- no dedicated OM evidence bundle exists yet
- migration from HR-hosted structure is not yet defined
