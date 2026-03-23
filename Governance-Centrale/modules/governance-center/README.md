# Governance Center — Module Governance

## Overview

The Governance Center is the app module (menu item) that exposes governance features to users: scorecard, freeze management, audit reports, control catalog, and governance dashboard.

## Governance Status: Full (Self-Governed)

- Governance Center UI pages are governed by the governance engine itself
- Governance mutations use `governedProcedure`
- Self-check mechanism validates governance engine health

## Runtime References

| File | Location | Reason |
|---|---|---|
| Governance Center page | `client/src/pages/GovernanceCenterPage.tsx` | Vite build tree |
| Governance Scorecard page | `client/src/pages/GovernanceScorecard.tsx` | Vite build tree |
| Governance panels | `client/src/pages/governance/` | Vite build tree |
| Governance nav | `client/src/components/GovernanceNav.tsx` | Vite build tree |
| Governance engine | `server/governance/` | Runtime engine |
| Governance router | `server/governance/router.ts` | Runtime tRPC router |
| Governance audit router | `server/governance/audit-router.ts` | Runtime tRPC router |
