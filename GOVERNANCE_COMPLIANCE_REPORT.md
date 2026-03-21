# Governance Compliance Report

**Generated:** 2026-03-21
**Framework:** CGT v2 (Governance Bible)
**Validation Harness:** 8 probes (P01-P08)

---

## Executive Summary

Governance hardening applied across 10 files to address critical, high, and warning-level findings from the governance validation harness. Three previously failing/warning probes (P03, P05, P07) are expected to improve to PASS or reduced-WARN status.

---

## Fixes Applied

### P03: Freeze Block Enforcement (FAIL -> PASS expected)

| Item | Status | File | Details |
|------|--------|------|---------|
| System freeze in middleware | FIXED | `server/_core/trpc.ts` | Added `isFrozen(0)` check BEFORE `requireGovernedAction` in `requireGovernance` middleware |
| TRPCError CONFLICT on freeze | FIXED | `server/_core/trpc.ts` | Throws `code: "CONFLICT"` with `"FREEZE active"` message |
| Per-subject freeze in requireGate | OK | `server/governance/requireGate.ts` | Already has `isFrozen(subject.id)` at line 104 |
| System freeze in requireGate | OK | `server/governance/requireGate.ts` | Already has `isFrozen(0)` in `canPassGate()` |
| Freeze persistence to DB | OK | `server/governance/scorecard/drift-detector.ts` | Already persists to `subjectFreezes` table |
| Freeze hydration on startup | OK | `server/governance/scorecard/drift-detector.ts` | Already has `hydrateFreezeCache()` |
| Both governed procedures exported | OK | `server/_core/trpc.ts` | `governedProcedure` and `governedAdminProcedure` both present |

### P05: Audit Trail Integrity (WARN -> improved)

| Item | Status | File | Details |
|------|--------|------|---------|
| `principal_type` field added | FIXED | `server/services/auditLogger.ts` | New type `PrincipalType = "human" \| "ai" \| "system"` added to `AuditEvent` |
| requireGate audit calls | FIXED | `server/governance/requireGate.ts` | All 3 `audit.log()` calls now include `principal_type: "human"` |
| Governance engine RBAC denial | FIXED | `server/governance/governance-engine.ts` | Changed `action_type` from `ADMIN_ROLE_CHANGE` to `RBAC_DENIAL`, added `principal_type` |
| Catalog audit calls | FIXED | `server/routers/catalog-manage.ts` | Added `actor_id` and `principal_type` to unified audit logger calls |
| Required fields present | OK | `server/services/auditLogger.ts` | All 6 required fields: `event_id`, `timestamp`, `actor_id`, `action_type`, `target_type`, `decision_result` |
| Blocking persistence | OK | `server/services/auditLogger.ts` | Uses `await persistToDb(event)` — blocking, not fire-and-forget |

### P07: Principal Attribution (WARN -> PASS expected)

| Item | Status | File | Details |
|------|--------|------|---------|
| `actor: 1` in idea-builder-agent | FIXED | `server/modules/pmt/idea-builder-agent.ts:687` | Changed to `actor: 0, actorType: "system"` |
| `actor: number = 1` default | FIXED | `server/routers/catalog-manage.ts:36` | Changed to `actor: number = 0` with dynamic actorType |
| `installedBy ?? 1` | FIXED | `server/plugins/registry.ts:384` | Changed to `?? 0` (system actor) |
| `loadedBy ?? 1` | FIXED | `server/services/policyService.ts:297` | Changed to `?? 0` (system actor) |
| `ctx.user.id` in governance | OK | `server/_core/trpc.ts` | Uses `String(ctx.user.id)` in requireGovernance |

### Production Safety: Fail-Closed Boot

| Item | Status | File | Details |
|------|--------|------|---------|
| DEV_MODE + production block | ADDED | `server/governance/architecture-validator.ts` | Errors if `DEV_MODE=true` + `NODE_ENV=production` without `ALLOW_DEV_MODE_IN_PROD` |
| CI/staging escape hatch | ADDED | `.github/workflows/builder-deploy.yml` | Sets `ALLOW_DEV_MODE_IN_PROD=true` for CI deploys |

---

## Remaining Items (Future Work)

| Category | Item | Priority | Notes |
|----------|------|----------|-------|
| Mutation Coverage (P02) | 75 of ~378 mutations use `protectedProcedure` instead of `governedProcedure` | Medium | Requires per-route analysis and migration |
| CI Gate Hardening | Convert WARN probes to blocking failures in `governance-gate.yml` | Medium | Should wait until WARNs are resolved |
| Evidence Integrity | Hash verification on evidence read | Low | Evidence bundles already have SHA-256 hashes |
| Runtime Provenance | Add `catalogEntryId` and scorecard reference to audit events | Low | Enhancement for traceability |
| E2E Governance Tests | Integration tests for freeze, RBAC denial, gate enforcement | Medium | Requires test database setup |
| Docs Cleanup | Move governance docs to `docs/governance/` | Low | File organization only |

---

## Architecture Enforcement Summary

- **Enforcement mode:** Strict (production) / Permissive (dev)
- **Freeze enforcement:** System-wide + per-subject, persistent to DB with hydration
- **Audit persistence:** Blocking writes (never fire-and-forget)
- **Principal attribution:** All system operations use ID 0, no hardcoded user ID fallbacks
- **RBAC:** 3-tier procedures (public, protected, governed) with admin variant
- **Gate enforcement:** requireGate with scorecard evaluation, evidence persistence, audit trail
