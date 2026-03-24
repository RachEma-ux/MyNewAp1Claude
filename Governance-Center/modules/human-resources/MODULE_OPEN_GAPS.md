# HR Module — Open Gaps

## Purpose

This file is an honest accounting of what remains incomplete, deferred, partially implemented, or needing further hardening in the HR module. It is intended to prevent overclaiming and to give reviewers a clear picture of actual readiness.

---

## Incomplete / Partially Implemented

| Gap | Description | Severity | Notes |
|---|---|---|---|
| 35 deferred nav items | 35 of 69 nav config items have `implementationStatus: "not-started"` — no backing page or API endpoint | Medium | These are planned capabilities documented in the nav config but not yet built. They span: workforce planning, talent acquisition pipeline, lifecycle documents/equipment, compensation review/bonus, relations investigations, engagement resources, analytics, compliance policies, security policies. |
| Section landing pages | Section-level entries in the nav config have `backedBy: "not-yet-implemented"` — no dedicated section landing page exists for most sections | Low | The `HRSectionLandingPage` component exists but may not cover all 13 sections. Users navigate directly to leaf items via the SideNav. |
| Unified audit query | `unifiedAuditQuery` feature flag is enabled, but HR audit logs and platform governance audit logs remain in separate tables with no single query surface | Medium | This fragmentation means a complete audit picture requires querying both systems. |
| Nav observability persistence | `trackSectionVisit` and `trackItemClick` fire client-side but events are not persisted to a server-side store | Low | Observability data is lost on page refresh. For production audit evidence, server-side persistence is needed. |

## Deferred by Design

| Item | Reason | Impact |
|---|---|---|
| 360 Feedback | Design phase — requires multi-source feedback workflow engine | No backend or UI |
| Succession Planning | Depends on talent review maturity | Nav config entry only |
| Disciplinary Actions | Sensitive area — requires legal review workflow | Nav config entry only |
| Workplace Investigations | Requires confidential case management | Nav config entry only |
| Candidate Pipeline / Interview / Offer Management | Full ATS not in scope for current phase | Nav config entries only |
| Custom Analytics | Requires query builder UI | Nav config entry only |
| Data Privacy settings | Requires consent management framework | Nav config entry only |
| Security Policies | Requires policy authoring engine | Nav config entry only |

## Needs Hardening

| Area | Current State | What's Needed |
|---|---|---|
| Role-based access page | `implementationStatus: "placeholder"` — UI shell only | Full CRUD for HR role assignments |
| Nav config `backendDomain` for `roleDefinitions` | Uses string `"roleDefinitions"` which is not in `HR_BACKEND_DOMAINS` constant | Minor: add to constant or accept as known mismatch |
| Workspace isolation testing | `workspaceHrHardening` flag enabled, but cross-workspace leak tests not comprehensive | Integration tests for multi-workspace scenarios |
| Role cache invalidation | 60-second TTL cache — no active invalidation on role change | For time-sensitive role changes, consider cache-bust on assignment mutation |

## Needs Documentation / Packaging

| Area | Status |
|---|---|
| Per-sub-router governance notes | Individual sub-routers (15) don't have inline governance documentation — enforcement is in code but not documented per-router |
| Test coverage inventory | No governance-specific test inventory exists. Tests exist in `server/hr/__tests__/` but mapping of tests to governance controls is not documented |
| Masking field set validation | No automated test verifies that `MASKED_*_FIELDS` arrays match actual DTO field names |

## What Remains Before Full Maturity

1. **Build the 35 deferred items** — or formally defer/remove them from the nav config if they are not planned within the next phase
2. **Unify HR + platform audit logs** — provide a single query surface for governance reviewers
3. **Persist nav observability events** — move from client-side fire-and-forget to server-side storage
4. **Add `roleDefinitions` to `HR_BACKEND_DOMAINS`** — minor config consistency fix
5. **Comprehensive workspace isolation tests** — verify no cross-workspace data leakage
6. **Per-sub-router governance documentation** — annotate each of the 15 sub-routers with their specific governance controls
7. **Masking field validation tests** — automated tests that verify masking arrays match DTO schemas

## Assessment

The HR module is **governance-ready for review and handoff** for its implemented surface (33 live items + 1 placeholder). The 35 deferred items are clearly marked as not-started and are excluded from the user-facing sidebar. The main open gaps are: audit fragmentation, deferred item backlog, and nav observability persistence.
