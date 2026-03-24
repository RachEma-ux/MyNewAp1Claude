# Module Navigation — Governance Rules

## Document Status

- **Type:** Platform-wide governance policy
- **Date:** 2026-03-24
- **Version:** 1.0.0
- **Enforcement:** Mandatory for all module nav changes

---

## 1. Governance-First Rule

**No module nav expansion starts with code only.**

Navigation changes alter the governance surface of a module. Every new module nav or material nav change must define governance metadata before implementation begins.

Before writing any nav config code, the contributor must document:

1. **Permissions** — What `requiredAction` applies to each new/changed item
2. **Scope** — What `scopeType` applies (self/team/all/sensitive/mixed)
3. **Visibility** — What `visibilityMode` is appropriate
4. **Sensitivity** — Whether masking, sensitive-read audit, or elevated actions are needed
5. **Route strategy** — What route path, whether migrating from a flat route, whether backward compatibility aliases are needed
6. **Implementation status** — Whether the item will be live, placeholder, or deferred
7. **Audit implications** — Whether mutations or sensitive reads need audit logging
8. **Open gaps** — What is intentionally not covered and why

This analysis must be captured in a governance review document (see template: `Governance-Centrale/templates/module-nav/MODULE_NAV_GOVERNANCE_REVIEW.template.md`).

---

## 2. When Governance Review Is Required

A governance review is required when:

| Change Type | Review Required? |
|---|---|
| Adding a new module nav config | Yes |
| Adding a new section to an existing module nav | Yes |
| Adding new items to an existing section | Yes |
| Changing `requiredAction` on an existing item | Yes |
| Changing `scopeType` on an existing item | Yes |
| Changing `visibilityMode` on an existing item | Yes |
| Changing `implementationStatus` from deferred to live | Yes |
| Fixing a typo in `label` or `purpose` | No |
| Changing `iconHint` | No |
| Updating `currentComponent` to point to a renamed file | No (but verify route coherence) |

---

## 3. Governance Metadata Requirements

### 3.1 Mandatory Fields

Every nav item must have:

- `id` — unique across the module
- `label` — human-readable display label
- `href` — target route starting with the module's base route
- `section` — parent section ID
- `requiredAction` — permission action string matching `<module>.<domain>.<operation>[.<qualifier>]`
- `scopeType` — one of: self, team, all, sensitive, mixed
- `visibilityMode` — one of: show, hide-if-no-access, show-disabled, redirect-to-parent
- `backedBy` — one of: existing-page, new-page, tab-in-existing-page, not-yet-implemented
- `backendDomain` — which backend domain serves this capability
- `implementationStatus` — one of: live, placeholder, planned, not-started

### 3.2 Conditional Mandatory Fields

| Condition | Required Field |
|---|---|
| `maskingRequired: true` | `sensitiveAction` (warning if missing) |
| `sensitiveReadAudit: true` | `sensitiveAction` |
| `scopeType: "mixed"` | `scopeActions` (at least one of global/team/self) |
| `implementationStatus: "live"` | `currentRoute` or `href` must be a valid mounted route |
| `backedBy: "existing-page"` | `currentComponent` |

### 3.3 Coherence Rules

- `implementationStatus: "live"` + `backedBy: "not-yet-implemented"` = **invalid**
- `scopeType: "sensitive"` should use `visibilityMode: "hide-if-no-access"` (not "show")
- `implementationStatus: "not-started"` items must NOT have page components on disk
- `maskingRequired: true` without `maskingFieldSet` (or module-equivalent) = **invalid**

---

## 4. How Not-Yet-Implemented Items Are Handled

Items that are defined in the nav config but not yet backed by real surfaces must:

1. Use `implementationStatus: "not-started"` and `backedBy: "not-yet-implemented"`
2. NOT have dead-end navigation — no routes pointing to empty pages
3. NOT have page component files on disk
4. Appear as "Coming soon" in section landing pages
5. NOT be falsely represented as completed capabilities

---

## 5. Backward Compatibility Rules

When migrating routes:

1. Old routes must remain mounted until redirect activation is explicitly approved
2. Route aliases must be documented with status "documented" or "active-redirect"
3. Redirect activation requires governance review (changes user-facing behavior)
4. No existing bookmarks, documentation links, or integrations may break without notice

---

## 6. Module Nav Change Process

1. **Propose** — Describe the nav change and its governance implications
2. **Analyze** — Fill out the governance review template
3. **Implement** — Build the nav config changes following the approved analysis
4. **Validate** — Run structural validation and tests
5. **Review** — Reviewer agent checks implementation against proposal
6. **Governance** — Governance agent verifies policy compliance
7. **Update Governance-Centrale** — Update module governance pack and indexes

---

## 7. Governance-Centrale Updates

When a new module nav is introduced or materially changed:

1. Create or update the module's governance pack in `Governance-Centrale/modules/<module>/`
2. Update `Governance-Centrale/index/GOVERNANCE_INDEX.md`
3. If this is a new module's first nav config, add it to `Governance-Centrale/README.md`
4. Document any open gaps in the module's `MODULE_OPEN_GAPS.md`
5. Document any risks in the module's `MODULE_RISKS.md`
