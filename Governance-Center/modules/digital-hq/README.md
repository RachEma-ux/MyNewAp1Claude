# Digital HQ — Module Governance

## Overview

Digital HQ is the central dashboard and control plane UI for the platform.

## Governance Status: Minimal

- Dashboard displays governance status via scorecard widgets
- No dedicated governance controls on HQ-specific mutations
- Governance navigation handled by `GovernanceNav` component

## Runtime References

| File | Location | Reason |
|---|---|---|
| HQ dashboard page | `client/src/pages/DigitalHQPage.tsx` | Vite build tree |
| HQ control dashboard contracts | `Template/Shell/HQControlDashboardContracts.md` | Template doc — left in place |
