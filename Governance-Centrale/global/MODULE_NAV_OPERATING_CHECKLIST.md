# Module Navigation — Operating Checklist

## Document Status

- **Type:** Reusable operational checklist
- **Date:** 2026-03-24
- **Version:** 1.0.0
- **Phase:** 14

---

## Usage

Copy and use this checklist every time you make a module-nav change. Check applicable items based on the type of change.

---

## A. New Module Nav Adoption

- [ ] Decision tree consulted — adoption path determined
- [ ] Governance review template filled out
- [ ] Nav config created using shared contract (`moduleNavTypes.ts`)
- [ ] `validateModuleNavConfig()` passes with zero errors
- [ ] Module registered in `client/src/navigation/moduleNavRegistry.ts`
- [ ] Routes mounted in `client/src/App.tsx`
- [ ] Section routes mounted BEFORE flat routes
- [ ] Governance pack created (`Governance-Centrale/modules/<module>/`)
- [ ] Exception entry created if not fully compliant
- [ ] `MODULE_NAV_ADOPTION_REGISTRY.md` updated
- [ ] `MODULE_NAV_COMPLIANCE_REPORT.md` updated
- [ ] `GOVERNANCE_INDEX.md` updated
- [ ] `Governance-Centrale/README.md` updated
- [ ] Compliance tests pass: `npx vitest run server/__tests__/module-nav-compliance.test.ts`
- [ ] AGENTS.md orchestration followed (Planner -> Builder -> Reviewer -> Tester -> Governance)

---

## B. Material Nav Change to Adopted Module

- [ ] Governance review template filled out for the change
- [ ] Nav config updated
- [ ] `validateModuleNavConfig()` passes with zero errors
- [ ] Routes updated in `App.tsx` if needed
- [ ] No live items without routes
- [ ] No live items with `backedBy: "not-yet-implemented"`
- [ ] Module governance pack updated (control surface, gaps, risks)
- [ ] Exceptions updated or closed if change resolves a gap
- [ ] Compliance report updated if compliance level changes
- [ ] Compliance tests pass

---

## C. Partial Adoption / Exception Path

- [ ] Exception entry created from template
- [ ] Exception has: reason, scope, compensating controls, review date, next action
- [ ] Exception added to `MODULE_NAV_EXCEPTION_REGISTRY.md`
- [ ] Registry `complianceStatus` set to `"partially-compliant"`
- [ ] Exception IDs listed in registry entry
- [ ] Compliance report updated

---

## D. Rollout Readiness (Pre-Ship)

- [ ] All live items have page components on disk
- [ ] All live items have routes in App.tsx
- [ ] All deferred items shown as "Coming soon" (not dead ends)
- [ ] Feature flags set in module router settings
- [ ] Backward compatibility preserved (old routes still work)
- [ ] Compliance tests pass
- [ ] Governance pack is up to date
- [ ] Reviewer pass completed
- [ ] Governance pass completed

---

## E. Routine Maintenance (Label Fixes, Icon Changes)

- [ ] Nav config updated
- [ ] `validateModuleNavConfig()` passes
- [ ] No governance review needed (per governance rules Section 2)
- [ ] Commit with clear message
