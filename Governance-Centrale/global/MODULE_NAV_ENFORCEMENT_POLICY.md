# Module Nav — Enforcement Policy

## Document Status

- **Type:** Platform-wide enforcement policy
- **Date:** 2026-03-24
- **Version:** 1.1.0
- **Phase:** 13 (reviewed and strengthened)

---

## 1. Purpose

This document defines the enforceable compliance rules for the module-nav standard. It establishes what it means for a module to be compliant, partially compliant, or exempt, and what is required before new module-nav work can proceed.

---

## 2. Compliance Levels

### 2.1 Compliant

A module is **compliant** when all of the following are satisfied:

| Requirement | Description |
|---|---|
| Canonical nav config exists | A file at `client/src/config/<module>NavConfig.ts` using the shared `ModuleNavConfig` contract |
| Shared contract used | Config imports types from `client/src/navigation/moduleNavTypes.ts` |
| All mandatory fields present | Every section and item has: id, label, href, requiredAction, scopeType, visibilityMode, backedBy, backendDomain, implementationStatus |
| Structural validation passes | `validateModuleNavConfig()` returns zero errors |
| Governance pack exists | `Governance-Centrale/modules/<module>/` with at minimum: README.md, MODULE_GOVERNANCE_PROFILE.md |
| Adoption registry entry exists | Module is listed in `client/src/navigation/moduleNavRegistry.ts` |
| Route coherence | Live items have valid mounted routes in App.tsx |
| No live/not-yet-implemented contradiction | No item is simultaneously `implementationStatus: "live"` and `backedBy: "not-yet-implemented"` |

### 2.2 Partially Compliant

A module is **partially compliant** when:

- The canonical nav config exists and uses the shared contract
- Structural validation passes (zero errors)
- But one or more of these are incomplete:
  - Governance pack is missing or minimal (e.g., only README.md)
  - Visibility/permission alignment is partial (not all items fully gated)
  - Route normalization is partial (some routes not yet section-based)
  - Some conditional metadata is missing (e.g., mixed-scope items without scopeActions)

Partially compliant modules must have an exception entry documenting what is deferred and when it will be addressed.

### 2.3 Exempt

A module is **exempt** from compliance when it falls into one of these categories:

| Category | Meaning | Registry Status |
|---|---|---|
| Legacy | Module uses hardcoded nav, not yet migrated | `legacy` |
| Deferred | Module evaluated and intentionally deferred (too small, immature, placeholder) | `deferred` |
| Not Applicable | Module does not need section-based nav (single-page, no sub-routes) | `not-applicable` |
| Pilot | Module is in active pilot/trial adoption | `pilot` (compliance not enforced yet) |

Exempt modules do not fail compliance checks, but legacy modules should have an exception entry with a next-review date.

---

## 3. Mandatory Governance Artifacts

For any adopted module (compliance status = compliant or partially-compliant):

| Artifact | Required? | Notes |
|---|---|---|
| `client/src/config/<module>NavConfig.ts` | **Mandatory** | Canonical nav config using shared contract |
| `client/src/navigation/moduleNavRegistry.ts` entry | **Mandatory** | Module must be registered |
| `Governance-Centrale/modules/<module>/README.md` | **Mandatory** | Module governance pack index |
| `Governance-Centrale/modules/<module>/MODULE_GOVERNANCE_PROFILE.md` | **Mandatory** | Identity card and classification |
| `Governance-Centrale/modules/<module>/MODULE_CONTROL_SURFACE.md` | Recommended | Route and nav inventory |
| `Governance-Centrale/modules/<module>/MODULE_RISKS.md` | Recommended | Risk register |
| `Governance-Centrale/modules/<module>/MODULE_OPEN_GAPS.md` | Recommended | Gap list |
| Module-specific validator (`<module>NavConfigValidator.ts`) | Recommended | Extends shared validation |

---

## 4. Mandatory Metadata Fields

Every nav item in a compliant module must have these fields:

| Field | Type | Mandatory? |
|---|---|---|
| `id` | string | Yes |
| `label` | string | Yes |
| `href` | string | Yes |
| `section` | string | Yes |
| `requiredAction` | string (matches `<module>.<domain>.<operation>`) | Yes |
| `scopeType` | ScopeType enum | Yes |
| `visibilityMode` | VisibilityMode enum | Yes |
| `backedBy` | BackedBy enum | Yes |
| `backendDomain` | string | Yes |
| `implementationStatus` | ImplementationStatus enum | Yes |

