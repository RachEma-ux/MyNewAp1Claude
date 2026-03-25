# Workspace — Risk Register

## Risk Matrix

| ID | Risk | Severity | Likelihood | Current Mitigation | Residual Status |
|---|---|---|---|---|---|
| WR-01 | Audit log failure swallowing | Medium | High (by design) | `.catch(() => {})` on all `logActivity` calls — mutations succeed without audit | **Open** — silent audit gaps are undetectable at runtime |
| WR-02 | WS Catalog listAll lacks admin guard | Medium | Medium | `wsCatalogRouter.listAll` uses `protectedProcedure` only — any authenticated user can enumerate all workspaces | **Open** — no access restriction beyond authentication |
| WR-03 | Governance engine audit not persisted | Medium | High | `GATE_CHECK` events go to console/stdout only, not to `workspace_activity_log` | **Open** — server restart loses governance audit trail |
| WR-04 | Legacy capability fallback silently active | Low | High | `requireCapability` catches RBAC table errors and falls through to legacy role mapping | **Accepted** — intentional backward compatibility; see `workspace-guards.ts:166-170` |
| WR-05 | Wizard team sync skips invalid user IDs | Low | Medium | `createDraft`/`updateDraft` validate workerIds against `users` table, log warnings, skip invalids | **Accepted** — prevents FK violations; logged to console but not audit trail |
| WR-06 | Promotion gate bypass via direct DB modification | Low | Low | `validateDraftCompleteness` runs at each transition, but a direct DB `UPDATE` can change workspace data between gate checks | **Accepted** — standard for application-layer gating; DB-level constraints not in place for content fields |
| WR-07 | Shell config mutation not lifecycle-gated | Medium | Low | `shell.updateConfig` requires `workspace.settings` capability but does not check lifecycle status — can modify shell on archived workspaces | **Open** — missing `requireExecutableWorkspaceRoute` |
| WR-08 | Review packet is informational, not authoritative on its own | Low | Low | `getReviewPacket` assembles data for human review but does not enforce — enforcement is in `validateDraftCompleteness` at transition time | **Accepted** — the packet serves the reviewer; the gate enforces compliance |
| WR-09 | Crew participant ID not FK-constrained to agents table | Low | Medium | `workspaceCrew.agentId` has no foreign key to the agents table — can reference non-existent agents | **Open** — schema-level gap |
| WR-10 | Routing profile defaults applied without explicit user consent | Low | Low | `getRoutingProfile` returns hardcoded defaults `{ defaultRoute: "AUTO", dataSensitivity: "LOW", ... }` when no profile is stored | **Accepted** — sensible defaults; explicit profile set via wizard or update |

## Risk Definitions

### Severity Scale

- **Critical** — System-wide governance breach; data integrity at risk
- **High** — Module-level governance bypass possible; requires immediate attention
- **Medium** — Governance gap exists but exploitation requires specific conditions
- **Low** — Minor inconsistency; defense-in-depth covers the gap

### Likelihood Scale

- **High** — Occurs in normal operation or by design
- **Medium** — Requires specific user actions or edge cases
- **Low** — Requires adversarial intent or unusual conditions
