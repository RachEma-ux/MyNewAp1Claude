# HR Module — Risk Register

## Governance Risks

| ID | Risk | Severity | Mitigation | Status |
|---|---|---|---|---|
| G1 | Audit trail fragmentation between HR-specific and platform audit | Medium | `unifiedAuditQuery` flag enabled; full unification pending | Open |
| G2 | Nav config becomes stale as backend evolves | Medium | Drift detection helpers (`findUnknownBackendDomains`, `getImplementationBreakdown`) | Mitigated |
| G3 | Feature flags in settings diverge from actual implementation | Low | Periodic check defined in MODULE_PERIODIC_CHECKS.md | Mitigated |
| G4 | 35 deferred nav items create a false impression of completeness in config | Low | `implementationStatus` field distinguishes live from not-started | Mitigated |

## Security/Privacy Risks

| ID | Risk | Severity | Mitigation | Status |
|---|---|---|---|---|
| S1 | Compensation data exposure to unauthorized roles | High | `maskCompensationFields` + `COMPENSATION_READ_SENSITIVE` gate | Mitigated |
| S2 | Employee relations data (grievances, investigations) leakage | High | `maskRelationsFields` + `RELATIONS_READ_SENSITIVE` gate | Mitigated |
| S3 | Talent data (9-box, retention risk) visible to wrong roles | High | `maskTalentFields` + role-based filtering | Mitigated |
| S4 | Work permit/legal document exposure | Medium | `maskWorkPermitFields` + compliance role gate | Mitigated |
| S5 | Role definition sensitive notes visible to non-HR users | Medium | `maskRoleDefRestrictedFields` + `maskRoleDefManagerFields` | Mitigated |
| S6 | Self-approval of own time/leave/performance | Medium | `preventSelfApproval` on all approval endpoints | Mitigated |
| S7 | Role cache TTL (60s) allows brief privilege escalation after role change | Low | Cache expires within 60 seconds; acceptable for non-real-time HR data | Accepted |

## Route/Nav Overexposure Risks

| ID | Risk | Severity | Mitigation | Status |
|---|---|---|---|---|
| N1 | Nav items visible to users who lack backend access | Medium | `getVisibleSections()` filters by `requiredAction`; backend double-checks | Mitigated |
| N2 | `show` visibility items accessible even without explicit action check | Low | Only 4 sections use `show` mode; backend still enforces permissions | Mitigated |
| N3 | Placeholder items (role-based-access) may appear clickable but lead to empty UI | Low | 1 placeholder item; styled with `opacity-70` in SideNav | Accepted |

## Scope Leakage Risks

| ID | Risk | Severity | Mitigation | Status |
|---|---|---|---|---|
| SC1 | Employee sees other employees' data via directory | Medium | `resolveDataScope` enforces self/team/all scoping | Mitigated |
| SC2 | Manager sees workers outside their team | Medium | `getTeamWorkerIds` limits to direct reports | Mitigated |
| SC3 | Self-scope bypass if worker ID mapping is missing | Low | `getWorkerIdForUser` returns null → scope resolves to "none" | Mitigated |

## Discoverability vs Authorization Risks

| ID | Risk | Severity | Mitigation | Status |
|---|---|---|---|---|
| D1 | Carbon SideNav shows section labels even if all items are hidden | Low | Sections with zero visible items are filtered out in `HRSideNav.tsx` | Mitigated |
| D2 | Nav observability tracking reveals access patterns | Low | Tracking is client-side only; not persisted to server DB | Accepted |
| D3 | Users can infer existence of sensitive areas from section labels in MainLayout | Low | MainLayout shows only section labels from nav config; no sensitive detail | Accepted |

## Deferred-Item Truthfulness Risks

| ID | Risk | Severity | Mitigation | Status |
|---|---|---|---|---|
| DF1 | Deferred items have `requiredAction` but no backend enforcement (no endpoint exists) | Low | Deferred items are excluded from sidebar; no route to access them | Mitigated |
| DF2 | Deferred items may never be implemented, creating permanent config bloat | Low | Periodic deferred leaf review defined in MODULE_PERIODIC_CHECKS.md | Mitigated |

## Cross-Workspace / Assignment Visibility Risks

| ID | Risk | Severity | Mitigation | Status |
|---|---|---|---|---|
| W1 | HR data leaks across workspaces if workspace scoping is incomplete | Medium | Workspace-scoped queries; `workspaceHrHardening` feature flag enabled | Mitigated |
| W2 | Role assignments not workspace-scoped | Low | `hr_role_assignments` table includes workspace context where applicable | Mitigated |

## Global Doctrine Reference

- Platform threat model: [Governance-Center/global/THREAT_MODEL.md](../../global/THREAT_MODEL.md)
- Platform security model: [Governance-Center/global/SECURITY_MODEL.md](../../global/SECURITY_MODEL.md)
- Platform control matrix: [Governance-Center/global/CONTROL_MATRIX.md](../../global/CONTROL_MATRIX.md)
