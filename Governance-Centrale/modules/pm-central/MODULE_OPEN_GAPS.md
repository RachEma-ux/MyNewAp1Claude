# PM Central Module — Open Gaps

## Document Status

- **Type:** Gap register
- **Module:** PM Central
- **Last updated:** 2026-03-24

---

## Open Gaps

### G1. Permission Enforcement Not Active

| Aspect | Value |
|---|---|
| Priority | Medium |
| Description | `requiredAction` is declared in nav config but not enforced in tRPC procedures |
| Affected items | All 12 nav items |
| Resolution path | Implement PM role middleware in backend, similar to HR's `checkHrAccess()` |

### G2. No Section Landing Pages

| Aspect | Value |
|---|---|
| Priority | Low |
| Description | PM Central does not yet have dedicated section landing pages (HR has `HRSectionLandingPage`) |
| Affected items | 8 sections |
| Resolution path | Existing pages serve as de facto section landings; dedicated landing pages are optional |

### G3. No Route Aliases

| Aspect | Value |
|---|---|
| Priority | None (positive gap) |
| Description | PM Central adopted the nav standard from scratch — no legacy routes to alias |
| Resolution path | Not needed |

### G4. No Dedicated Backend Domain

| Aspect | Value |
|---|---|
| Priority | Low |
| Description | PM Central has no `server/pm/` domain; uses generic tRPC routers |
| Affected items | All items referencing backend domains |
| Resolution path | Backend domain consolidation is a future concern; not needed for nav standard adoption |

### G5. Project-Level Nav Not in Standard

| Aspect | Value |
|---|---|
| Priority | Low |
| Description | The module-nav standard covers top-level module navigation only. PM Central's project-level sidebar (`PMProjectSidebar`) with 31 tool panels is not covered. |
| Resolution path | Project-level navigation is context-specific and may not benefit from the same standard |
