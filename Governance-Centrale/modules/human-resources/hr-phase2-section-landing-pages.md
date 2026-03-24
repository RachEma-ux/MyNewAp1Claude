# HR Phase 2 — Section Landing Pages — Governance Document

## Document Status

- **Type:** Governance-first Phase 2 implementation record
- **Module:** Human Resources
- **Phase:** Phase 2 — Section Landing Pages
- **Canonical source:** `client/src/config/hrNavConfig.ts`
- **Route aliases:** `client/src/config/hrRouteAliases.ts`
- **Section landing component:** `client/src/pages/hr/HRSectionLandingPage.tsx`
- **Last updated:** 2026-03-24

---

## 1. What Phase 2 Implements

Phase 2 adds **13 section landing pages** as grouped entry points for the HR module. Each section landing page:

- Is driven by the canonical nav config (`hrNavConfig.ts`)
- Renders child capability cards filtered by the user's HR role
- Links to existing pages where they are already live
- Shows "Coming soon" badges for not-yet-implemented items
- Provides breadcrumb navigation (HR > Section)
- Handles empty/no-access states cleanly

### Section Routes Implemented

| # | Route | Section ID | Section Label |
|---|---|---|---|
| 1 | `/hr/workforce-planning` | workforce-planning | Workforce Planning & Organization |
| 2 | `/hr/talent-acquisition` | talent-acquisition | Talent Acquisition |
| 3 | `/hr/lifecycle` | onboarding-offboarding | Onboarding & Offboarding |
| 4 | `/hr/employee-records` | employee-records | Employee Records & Administration |
| 5 | `/hr/compensation-benefits` | compensation-benefits | Compensation & Benefits |
| 6 | `/hr/time-attendance` | time-attendance | Time & Attendance |
| 7 | `/hr/learning-development` | learning-development | Learning & Development |
| 8 | `/hr/performance-talent` | performance-talent | Performance & Talent Management |
| 9 | `/hr/employee-relations` | employee-relations | Employee Relations |
| 10 | `/hr/wellbeing-engagement` | wellbeing-engagement | Well Being & Engagement |
| 11 | `/hr/analytics-reporting` | analytics-reporting | HR Analytics & Reporting |
| 12 | `/hr/security-access` | security-access | Security & Access |
| 13 | `/hr/compliance` | compliance | Compliance |

---

## 2. How Section Landing Pages Consume the Canonical Nav Config

The `HRSectionLandingPage` component:

1. Takes a `sectionId` prop
2. Calls `findSectionById(sectionId)` to get the section from `HR_NAV_CONFIG`
3. Uses the user's HR role via `useHrRole()` to filter visible children
4. Applies `visibilityMode` rules: items with `"show"` are always visible; items with `"hide-if-no-access"` are hidden if the user lacks `requiredAction`
5. Renders live items as clickable cards linking to `currentRoute` (existing flat route)
6. Renders not-yet-implemented items as disabled cards with "Coming soon" badge
7. Shows an empty state if no children are visible

**No child items are hardcoded in the component.** All content derives from `hrNavConfig.ts`.

---

## 3. Sidebar Integration

### Before Phase 2

The HR sidebar listed 28 flat nav items (a mix of self-service and role-gated items).

### After Phase 2

The HR sidebar lists the 13 section entry points. Each section link:

- Goes to the section landing page route (e.g., `/hr/workforce-planning`)
- Is visible only if at least one child item within the section is accessible to the user
- Visibility is checked by iterating the section's `items` from `HR_NAV_CONFIG` and testing each item's `visibilityMode` and `requiredAction` against the user's role

### Role-Aware Section Visibility Rules

A section appears in the sidebar if **at least one** of its child items is either:
- `visibilityMode: "show"` (always visible), OR
- `visibilityMode: "hide-if-no-access"` AND the user has the required action

This means:
- **Employee** (basic role): sees Time & Attendance, Learning & Development, Performance & Talent, Employee Relations, Wellbeing & Engagement, Employee Records (because these contain self-service children with `visibilityMode: "show"`)
- **Manager**: sees the above plus sections with items gated by manager-level actions
- **HRBP/Admin**: sees all 13 sections

---

## 4. Backward Compatibility Strategy

