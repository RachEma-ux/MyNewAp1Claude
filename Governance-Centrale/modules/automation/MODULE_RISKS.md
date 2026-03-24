# Automation — Module Risks

## Risk Register

| Risk | Severity | Likelihood | Mitigation | Status |
|---|---|---|---|---|
| Nav config diverges from actual routes | Medium | Low | Automated validation in test suite | Mitigated |
| Permission actions declared but not enforced | Low | High | Planned: enforce when auth model matures | Accepted |
| WCP workflows not included in nav model | Low | Medium | Separate namespace (`/wcp/`), may merge in future phase | Accepted |
| Sidebar rendering changes break nav | Low | Low | Config-driven rendering pattern isolates changes | Mitigated |

## Architecture Risks

- **No backend restructuring**: Phase 12 intentionally did not mirror the nav sections into backend routers. The `server/automation/` directory remains broad and capability-oriented.
- **No new route sprawl**: All 7 nav items map to existing routes. No new pages were created.

## Dependency Risks

- Depends on shared `ModuleNavConfig` contract stability (maintained in `navigation/moduleNavTypes.ts`)
- Depends on `MainLayout.tsx` config-driven rendering pattern
