# Publication & Lifecycle — Platform Domain

## Overview

Covers entity lifecycle management (draft → active → deprecated) and publication gates that enforce pre-publish checks.

## Components

| Component | Location | Purpose |
|---|---|---|
| Lifecycle guard | `server/governance/lifecycle-guard.ts` | Lifecycle transition rules |
| Publication gate | `server/governance/publication-gate.ts` | Pre-publish validation |
| Stage review | `server/governance/stage-review.ts` | Stage review checklist |
| Agent promotions | `server/agents/promotions/` | Agent promotion lifecycle |
| Discovery artifact | `server/governance/discovery-artifact.ts` | Publication discovery |

## Lifecycle States

Entities follow: `draft` → `active` → `deprecated` → `disabled`

Publication gate enforces:
- All required fields present
- Governance scorecard above threshold
- No active freeze blocking publication
- Lifecycle stage allows transition

## Known Gaps

- Agent promotion freeze check is a no-op mock (H1)
- `checkActiveIncidents()` always returns empty array

## All files are runtime-critical and remain in their original locations.
