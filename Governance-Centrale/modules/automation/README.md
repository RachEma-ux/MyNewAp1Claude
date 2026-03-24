# Automation Module — Governance Pack

## Document Status

- **Module:** Automation (Workflow Orchestration)
- **Nav standard adoption:** Phase 12 (Wave 1)
- **Last updated:** 2026-03-24

---

## Overview

Automation is the platform's workflow orchestration module. It provides visual workflow building, trigger/action component stores, execution tracking, secrets management, and automation configuration.

Automation was selected as the **first Wave 1 module** for the shared module-nav standard because:

1. **Clear route surface** — 7 existing routes, all live and functional
2. **Natural sections** — workflows, components (triggers/actions), and configuration
3. **No PII** — no field masking or sensitive-read audit needed
4. **Simple permission model** — workspace-role based, no org-hierarchy scoping
5. **Different domain than HR/PM** — proves the standard generalizes beyond people/project management
6. **Minimal backend impact** — purely frontend navigation structure change

---

## Governance Documents

| Document | Purpose |
|---|---|
| [MODULE_GOVERNANCE_PROFILE.md](MODULE_GOVERNANCE_PROFILE.md) | Module identity, classification, and permission model |
| [MODULE_CONTROL_SURFACE.md](MODULE_CONTROL_SURFACE.md) | Nav-as-governance surface, control points |
| [MODULE_AUDIT_MODEL.md](MODULE_AUDIT_MODEL.md) | Audit logging model |
| [MODULE_PERIODIC_CHECKS.md](MODULE_PERIODIC_CHECKS.md) | Periodic validation checks |
| [MODULE_RISKS.md](MODULE_RISKS.md) | Module-level risks and mitigations |
| [MODULE_OPEN_GAPS.md](MODULE_OPEN_GAPS.md) | Known gaps and deferred items |
| [MODULE_RUNTIME_REFERENCES.md](MODULE_RUNTIME_REFERENCES.md) | Key file paths and runtime references |

---

## Nav Config Source of Truth

`client/src/config/automationNavConfig.ts`

- 3 sections, 7 leaf items
- All items backed by existing pages (100% live)
- Uses shared `ModuleNavConfig` contract from `navigation/moduleNavTypes.ts`
- Validated by `automationNavConfigValidator.ts`

---

## What Phase 12 Proved

1. The shared `ModuleNavConfig` contract generalizes cleanly to a third domain
2. A workflow/infrastructure module does not need HR's masking/audit extensions
3. The sidebar config-driven rendering pattern works across module types
4. Governance doc templates are reusable with module-specific content
5. Cross-module validation catches structural issues uniformly
