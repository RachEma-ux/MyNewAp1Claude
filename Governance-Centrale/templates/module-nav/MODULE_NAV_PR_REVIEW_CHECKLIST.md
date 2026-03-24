# Module Nav — PR Review Checklist

## Template

Use this checklist when reviewing a pull request that touches module navigation code or governance docs.

---

## PR: [Title]

**Module:** [module-id]
**Change type:** [New adoption / Material change / Routine maintenance]
**Reviewer:** [Name/Role]
**Date:** [YYYY-MM-DD]

---

## 1. Scope Check

- [ ] Changes are limited to the stated module — no unrelated modules touched
- [ ] No silent architectural changes (check AGENTS.md behavioral rules)
- [ ] Change type matches the PR description

## 2. Nav Config Changes

- [ ] `validateModuleNavConfig()` passes with zero errors
- [ ] No live items with `backedBy: "not-yet-implemented"`
- [ ] New items have all mandatory fields
- [ ] Action strings follow `<module>.<domain>.<operation>` pattern
- [ ] Scope, visibility, and backedBy values are appropriate
- [ ] Implementation status accurately reflects reality

## 3. Route Changes

- [ ] New routes added to `App.tsx` for any new live items
- [ ] Section routes still mounted BEFORE flat routes
- [ ] No route conflicts introduced
- [ ] Old routes preserved (backward compatibility)

## 4. Registry Changes

- [ ] `moduleNavRegistry.ts` updated if module status changed
- [ ] Compliance status matches actual state
- [ ] Exception entries added/updated/closed as needed

## 5. Governance Docs

- [ ] Module governance pack updated if material changes
- [ ] `MODULE_NAV_ADOPTION_REGISTRY.md` updated if status changed
- [ ] `MODULE_NAV_COMPLIANCE_REPORT.md` updated if compliance changed
- [ ] `MODULE_NAV_EXCEPTION_REGISTRY.md` updated if exceptions changed
- [ ] `GOVERNANCE_INDEX.md` updated if new docs added

## 6. Tests

- [ ] Compliance tests pass
- [ ] Module-specific validation tests pass (if any)
- [ ] No test regressions in other modules

## 7. Governance Review Required?

Check `MODULE_NAV_GOVERNANCE_RULES.md` Section 2:
- [ ] Adding new sections or items → **Yes, governance review required**
- [ ] Changing requiredAction, scopeType, visibilityMode → **Yes**
- [ ] Changing implementationStatus from deferred to live → **Yes**
- [ ] Fixing label typos or icon changes → **No**

## 8. Verdict

- [ ] **Approved** — changes are correct and complete
- [ ] **Changes requested** — issues noted above
- [ ] **Blocked** — governance violation or compliance failure
