# Module Navigation Standard

## Document Status

- **Type:** Platform-wide standard
- **Date:** 2026-03-24
- **Version:** 1.1.0 (Phase 11 — validated across HR + PM Central)
- **Reference implementation:** HR Carbon SideNav (`client/src/config/hrNavConfig.ts`)
- **First pilot adoption:** PM Central (`client/src/config/pmNavConfig.ts`)

---

## 1. Purpose

This document defines how module-level navigation should be structured, governed, and maintained across the platform. It establishes a standard pattern based on the proven HR Carbon SideNav implementation.

---

## 2. Module Nav Config Structure

Every module that uses the Carbon SideNav pattern must define a **single canonical navigation configuration file** that serves as the source of truth for:

- What capabilities the module exposes through navigation
- How those capabilities are grouped into purpose-driven sections
- What permissions are required for each capability
- What scope, visibility, masking, and audit rules apply
- What is implemented vs. planned vs. deferred

### 2.1 Top-Level Config

```typescript
interface ModuleNavConfig {
  id: string;           // e.g., "human-resources", "finance"
  label: string;        // e.g., "Human Resources"
  baseRoute: string;    // e.g., "/hr", "/finance"
  sections: ModuleNavSection[];
}
```

### 2.2 Section Shape

```typescript
interface ModuleNavSection {
  id: string;
  label: string;
  iconHint: string;
  purpose: string;         // Human-readable explanation of the section
  href: string;            // Section landing route
  requiredAction: string;  // Permission action for section access
  scopeType: ScopeType;
  visibilityMode: VisibilityMode;
  backedBy: BackedBy;
  backendDomain: string;
  implementationStatus: ImplementationStatus;
  items: ModuleNavItem[];
}
```

### 2.3 Item Shape

```typescript
interface ModuleNavItem {
  id: string;
  label: string;
  href: string;
  section: string;
  requiredAction: string;
  scopeType: ScopeType;
  visibilityMode: VisibilityMode;
  backedBy: BackedBy;
  backendDomain: string;
  implementationStatus: ImplementationStatus;
  // Optional fields
  iconHint?: string;
  purpose?: string;
  currentRoute?: string;
  currentComponent?: string;
  maskingRequired?: boolean;
  sensitiveReadAudit?: boolean;
  sensitiveAction?: string;
  scopeActions?: { global?: string; team?: string; self?: string };
}
```

### 2.4 Shared Types

Import shared types from `client/src/config/moduleNavTypes.ts`:

| Type | Values |
|---|---|
| `ScopeType` | `self`, `team`, `all`, `sensitive`, `mixed` |
| `VisibilityMode` | `show`, `hide-if-no-access`, `show-disabled`, `redirect-to-parent` |
| `BackedBy` | `existing-page`, `new-page`, `tab-in-existing-page`, `not-yet-implemented` |
| `ImplementationStatus` | `live`, `placeholder`, `planned`, `not-started` |

---

## 3. Metadata Model

### 3.1 Permission Actions

Every section and item must declare a `requiredAction` string following the pattern:

```
<module>.<domain>.<operation>[.<qualifier>]
```

Examples: `hr.directory.read`, `hr.time.read.self`, `finance.ledger.write`

### 3.2 Scope Classification

Every item must declare its `scopeType`:

| Scope | Meaning |
|---|---|
| `self` | User sees only their own data |
| `team` | User sees their team's data |
| `all` | User sees all data in the domain |
| `sensitive` | Data is classified as sensitive regardless of scope |
| `mixed` | Scope varies by role (requires `scopeActions`) |

### 3.3 Visibility Rules

Every item must declare a `visibilityMode`:

| Mode | Behavior |
|---|---|
| `show` | Always visible in the nav (self-service items) |
| `hide-if-no-access` | Hidden when user lacks `requiredAction` |
| `show-disabled` | Visible but disabled when user lacks access |
| `redirect-to-parent` | Hidden; route-level redirect to parent section |

### 3.4 Implementation Status

Every item must declare its `implementationStatus`:

