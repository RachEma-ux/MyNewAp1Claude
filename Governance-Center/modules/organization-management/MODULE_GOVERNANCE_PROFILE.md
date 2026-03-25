# MODULE_GOVERNANCE_PROFILE — Organization Management

## Governance Scope

OM governs the structural backbone of the enterprise model.

It defines:

- structural hierarchy
- position model
- authority chain
- organizational identity

## Governance Intent

- ensure a single source of truth for organizational structure
- prevent duplication of structure across HR and PM domains
- ensure authority chain is derivable from structure
- provide stable foundation for cross-module staffing decisions

## Authority Model

OM does not assign people directly.

OM defines:
- who is responsible for positions
- reporting hierarchy
- authority escalation path

## Lifecycle Expectations

OM entities must support lifecycle states such as:

- active
- inactive
- frozen
- deprecated

Positions must support:

- vacant
- filled
- frozen
- temporary

## Relationship to Governance Engine

OM mutations must be governed via:

- governedProcedure
- lifecycle checks
- RBAC
- audit logging

## Compliance Principles

- structure must be consistent and non-duplicated
- authority must be derivable from structure
- structural changes must be auditable

## Key Invariants

- a position belongs to exactly one org unit
- a position maps to a job
- reporting chain must be acyclic
- authority must be resolvable

## Open Considerations

- migration path from HR-hosted structure
- integration with cross-domain staffing bridge
