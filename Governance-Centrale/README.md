# Governance-Centrale

Central governance repository for platform-wide policies, standards, module governance packs, and reusable templates.

## Structure

```
Governance-Centrale/
  global/                  Platform-wide standards and policies
  index/                   Discovery indexes and scope definitions
  modules/                 Per-module governance packs
    human-resources/       HR module governance (reference implementation)
    pm-central/            PM Central governance (Phase 11 pilot)
    automation/            Automation governance (Phase 12 Wave 1)
  templates/               Reusable templates for governance artifacts
    module-nav/            Module navigation adoption templates
```

## Global Standards

| Document | Purpose |
|---|---|
| [MODULE_NAV_STANDARD.md](global/MODULE_NAV_STANDARD.md) | Platform standard for module Carbon SideNav navigation |
| [MODULE_NAV_GOVERNANCE_RULES.md](global/MODULE_NAV_GOVERNANCE_RULES.md) | Governance rules for module nav changes |
| [MODULE_NAV_ADOPTION_CHECKLIST.md](global/MODULE_NAV_ADOPTION_CHECKLIST.md) | Step-by-step checklist for adopting the module nav pattern |
| [MODULE_NAV_ADOPTION_REGISTRY.md](global/MODULE_NAV_ADOPTION_REGISTRY.md) | Platform-wide module nav adoption and compliance status |
| [MODULE_NAV_WAVE_PLAN.md](global/MODULE_NAV_WAVE_PLAN.md) | Rollout wave plan and selection criteria |

## Enforcement & Compliance (Phase 13)

| Document | Purpose |
|---|---|
| [MODULE_NAV_ENFORCEMENT_POLICY.md](global/MODULE_NAV_ENFORCEMENT_POLICY.md) | Enforceable compliance definitions, blocking failure rules, 10-group validation coverage |
| [MODULE_NAV_EXCEPTION_REGISTRY.md](global/MODULE_NAV_EXCEPTION_REGISTRY.md) | Formal exception model for non-compliant/partial states (8 active entries) |
| [MODULE_NAV_COMPLIANCE_REPORT.md](global/MODULE_NAV_COMPLIANCE_REPORT.md) | Current platform-wide compliance snapshot with file-existence verification |

## Contributor Workflow & Handoff (Phase 14)

| Document | Purpose |
|---|---|
| [MODULE_NAV_WORKFLOW.md](global/MODULE_NAV_WORKFLOW.md) | Step-by-step contributor workflow for all nav change types |
| [MODULE_NAV_DECISION_TREE.md](global/MODULE_NAV_DECISION_TREE.md) | Decision guide for adoption path selection |
| [MODULE_NAV_HANDOFF_GUIDE.md](global/MODULE_NAV_HANDOFF_GUIDE.md) | Handoff guide for future contributors |
| [MODULE_NAV_COMMON_FAILURES.md](global/MODULE_NAV_COMMON_FAILURES.md) | Common mistakes and drift patterns |
| [MODULE_NAV_OPERATING_CHECKLIST.md](global/MODULE_NAV_OPERATING_CHECKLIST.md) | Reusable checklist for routine changes |

## Indexes

| Document | Purpose |
|---|---|
| [GOVERNANCE_INDEX.md](index/GOVERNANCE_INDEX.md) | Master index of all governance artifacts |
| [GOVERNANCE_SCOPE.md](index/GOVERNANCE_SCOPE.md) | What governance covers and its boundaries |

## Module Governance Packs

| Module | Location | Status |
|---|---|---|
| Human Resources | [modules/human-resources/](modules/human-resources/) | Reference implementation (Phase 1-10) |
| PM Central | [modules/pm-central/](modules/pm-central/) | Pilot (Phase 11) |
| Automation | [modules/automation/](modules/automation/) | Wave 1 (Phase 12) |

## Templates

| Template Set | Location | Purpose |
|---|---|---|
| Module Navigation | [templates/module-nav/](templates/module-nav/) | Templates for new module nav adoption (9 templates) |

## Scaffolding

| Tool | Location | Purpose |
|---|---|---|
| Module Nav Scaffolding | `scripts/scaffold-module-nav.ts` | Generate starter files for new module adoption |

## Governance Model

This repository follows the AGENTS.md 5-agent orchestration model. Governance changes must pass through the Governance Agent role. See [AGENTS.md](../AGENTS.md) for the full team definition.

## Adding a New Module

**Quick start:** Run `npx tsx scripts/scaffold-module-nav.ts <module-id> "<label>" /<route>` to generate starter files.

**Full workflow:** See `global/MODULE_NAV_WORKFLOW.md` for the complete step-by-step guide.

**Manual steps:**

1. Create `modules/<module-name>/` with at minimum a `README.md` and `MODULE_GOVERNANCE_PROFILE.md`
2. Follow the templates in `templates/module-nav/` if adopting the Carbon SideNav pattern
3. Register the module in `client/src/navigation/moduleNavRegistry.ts`
4. If not yet compliant, create an exception entry in `global/MODULE_NAV_EXCEPTION_REGISTRY.md`
5. Update this README, `index/GOVERNANCE_INDEX.md`, and `global/MODULE_NAV_ADOPTION_REGISTRY.md`
6. Ensure the module's governance pack is reviewed via the Reviewer + Governance agent pass
