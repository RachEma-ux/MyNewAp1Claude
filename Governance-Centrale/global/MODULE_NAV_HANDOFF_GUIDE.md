# Module Navigation — Handoff Guide

## Document Status

- **Type:** Platform-wide handoff and continuity guide
- **Date:** 2026-03-24
- **Version:** 1.0.0
- **Phase:** 14

---

## 1. Purpose

This document helps future contributors continue module-nav work without re-deriving the process. It covers what to inspect, how the pieces connect, and where to find everything.

---

## 2. Architecture Overview

The module-nav system has these layers:

```
Governance-Centrale/global/      Platform standards, policies, registries
Governance-Centrale/modules/     Per-module governance packs
Governance-Centrale/templates/   Copy-ready templates for adoption
client/src/navigation/           Shared types, helpers, code-facing registry
client/src/config/               Per-module canonical nav configs
client/src/App.tsx               Route registration
server/__tests__/                Compliance validation tests
scripts/                         Scaffolding utility
```

### How They Connect

1. **Shared contract** (`client/src/navigation/moduleNavTypes.ts`) defines the shape
2. **Module configs** (`client/src/config/<module>NavConfig.ts`) implement the shape
3. **Shared helpers** (`client/src/navigation/moduleNavHelpers.ts`) provide validation
4. **Code-facing registry** (`client/src/navigation/moduleNavRegistry.ts`) tracks all modules
5. **Compliance tests** (`server/__tests__/module-nav-compliance.test.ts`) enforce consistency
6. **Governance docs** (`Governance-Centrale/`) document policies, risks, and gaps

---

## 3. Before Touching Any Module Nav

### Inspect Checklist

- [ ] Read `MODULE_NAV_STANDARD.md` — what's required
- [ ] Read `MODULE_NAV_GOVERNANCE_RULES.md` — when governance review is needed
- [ ] Check `MODULE_NAV_ADOPTION_REGISTRY.md` — current module states
- [ ] Check `MODULE_NAV_EXCEPTION_REGISTRY.md` — active exceptions
- [ ] Read the target module's governance pack in `Governance-Centrale/modules/<module>/`
- [ ] Read the target module's nav config in `client/src/config/<module>NavConfig.ts`
- [ ] Check the target module's routes in `client/src/App.tsx`
- [ ] Review `MODULE_NAV_COMMON_FAILURES.md` — avoid known mistakes

---

## 4. Key Files and What They Control

| File | What It Controls | When to Update |
|---|---|---|
| `client/src/navigation/moduleNavTypes.ts` | Shared type contract | When the standard shape changes (rare) |
| `client/src/navigation/moduleNavHelpers.ts` | Shared validation + utilities | When validation rules change |
| `client/src/navigation/moduleNavRegistry.ts` | Platform-wide adoption/compliance state | When a module is added, changes status, or compliance changes |
| `client/src/config/<module>NavConfig.ts` | Module's nav definition | When the module's nav changes |
| `client/src/App.tsx` | Route registration | When routes are added, moved, or removed |
| `server/__tests__/module-nav-compliance.test.ts` | Machine-enforced compliance | When a new module is adopted or rules change |
| `Governance-Centrale/global/MODULE_NAV_ADOPTION_REGISTRY.md` | Human-readable adoption status | When adoption/compliance changes |
| `Governance-Centrale/global/MODULE_NAV_EXCEPTION_REGISTRY.md` | Exception tracking | When exceptions are added, reviewed, or closed |
| `Governance-Centrale/global/MODULE_NAV_COMPLIANCE_REPORT.md` | Compliance snapshot | When compliance state changes |
| `Governance-Centrale/modules/<module>/` | Module governance pack | When module nav or governance surface changes |

---

## 5. Common Handoff Scenarios

### "I need to add a new module to the nav standard"

Follow `MODULE_NAV_WORKFLOW.md` Workflow A. Start with the decision tree to determine the adoption path.

### "I need to add items to an existing adopted module"

Follow `MODULE_NAV_WORKFLOW.md` Workflow B. Remember: governance review is required for new items.

### "A compliance test is failing"

1. Check `server/__tests__/module-nav-compliance.test.ts` for the specific failure
2. Common causes: missing registry entry, validation errors, status inconsistency
3. Fix the root cause in the nav config or registry, not by weakening the test

### "An exception needs to be reviewed or closed"

1. Check the exception in `MODULE_NAV_EXCEPTION_REGISTRY.md`
2. If the gap is fixed, move the exception to "Closed Exceptions"
3. Update the module's `complianceStatus` in `moduleNavRegistry.ts`
4. Update the compliance report

### "I need to understand what HR does differently"

HR is the reference implementation with features other modules may not need:
- Field masking (`maskingRequired`, `maskingFieldSet`) — HR-specific PII protection
- Sensitive read audit (`sensitiveReadAudit`, `sensitiveAction`) — HR-specific logging
- Scope resolution actions (`scopeActions`) — HR's org-hierarchy model
- Route aliases — HR migrated from flat routes; new modules start clean
- Frozen baseline + drift detection — HR Phase 9 operationalization

See `Governance-Centrale/modules/human-resources/CARBON_SIDENAV_REFERENCE_IMPLEMENTATION.md`

---

## 6. What to Update After Changes

Use the `MODULE_NAV_OPERATING_CHECKLIST.md` for a quick post-change verification. At minimum:

1. **Nav config** — Is it structurally valid?
2. **Routes** — Are new routes mounted in App.tsx?
3. **Registry** — Is the code-facing registry accurate?
4. **Governance pack** — Is the module's governance pack updated?
5. **Adoption registry** — Is the human-readable registry accurate?
6. **Compliance report** — Does it reflect the current state?
7. **Exception registry** — Are exceptions current?
8. **Tests** — Do compliance tests pass?

---

## 7. Phase History

| Phase | What It Did | Key Output |
|---|---|---|
| 1-9 | Built HR Carbon SideNav (reference implementation) | 13 sections, 68 items, full governance |
| 10 | Extracted shared contract from HR | `moduleNavTypes.ts`, `moduleNavHelpers.ts` |
| 11 | Pilot adoption (PM Central) | `pmNavConfig.ts`, PM governance pack |
| 12 | Wave 1 adoption (Automation) | `automationNavConfig.ts`, automation governance pack |
| 13 | Enforcement, exceptions, compliance automation | Enforcement policy, exception registry, compliance tests |
| 14 | Contributor workflow, scaffolding, handoff | This document, workflow, templates, scaffolding script |
