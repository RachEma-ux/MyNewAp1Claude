# PM Central Module — Governance Pack

## Document Status

- **Module:** PM Central (Project Management)
- **Nav standard adoption:** Phase 11 (pilot)
- **Last updated:** 2026-03-24

---

## Overview

PM Central is the platform's project management module. It provides project lifecycle management, planning, execution tracking, risk/change control, collaboration, reporting, methodology, and AI-assisted project intelligence.

PM Central was selected as the **first pilot module** for adopting the shared module-nav standard (originally developed for HR in Phases 1–10) because:

1. **Substantial route surface** — 15+ routes, 56+ component files
2. **Already visible** — has its own sidebar section in the app shell
3. **Natural sections** — clear groupings that map well to the nav standard
4. **No backend redesign needed** — purely frontend navigation structure
5. **Lower-risk than HR** — no PII, no field masking, simpler permission model
6. **Good reuse test** — enough sections to validate the shared contract meaningfully

---

## Governance Documents

| Document | Purpose |
|---|---|
| [MODULE_GOVERNANCE_PROFILE.md](MODULE_GOVERNANCE_PROFILE.md) | Module identity, classification, and permission model |
| [MODULE_CONTROL_SURFACE.md](MODULE_CONTROL_SURFACE.md) | Nav-as-governance surface, control points |
| [MODULE_RISKS.md](MODULE_RISKS.md) | Module-level risks and mitigations |
| [MODULE_OPEN_GAPS.md](MODULE_OPEN_GAPS.md) | Known gaps and deferred items |
| [MODULE_RUNTIME_REFERENCES.md](MODULE_RUNTIME_REFERENCES.md) | Key file paths and runtime references |

---

## Nav Config Source of Truth

`client/src/config/pmNavConfig.ts`

- 8 sections, 12 leaf items
- All items currently backed by existing pages (100% live)
- Uses shared `ModuleNavConfig` contract from `moduleNavTypes.ts`
- Validated by `pmNavConfigValidator.ts`

---

## What Phase 11 Proved

1. The shared `ModuleNavConfig` contract generalizes cleanly from HR
2. PM Central's simpler permission model does not need HR's masking/audit extensions
3. The sidebar integration pattern (config-driven rendering) works for any module
4. Governance doc templates are reusable with module-specific content
5. Validation utilities (structural checks, route coherence) are fully reusable
