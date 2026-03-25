# MODULE_RUNTIME_REFERENCES — Organization Management

## Purpose

Maps OM governance to actual runtime implementation locations.

## Current State

OM does not yet exist as a runtime module.

Therefore, this document references:

- where OM-like capabilities currently exist
- where OM runtime should be implemented

## Current Relevant Locations

### HR module (temporary structure host)
- server/hr/
- client/src/pages/hr/

Contains:
- organization
- job architecture
- positions

### Digital HQ (control-plane surfaces)
- client/src/pages/DigitalHQPage.tsx

Contains:
- Org Authority
- Roles
- control-plane navigation

### Governance Engine
- server/governance/
- server/_core/trpc.ts

Used for:
- governedProcedure
- lifecycle enforcement
- audit

## Future OM Runtime Locations

Expected structure:

- server/modules/organization-management/
- client/src/pages/organization-management/
- drizzle/tables/organization_management.ts

## Bridge Integration Points

OM will integrate with:

- HR module (employee ↔ position)
- PM Central (assignment approval chain)
- Workspace (execution context)

## Notes

This document will evolve as OM runtime is implemented.
