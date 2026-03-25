# MODULE_OPEN_GAPS — Culture Values

## Purpose

Documents the current known gaps for Culture Values governance and future implementation.

---

## Resolved Gaps

### ~~G1 — No runtime module yet~~ → RESOLVED
Culture Values is now a first-class runtime module (key: `cv`) with schema, router, lifecycle, validation, and audit.

### ~~G2 — No dedicated values engine yet~~ → RESOLVED
Runtime engine implemented: value set lifecycle (draft→active→deprecated→archived), publish readiness validation, behavior model management, and operationalization templates.

### ~~G9 — No dedicated audit service yet~~ → RESOLVED
Dedicated CV audit service implemented (`server/culture-values/audit.ts`) with 18 action types covering all CRUD and lifecycle events.

---

## Current Open Gaps

### G3 — No automated drift detection yet
Subculture drift, contradictory local mappings, and evaluation inconsistency are not yet automatically detected.

### G4 — No HR integration yet
Hiring scorecards, onboarding acknowledgements, performance reviews, 360 feedback, and recognition are not yet consuming Culture Values through a formal runtime path.

### G5 — No PM integration yet
PM Central does not yet formally consume Culture Values for delivery behavior expectations and project-team conduct guidance.

### G6 — No Workspace runtime consumption yet
Workspace does not yet surface values-driven execution guidance through a dedicated Culture Values integration path.

### G7 — No vendor / partner automation yet
Vendor value clauses and partner alignment controls are defined conceptually but not automated in runtime.

### G8 — No dedicated analytics/drift module yet
Value heatmaps, culture drift alerts, behavior-mapping coverage, and values-fit analytics are not yet implemented.

---

## Status

Phase 1 core runtime is complete (G1, G2, G9 resolved). Remaining gaps (G3–G8) are integration and analytics features planned for future phases.
