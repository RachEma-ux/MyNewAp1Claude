# HR Carbon SideNav — Reference Implementation

## Document Status

- **Type:** Phase 10 platform standardization artifact
- **Module:** Human Resources
- **Date:** 2026-03-24
- **Status:** Designated reference implementation

---

## 1. Why HR Is the Reference Implementation

The HR module was the first module to adopt the Carbon SideNav pattern. Over Phases 1-9, the HR nav has been:

- Designed with governance-first metadata (scope, visibility, masking, audit)
- Validated with ~200 automated test assertions
- Stabilized through 8 phases of incremental hardening
- Accepted for rollout with honest deferred-item handling
- Documented with a full governance pack

As of Phase 10, the HR Carbon SideNav is designated as the **reference implementation** for the platform's module navigation standard.

---

## 2. What Is Reusable Across Modules

The following concepts from HR are considered stable, proven, and reusable:

### Core Types (now in `client/src/navigation/moduleNavTypes.ts`)

| Type | Purpose | Reusable? |
|---|---|---|
| `ScopeType` | self/team/all/sensitive/mixed scope classification | Yes |
| `VisibilityMode` | show/hide-if-no-access/show-disabled/redirect-to-parent | Yes |
| `BackedBy` | existing-page/new-page/tab-in-existing-page/not-yet-implemented | Yes |
| `ImplementationStatus` | live/placeholder/planned/not-started | Yes |
| `ModuleNavItem` | Base nav item interface | Yes |
| `ModuleNavSection` | Section grouping interface | Yes |
| `ModuleNavConfig` | Top-level module config | Yes |
| `ScopeActions` | Scope resolution actions shape | Yes |
| `ACTION_PATTERN` | Action string format regex | Yes |

### Patterns

| Pattern | Description | Reusable? |
|---|---|---|
| Single source of truth config file | One canonical config file per module | Yes |
| Section-based grouping | Items organized by purpose-driven sections | Yes |
| `requiredAction` per item | Permission gating at item level | Yes |
| `visibilityMode` per item | Visibility behavior per item | Yes |
| `scopeType` per item | Scope classification | Yes |
| `backedBy` per item | What surface backs the item | Yes |
| `implementationStatus` per item | Lifecycle tracking | Yes |
| "Coming soon" for deferred items | Honest representation of unimplemented capabilities | Yes |
| Section landing pages | Reusable page component showing grouped items per section | Yes |
| Route alias map | Backward compatibility for old flat routes | Yes |
| Structural validator | Pure validation function for config integrity | Yes |
| Client-side auth helpers | Pure visibility/scope resolution | Yes |

### Helpers (now in `client/src/navigation/moduleNavHelpers.ts`)

| Helper | Purpose | Reusable? |
|---|---|---|
| `getAllItems(config)` | Flatten items from all sections | Yes |
| `filterByStatus(config, status)` | Filter by implementation status | Yes |
| `filterByBackedBy(config, backed)` | Filter by backed-by | Yes |
| `findSection(config, sectionId)` | Lookup section by ID | Yes |
| `findItemByHref(config, href)` | Lookup item by href | Yes |
| `getSectionForItem(config, itemId)` | Get section containing item | Yes |
| `countByStatus(config)` | Count items by status | Yes |
| `countByBackedBy(config)` | Count items by backed-by | Yes |
| `validateModuleNavConfig(config)` | Structural validation | Yes |

---

## 3. What Remains HR-Specific

The following are intentionally **not** promoted to the shared contract:

| Concept | Why HR-Specific |
|---|---|
| `MaskingFieldSet` (`directory`, `compensation`, `relations`, `talent`) | These masking categories are HR domain concepts. Other modules will define their own masking field sets. |
| `HR_NAV_CONFIG` data | The actual nav items, sections, and their content are HR business logic. |
| `HR_ROUTE_ALIASES` data | The specific old-to-new route mappings are HR migration history. |
| `hrNavAuth.ts` functions | While the pattern is reusable, the functions directly import HR config. Future modules will create their own auth helpers following the same pattern. |
| `hrNavConfigValidator.ts` functions | The HR-specific validator adds HR route alias checking. The generic validator is in shared helpers. |
| HR role definitions (`HR_ROLES`, `HR_ROLE_PERMISSIONS`) | Module-specific role matrices. |
| HR action constants (`HR_ACTIONS`) | Module-specific permission actions. |
| HR masking functions (`maskDirectoryFields`, etc.) | Module-specific data masking logic. |

---

## 4. What Future Modules Should Imitate

When a new module adopts the Carbon SideNav pattern, it should:

1. **Create a canonical nav config file** (e.g., `client/src/config/financeNavConfig.ts`) that exports a `ModuleNavConfig`-conformant object.

2. **Ensure every item declares** at minimum: `id`, `label`, `href`, `section`, `requiredAction`, `scopeType`, `visibilityMode`, `backedBy`, `backendDomain`, `implementationStatus`.

3. **Use "not-yet-implemented" honestly** for items that don't have real surfaces yet.

4. **Create a structural validator** (or reuse the shared `validateModuleNavConfig`) to validate the config at test time.

5. **Create module-specific auth helpers** following the pattern in `client/src/lib/hrNavAuth.ts`.

6. **Reuse the section landing page pattern** for section-level navigation.

7. **Define a route alias map** if migrating from flat routes.

8. **Document the module nav** in `Governance-Centrale/modules/<module>/` following the HR governance pack template.

---

## 5. What Future Modules Should NOT Assume

- That the shared contract covers every governance field a module might need. Modules may extend `ModuleNavItem` with module-specific fields.
- That HR's masking field sets apply to them. Each module defines its own sensitive data categories.
- That HR's section structure is a universal template. The number and purpose of sections varies by module.
- That HR's route alias strategy is required. It exists because HR migrated from flat routes; new modules may start with hierarchical routes.
- That the Carbon SideNav must be the only nav pattern. The contract standardizes this pattern but does not mandate it for every module.

---

## 6. Source-of-Truth Files

| File | Role |
|---|---|
| `client/src/navigation/moduleNavTypes.ts` | Shared type contract |
| `client/src/navigation/moduleNavHelpers.ts` | Shared helper functions |
| `client/src/config/hrNavConfig.ts` | HR canonical nav config (reference implementation) |
| `client/src/config/hrNavConfigValidator.ts` | HR-specific validator (extends shared validation) |
| `client/src/config/hrRouteAliases.ts` | HR backward-compatible route aliases |
| `client/src/lib/hrNavAuth.ts` | HR client-side auth helpers |
| `Governance-Centrale/global/MODULE_NAV_STANDARD.md` | Platform module nav standard |
| `Governance-Centrale/global/MODULE_NAV_GOVERNANCE_RULES.md` | Governance rules for module nav changes |
| `Governance-Centrale/global/MODULE_NAV_ADOPTION_CHECKLIST.md` | Adoption checklist for new modules |
| `Governance-Centrale/templates/module-nav/` | Copy-ready templates |