### 4.1 Conditional Mandatory Fields

| Condition | Required Field |
|---|---|
| `implementationStatus: "live"` | `currentRoute` or `href` must resolve to a mounted route |
| `backedBy: "existing-page"` | `currentComponent` (recommended) |
| `maskingRequired: true` | `sensitiveAction` |
| `sensitiveReadAudit: true` | `sensitiveAction` |
| `scopeType: "mixed"` + adopted | `scopeActions` (at least one of global/team/self) |

---

## 5. Route and Visibility Alignment

### 5.1 Route Rules

- All `href` values must start with the module's `baseRoute` + "/"
- All live items must have a route mounted in `App.tsx`
- Section landing routes (if used) must be mounted before flat routes (wouter first-match-wins)

### 5.2 Visibility Rules

- Items with `scopeType: "sensitive"` should use `visibilityMode: "hide-if-no-access"`
- `implementationStatus: "not-started"` items must NOT have page component files on disk
- `implementationStatus: "live"` + `backedBy: "not-yet-implemented"` = **blocking compliance failure**

---

## 6. What Can Remain Deferred Without Failing Compliance

The following gaps are **acceptable** and do not cause a compliance failure:

| Gap | Why Acceptable |
|---|---|
| Not all items are live | Deferred items shown as "Coming soon" is by design |
| Route aliases not yet activated | Old routes preserved alongside new ones |
| Optional fields missing (iconHint, purpose) | Nice-to-have, not governance-critical |
| Conditional fields missing on non-live items | Only enforced for live items |
| Module-specific validator not created | Shared validator covers the base contract |
| Full governance pack not yet complete | Partially compliant is an allowed state (with exception) |

---

## 7. Blocking Compliance Failures

The following are **blocking** — they must be fixed before a module can be marked compliant:

| Failure | Description |
|---|---|
| Missing nav config | No canonical nav config file exists |
| Shared contract not used | Config does not import from `moduleNavTypes.ts` |
| Structural validation fails | `validateModuleNavConfig()` returns errors |
| Missing registry entry | Module not in `moduleNavRegistry.ts` |
| Live/not-yet-implemented contradiction | Item is live but backedBy = not-yet-implemented |
| Missing mandatory fields | Required fields absent on any section or item |
| Route prefix violation | Item href does not start with module baseRoute |

---

## 8. Governance-First Rule for Future Changes

**No new or materially changed module-nav work starts without governance-first artifacts.**

Before writing nav config code, contributors must:

1. Have the module registered in `moduleNavRegistry.ts`
2. Have at minimum a governance pack README and governance profile
3. Have an exception entry if the module is not yet fully compliant
4. Follow the AGENTS.md orchestration order for substantial changes

Sandbox, pilot, and partial states are allowed only through the documented exception/registry path.

---

## 9. Validation Integration

Compliance is machine-checked via:

- `server/__tests__/module-nav-compliance.test.ts` — runs as part of `npm test`
- Checks all adopted modules against the compliance rules defined above
- Non-adopted modules (legacy, deferred, N/A) are skipped with documented reason
- Partially compliant modules must have matching exception entries

### 9.1 Validation Test Coverage (10 groups)

| Group | Focus |
|---|---|
| A | Registry integrity — required fields, unique IDs, unique routes |
| B | Structural validation — each adopted config passes `validateModuleNavConfig()` with zero errors |
| C | Governance packs — adopted modules claim nav config + governance pack exist |
| D | Status consistency — compliant modules satisfy all mandatory requirements |
| E | Exception coverage — partial/legacy modules have active exceptions |
| F | Cross-module consistency — no ID or route collisions between modules |
| G | HR reference preserved — status, compliance, structure, validation |
| H | File-existence verification — nav config files and governance pack files exist on disk |
| I | Exception cross-reference — all exception IDs reference valid entries |
| J | Summary consistency — registry helper counts match actual entries |

---

## 10. Enforcement Scope

This policy applies to:
- All modules listed in the adoption registry
- All new modules adopting the nav standard going forward
- Material changes to existing adopted module nav configs

This policy does NOT apply to:
- Modules explicitly marked `not-applicable`
- Trivial changes (label typos, icon changes)
- Backend-only changes that don't alter the nav surface
