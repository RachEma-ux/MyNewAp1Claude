# HR Carbon SideNav — Reference Implementation

## Overview

The Human Resources module is the **first and current reference implementation** for the Carbon Design System-inspired shared module-nav pattern in this platform. No other module has a comparable 3-level config-driven SideNav with role filtering, scope metadata, masking declarations, and observability tracking.

## Architecture

The HR Carbon SideNav follows a 3-level hierarchy:

```
L0: "Human Resources" toggle (MainLayout.tsx — global sidebar)
  L1: Section headers — collapsible accordion groups (HRSideNav.tsx)
    L2: Leaf items — navigable links to pages (HRSideNav.tsx)
```

### Data Flow

```
hrNavConfig.ts (canonical config)
  → getVisibleSections() (role-filtered by hrNavAuth.ts)
    → HRSideNav.tsx (renders accordion with observability)
      → MainLayout.tsx (mounts HRSideNav under "Human Resources" toggle)
```

### Key Design Decisions

1. **Single source of truth**: `hrNavConfig.ts` defines all 13 sections and 69 leaf items with full metadata (scope, masking, permissions, status, backend domain).
2. **Config-driven rendering**: The SideNav component reads the config — it does not hardcode any nav items.
3. **Role-based filtering**: `getVisibleSections()` checks each item's `requiredAction` against the user's `allowedActions` from `useHrRole()`.
4. **Status-based filtering**: Only `live` and `placeholder` items are shown. `not-started` and `planned` items are excluded from the rendered sidebar.
5. **Accordion behavior**: One section open at a time. Active section auto-expands on navigation.
6. **Pinned directory**: The employee directory is pinned above the accordion as a universal quick-access link.
7. **Observability**: `trackSectionVisit()` and `trackItemClick()` fire on user interaction.
8. **Icon resolution**: `resolveHrIcon()` maps the `iconHint` string from nav config to a Lucide icon component.
9. **Route resolution**: Items use `currentRoute` (if defined) over `href` for navigation, enabling backward compatibility with flat routes.

## What Makes This a Reference Implementation

| Property | HR SideNav | Other Modules |
|---|---|---|
| Config-driven nav model | Yes — `hrNavConfig.ts` | No — hardcoded arrays in MainLayout |
| Typed nav config | Yes — `HrNavModule`, `HrNavSection`, `HrNavItem` TypeScript interfaces | No |
| Role-based filtering | Yes — per-item `requiredAction` | No |
| Scope metadata | Yes — `scopeType`, `scopeActions` per item | No |
| Masking metadata | Yes — `maskingRequired`, `maskingFieldSet`, `sensitiveAction` per item | No |
| Implementation status tracking | Yes — `implementationStatus` per item | No |
| Backend domain mapping | Yes — `backendDomain` per item with validation helpers | No |
| Observability hooks | Yes — `trackSectionVisit`, `trackItemClick` | No |
| Drift detection | Yes — `findUnknownBackendDomains()`, `getImplementationBreakdown()` | No |
| 3-level accordion | Yes — L0/L1/L2 | No — other modules use flat 2-level menus |

## Reuse Potential

Other modules (PM Central, Automation) already have partial nav configs (`pmNavConfig.ts`, `automationNavConfig.ts`) but consume them as flat section lists in MainLayout without a dedicated SideNav component. The HR pattern could be extracted into a shared `ModuleSideNav` component if other modules need the same 3-level accordion with role filtering.

## Implementation Files

| File | Role |
|---|---|
| `client/src/config/hrNavConfig.ts` | Canonical config (1656 lines) |
| `client/src/components/HRSideNav.tsx` | 3-level accordion component |
| `client/src/components/DirectoryDropdown.tsx` | Directory quick-access |
| `client/src/lib/hrNavAuth.ts` | Role-based section/item filtering |
| `client/src/lib/hrIconMap.ts` | Icon resolution |
| `client/src/lib/hrNavObservability.ts` | Observability tracking |
| `client/src/hooks/useHrRole.ts` | HR role hook |
| `client/src/components/MainLayout.tsx` | L0 mount point (lines ~399–404) |
