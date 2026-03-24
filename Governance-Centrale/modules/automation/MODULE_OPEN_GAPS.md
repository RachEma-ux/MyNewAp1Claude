# Automation — Module Open Gaps

## Current Gaps

| Gap | Priority | Impact | Resolution Path |
|---|---|---|---|
| Runtime permission enforcement | Medium | Users see all nav items regardless of role | Implement when platform auth model matures |
| WCP workflows not in nav model | Low | WCP workflows exist under `/wcp/` namespace, not in Automation nav | Evaluate merging in a future phase |
| Automation templates not in nav model | Low | `/automation/templates` route exists but maps to generic templates page | Include when automation-specific templates are built |
| No section landing pages | Low | Sections link to first child item, not a landing page | Add if section-based navigation is rendered in sidebar |
| No frozen baseline | Low | Small config (7 items), drift unlikely | Add if config grows beyond 15 items |

## Resolved Gaps

| Gap | Resolution | Phase |
|---|---|---|
| No canonical nav config | Created `automationNavConfig.ts` | Phase 12 |
| No governance pack | Created full governance pack | Phase 12 |
| No cross-module validation | Added Phase 12 test suite | Phase 12 |
| No adoption registry entry | Added to `moduleNavRegistry.ts` | Phase 12 |
