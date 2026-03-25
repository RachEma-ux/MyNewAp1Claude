# MODULE_CONTROL_SURFACE — Organization Management

## Purpose

Defines all governance-relevant control points for OM.

## Core Control Areas

### Structure Management
- create org unit
- update org unit
- delete org unit

### Job Management
- create job
- update job
- retire job

### Position Management
- create position
- update position
- assign position to org unit
- change position state (vacant/filled/frozen)

### Reporting Relationships
- assign manager
- change reporting line

### Entity Management
- create company entity
- update entity

## Governance Expectations

Each control must:

- enforce RBAC
- validate structural integrity
- log audit events
- respect lifecycle constraints

## Phase Classification

- structure creation → design phase
- structure update → controlled mutation
- authority changes → high-risk mutation
