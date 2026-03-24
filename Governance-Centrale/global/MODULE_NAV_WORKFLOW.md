# Module Navigation — Contributor Workflow

## Document Status

- **Type:** Platform-wide contributor guide
- **Date:** 2026-03-24
- **Version:** 1.0.0
- **Phase:** 14

---

## 1. Purpose

This document provides a step-by-step workflow for contributors who need to add, change, or maintain module navigation configurations. It connects the standard, templates, governance rules, and tooling into a single actionable guide.

---

## 2. Before You Start

### Read These First

1. `Governance-Centrale/global/MODULE_NAV_STANDARD.md` — What the standard requires
2. `Governance-Centrale/global/MODULE_NAV_GOVERNANCE_RULES.md` — When governance review is needed
3. `Governance-Centrale/global/MODULE_NAV_DECISION_TREE.md` — Which adoption path to follow
4. `AGENTS.md` — Required orchestration order for substantial work

### Check the Current State

1. Review `Governance-Centrale/global/MODULE_NAV_ADOPTION_REGISTRY.md` — Is your module already tracked?
2. Review `client/src/navigation/moduleNavRegistry.ts` — Is it registered in code?
3. Review `Governance-Centrale/global/MODULE_NAV_EXCEPTION_REGISTRY.md` — Does it have an existing exception?

---

## 3. Workflow A: New Module Nav Adoption

Use this workflow when adding a new module to the nav standard for the first time.

### Step 1 — Determine Eligibility

Use the decision tree (`MODULE_NAV_DECISION_TREE.md`) to determine whether the module should adopt fully, partially, or be deferred/exempted.

### Step 2 — Governance Analysis

1. Copy `Governance-Centrale/templates/module-nav/MODULE_NAV_GOVERNANCE_REVIEW.template.md`
2. Fill out all sections: permissions, scope, visibility, sensitivity, routes, implementation status
3. Get governance review approval (Governance Agent pass or team review)

### Step 3 — Create the Nav Config

**Option A — Use the scaffolding script:**

```bash
npx tsx scripts/scaffold-module-nav.ts <module-id> "<Module Label>" /<base-route>
```

This generates:
- `client/src/config/<module>NavConfig.ts` (skeleton from template)
- `Governance-Centrale/modules/<module>/README.md` (governance pack stub)
- `Governance-Centrale/modules/<module>/MODULE_GOVERNANCE_PROFILE.md` (profile stub)
- Console output with a registry entry to paste into `moduleNavRegistry.ts`

**Option B — Manual creation:**

1. Copy `Governance-Centrale/templates/module-nav/MODULE_NAV_CONFIG.template.ts`
2. Save as `client/src/config/<module>NavConfig.ts`
3. Replace all placeholders with module-specific values
4. Import types from `client/src/navigation/moduleNavTypes.ts`

### Step 4 — Register the Module

1. Add an entry to `client/src/navigation/moduleNavRegistry.ts`
2. Use the template from `Governance-Centrale/templates/module-nav/MODULE_NAV_ADOPTION_ENTRY.template.md` as a reference

### Step 5 — Set Up Routes

1. Add section landing routes in `client/src/App.tsx`
2. Mount section routes BEFORE flat routes (wouter first-match-wins)
3. If migrating from flat routes, create a route alias map
4. Ensure all old routes remain mounted

### Step 6 — Create Governance Pack

At minimum create:
- `Governance-Centrale/modules/<module>/README.md`
- `Governance-Centrale/modules/<module>/MODULE_GOVERNANCE_PROFILE.md`

Add as appropriate:
- `MODULE_CONTROL_SURFACE.md`
- `MODULE_RISKS.md`
- `MODULE_OPEN_GAPS.md`
- `MODULE_RUNTIME_REFERENCES.md`

### Step 7 — Validate

1. Run `validateModuleNavConfig()` against your config — must return zero errors
2. Run the compliance test suite: `npx vitest run server/__tests__/module-nav-compliance.test.ts`
3. Use `Governance-Centrale/templates/module-nav/MODULE_NAV_VALIDATION_CHECKLIST.md` to verify

### Step 8 — Handle Exceptions

If the module cannot fully comply yet:
1. Copy `Governance-Centrale/templates/module-nav/MODULE_NAV_EXCEPTION_ENTRY.template.md`
2. Fill it out and add it to `Governance-Centrale/global/MODULE_NAV_EXCEPTION_REGISTRY.md`
3. Set `complianceStatus` to `"partially-compliant"` in the registry

### Step 9 — Update Indexes

1. Update `Governance-Centrale/global/MODULE_NAV_ADOPTION_REGISTRY.md`
2. Update `Governance-Centrale/index/GOVERNANCE_INDEX.md`
3. Update `Governance-Centrale/README.md`
4. Update `Governance-Centrale/global/MODULE_NAV_COMPLIANCE_REPORT.md`

### Step 10 — Follow AGENTS.md

For substantial work, execute: Planner -> Builder -> Reviewer -> Tester -> Governance

---

## 4. Workflow B: Material Nav Change to an Adopted Module

Use this when changing an existing module's nav config in a way that affects governance (permissions, scope, visibility, new sections/items, status changes).

### Step 1 — Governance Review

1. Fill out `MODULE_NAV_GOVERNANCE_REVIEW.template.md` for the specific change
2. Document what is changing and why

### Step 2 — Implement Changes

1. Edit the module's canonical nav config
2. Update routes in `App.tsx` if needed
3. Update any module-specific validators

### Step 3 — Validate

1. Run structural validation
2. Run compliance tests
3. Check for drift against baseline (if the module has one)

### Step 4 — Update Governance Docs

1. Update the module's governance pack (control surface, gaps, risks)
2. Update or close exceptions if the change resolves a gap
3. Update compliance report if compliance level changes

### Step 5 — Review Checklist

Use `Governance-Centrale/templates/module-nav/MODULE_NAV_PR_REVIEW_CHECKLIST.md`

---

## 5. Workflow C: Exception / Partial Adoption Path

Use this when a module cannot fully adopt the standard.

1. Determine what aspect cannot be met (see enforcement policy Section 6)
2. Copy the exception entry template
3. Fill out: reason, scope, compensating controls, review date
4. Add to `MODULE_NAV_EXCEPTION_REGISTRY.md`
5. Set `complianceStatus` to `"partially-compliant"` in registry
6. Update compliance report

---

## 6. Workflow D: Routine Maintenance

For small, non-governance changes (label fixes, icon changes, etc.):

1. Edit the nav config directly
2. Run structural validation
3. No governance review needed (per governance rules Section 2)
4. Commit with a clear message

---

## 7. Quick Reference

| I want to... | Start here |
|---|---|
| Add a new module to the nav standard | Workflow A (Step 1) |
| Change permissions/scope/visibility on an existing module | Workflow B |
| Add new sections or items to an existing module | Workflow B |
| Change an item from "not-started" to "live" | Workflow B |
| Fix a typo in a label | Workflow D |
| Document why a module can't fully comply | Workflow C |
| Understand which path my module should take | `MODULE_NAV_DECISION_TREE.md` |
| Check what's currently adopted/compliant | `MODULE_NAV_ADOPTION_REGISTRY.md` |
| See what a finished adoption looks like | HR reference: `client/src/config/hrNavConfig.ts` |
