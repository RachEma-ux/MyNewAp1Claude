# PM Central — Module Governance

## Overview

PM Central is the project management module with task tracking, planning, and team coordination.

## Governance Status: Partial

- PMT module has a governance schema (`server/modules/pmt/governance-schema.ts`)
- PM governance badge on UI (`client/src/components/workspace/PMGovernanceBadge.tsx`)
- Uses `protectedProcedure` for most operations

## Runtime References

| File | Location | Reason |
|---|---|---|
| PMT module | `server/modules/pmt/` | Runtime PM engine |
| PMT governance schema | `server/modules/pmt/governance-schema.ts` | Runtime schema |
| PM execution plans | `PM/` | Documentation — left in place |
| PM governance badge | `client/src/components/workspace/PMGovernanceBadge.tsx` | Vite build tree |
