# MODULE_PERIODIC_CHECKS — Organization Management

## Purpose

Defines recurring governance checks for Organization Management (OM).

## Required Checks

### Structural integrity
- orphan org units (no parent where required)
- cyclic reporting relationships
- positions without org units
- jobs without positions

### Position health
- positions marked filled but no incumbent
- positions marked vacant but with incumbent assigned
- frozen positions still referenced in active staffing

### Authority chain
- missing reporting manager in chain
- broken escalation paths

### Cross-module consistency
- positions referenced in HR but missing in OM
- positions referenced in assignments but not active

### Drift detection
- structural changes not followed by audit entries
- unexpected changes outside governance paths

## Cadence

- daily automated checks for structural integrity
- weekly governance review for authority chain
- monthly audit for drift and anomalies

## Severity

- critical: authority-chain breaks, orphan assignments
- high: inconsistent position state
- medium: missing optional metadata

## Current Status

Pre-runtime definition only.

Checks will become enforceable once OM runtime exists.