| Status | Meaning | Nav Behavior |
|---|---|---|
| `live` | Fully implemented with a real surface | Clickable, routed |
| `placeholder` | Partially implemented (e.g., tab in existing page) | Clickable, routed |
| `planned` | In the roadmap but not started | Not shown or shown as "Planned" |
| `not-started` | Defined in the nav model but not implemented | Shown as "Coming soon" |

### 3.5 BackedBy

Every item must declare what surface backs it:

| Value | Meaning |
|---|---|
| `existing-page` | A dedicated page component exists |
| `new-page` | A new page was created for this item |
| `tab-in-existing-page` | Item maps to a tab in another page |
| `not-yet-implemented` | No surface exists yet |

**Coherence rule:** `implementationStatus: "live"` must NOT have `backedBy: "not-yet-implemented"`.

---

## 4. Backward Compatibility

When a module migrates from flat routes to hierarchical section routes:

1. Keep all old flat routes mounted and functional
2. Create a route alias map documenting old-to-new mappings
3. Keep aliases in "documented" status until redirect activation is planned
4. Never break existing bookmarks or deep links

---

## 5. Section Landing Pages

Each section should have a landing page that:

- Displays all child items grouped by their status
- Shows "Coming soon" for deferred items (not empty placeholders)
- Respects `visibilityMode` — only shows items the user can access
- Is reusable via parameterization (section ID)

---

## 6. Validation

Every module nav config should be validated at test time for:

- Required fields on every section and item
- Unique IDs (no duplicates)
- Valid enum values for all typed fields
- Action string format compliance
- Route coherence (live items must have reachable routes)
- BackedBy/implementationStatus coherence
- Masking metadata coherence

Use `validateModuleNavConfig()` from `client/src/config/moduleNavTypes.ts` or extend it with module-specific checks.

---

## 7. Source Files

| File | Purpose |
|---|---|
| `client/src/config/moduleNavTypes.ts` | Shared type definitions, helpers, and generic validator |
| `client/src/config/hrNavConfig.ts` | HR reference implementation (13 sections, 68 items) |
| `client/src/config/pmNavConfig.ts` | PM Central pilot implementation (8 sections, 12 items) |
| `client/src/config/hrNavConfigValidator.ts` | HR-specific validator (extends shared validator) |
| `client/src/config/pmNavConfigValidator.ts` | PM Central validator (extends shared validator) |
| `Governance-Centrale/global/MODULE_NAV_GOVERNANCE_RULES.md` | Governance rules |
| `Governance-Centrale/global/MODULE_NAV_ADOPTION_CHECKLIST.md` | Adoption checklist |

---

## 8. Phase 11 — Cross-Module Validation Results

After applying the standard to PM Central as the first pilot:

### What Generalized Cleanly from HR

| Aspect | Generalizable? | Notes |
|---|---|---|
| Section/item shape | Yes | Core structure works for any module |
| `requiredAction` | Yes | Action namespace is module-prefixed |
| `scopeType` | Yes | Self/team/all/sensitive/mixed applies broadly |
| `visibilityMode` | Yes | All modes are generic |
| `backedBy` | Yes | Implementation backing is universal |
| `implementationStatus` | Yes | Lifecycle stages apply to any module |
| Sidebar integration | Yes | Config-driven rendering reuses cleanly |
| Structural validation | Yes | `validateModuleNavConfig()` works for any module |

### What Remained HR-Specific

| Aspect | Why HR-only |
|---|---|
| `maskingRequired` / `maskingFieldSet` | Only HR has PII requiring field-level masking |
| `sensitiveReadAudit` / `sensitiveAction` | Only HR logs sensitive reads |
| `scopeActions` | Cascading scope resolution is HR's org-hierarchy model |
| Route aliases | HR migrated from flat routes; new modules start clean |

### Adoption Status

| Module | Status | Phase | Sections | Items |
|---|---|---|---|---|
| Human Resources | Reference implementation | 1–10 | 13 | 68 |
| PM Central | Pilot adoption | 11 | 8 | 12 |