### Existing flat routes preserved

All 29 existing `/hr/*` flat routes remain mounted in `App.tsx` and continue to work unchanged:

- `/hr/directory`, `/hr/organization`, `/hr/positions`, `/hr/staffing`, `/hr/skills`
- `/hr/recruitment`, `/hr/onboarding`, `/hr/offboarding`
- `/hr/timesheet`, `/hr/leave`, `/hr/overtime`, `/hr/shifts`
- `/hr/training`, `/hr/certifications`, `/hr/goals`, `/hr/reviews`
- `/hr/compensation`, `/hr/benefits`
- `/hr/policies`, `/hr/grievances`
- `/hr/surveys`, `/hr/engagement`
- `/hr/incidents`, `/hr/compliance-mgmt`
- `/hr/analytics`, `/hr/talent`, `/hr/reports`, `/hr/settings`
- `/hr` (home page)

### New routes added (non-breaking)

13 new section landing routes were added **before** the existing flat routes in the `<Switch>`:

- `/hr/workforce-planning`
- `/hr/talent-acquisition`
- `/hr/lifecycle`
- `/hr/employee-records`
- `/hr/compensation-benefits`
- `/hr/time-attendance`
- `/hr/learning-development`
- `/hr/performance-talent`
- `/hr/employee-relations`
- `/hr/wellbeing-engagement`
- `/hr/analytics-reporting`
- `/hr/security-access`
- `/hr/compliance`

### Route priority

Section routes are listed before flat routes in the `<Switch>` block. Since wouter's `<Switch>` matches first-match-wins and section routes have distinct paths (e.g., `/hr/workforce-planning` vs `/hr/organization`), there is no conflict.

### No redirects activated

Phase 2 does NOT activate redirects from old routes to new routes. The route aliases in `hrRouteAliases.ts` remain in `"documented"` status. Redirect activation is deferred to Phase 3+.

---

## 5. What Was NOT Changed

- **No backend routers modified** — Backend remains organized by broad HR domains
- **No database schema changes** — No new tables or migrations
- **No permission model changes** — All existing HR_ACTIONS and HR_ROLE_PERMISSIONS unchanged
- **No field masking changes** — Existing masking behavior preserved
- **No existing page components modified** — All 29 HR page components unchanged
- **No existing routes removed** — All flat `/hr/*` routes still work
- **No leaf pages created** — Phase 2 is about section landings, not 68 leaf pages

---

## 6. Reuse vs Deferral Summary

### Reused from Phase 1

- Canonical nav config (`hrNavConfig.ts`) — 13 sections, 68 items
- Route aliases (`hrRouteAliases.ts`) — 27 backward compat mappings
- All 29 existing HR page components
- HR role/permission model (`useHrRole`, `permissions.ts`)
- All existing backend routers

### New in Phase 2

- `HRSectionLandingPage.tsx` — reusable section landing component
- 13 section route entries in `App.tsx`
- Sidebar updated from flat list → section-grouped list in `MainLayout.tsx`
- Governance doc for Phase 2

### Deferred to Phase 3+

- Leaf page creation for 41 not-yet-implemented items
- Route redirect activation (old → new canonical paths)
- Deep-linked sub-routes within sections (e.g., `/hr/workforce-planning/organization`)
- New backend capabilities for unimplemented leaves
- Section-level analytics and metrics on landing pages

---

## 7. Governance Compliance Assessment

### Changes to module surface

- 13 new routes added (section landing pages)
- Sidebar updated from flat list to section-grouped list
- One new reusable component created

### No governance violations

| Check | Status |
|---|---|
| No new backend capabilities | Pass |
| No permission model changes | Pass |
| No scope model weakening | Pass |
| No database schema changes | Pass |
| No existing route breakage | Pass |
| Backend routers unchanged | Pass |
| Role-aware visibility preserved | Pass |
| Sensitive sections not exposed blindly | Pass |
| Canonical nav config used as source of truth | Pass |
| No leaf page explosion | Pass |

### Sensitive section handling

Sections containing sensitive items (e.g., Compensation & Benefits, Security & Access, Compliance) are hidden from users who lack access to any child items. The section landing page itself does not expose sensitive data — it only shows card titles and descriptions for items the user can access.
