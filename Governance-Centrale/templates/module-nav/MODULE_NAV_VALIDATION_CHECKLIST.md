# Module Nav — Validation Checklist

## Template

Use this checklist to verify a module's nav config is correct and complete before marking it as adopted.

---

## Module: [MODULE_NAME]

**Date:** [YYYY-MM-DD]
**Validator:** [Name/Role]

---

## 1. Structural Validation

- [ ] `validateModuleNavConfig()` returns zero errors
- [ ] `validateModuleNavConfig()` warnings reviewed and accepted
- [ ] Config has at least one section
- [ ] Every section has at least one item
- [ ] No duplicate section IDs
- [ ] No duplicate item IDs across the entire config

## 2. Mandatory Fields

- [ ] Every section has: id, label, iconHint, purpose, href, requiredAction, scopeType, visibilityMode, backedBy, backendDomain, implementationStatus
- [ ] Every item has: id, label, href, section, requiredAction, scopeType, visibilityMode, backedBy, backendDomain, implementationStatus

## 3. Type Values

- [ ] All `scopeType` values are valid: self, team, all, sensitive, mixed
- [ ] All `visibilityMode` values are valid: show, hide-if-no-access, show-disabled, redirect-to-parent
- [ ] All `backedBy` values are valid: existing-page, new-page, tab-in-existing-page, not-yet-implemented
- [ ] All `implementationStatus` values are valid: live, placeholder, planned, not-started

## 4. Coherence Rules

- [ ] No item has `implementationStatus: "live"` + `backedBy: "not-yet-implemented"`
- [ ] No item has `implementationStatus: "not-started"` with a page component on disk
- [ ] Items with `scopeType: "sensitive"` use `visibilityMode: "hide-if-no-access"`
- [ ] Items with `scopeType: "mixed"` have `scopeActions` defined (if adopted module)

## 5. Route Coherence

- [ ] All `href` values start with the module's `baseRoute` + "/"
- [ ] All live items have routes mounted in `App.tsx`
- [ ] Section routes mounted BEFORE flat routes (if applicable)
- [ ] No route conflicts with other modules

## 6. Action String Format

- [ ] All `requiredAction` values follow pattern: `<module>.<domain>.<operation>[.<qualifier>]`
- [ ] Action namespace matches the module ID

## 7. Registry and Governance

- [ ] Module is registered in `moduleNavRegistry.ts`
- [ ] Governance pack exists at `Governance-Centrale/modules/<module>/`
- [ ] At minimum: README.md and MODULE_GOVERNANCE_PROFILE.md exist
- [ ] Compliance status accurately reflects current state

## 8. Compliance Test

- [ ] `npx vitest run server/__tests__/module-nav-compliance.test.ts` — all tests pass
