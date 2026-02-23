# Compliance Acceptance Checklist — Final Sign-Off

**Date:** 2026-02-23
**Project:** MyNewAp1Claude
**Scope:** Digital HQ + Governance Center refactor

---

## A) Contract Routes + IA (Hard Gate)

- [x] All Digital HQ pages exist under `/hq/*` (8 items)
  - Evidence: `client/src/pages/DigitalHQPage.tsx:15-33` — 8 case statements
  - Evidence: `ls client/src/pages/hq/` — 8 panel files exist
- [x] All Governance Center pages exist under `/governance/*` (8 items)
  - Evidence: `client/src/pages/GovernanceCenterPage.tsx:14-22` — 7 case statements + default
  - Evidence: `ls client/src/pages/governance/` — 7 panel files exist
  - Scorecard detail handled inline in ScorecardsExplorerPanel (8th conceptual page)
- [x] No remaining references to `/digital-hq` or `/governance-center` in repo
  - Evidence: `grep -rn` returns only 2 redirect lines in `App.tsx:222-223`
- [x] Sidebar links match routes exactly
  - Evidence: `MainLayout.tsx:154-161` — 8 HQ items with `/hq/*` paths
  - Evidence: `MainLayout.tsx:168-174` — 7 governance items with `/governance/*` paths
- [x] Governance is not nested under `/hq`
  - Evidence: `App.tsx:225` (`/hq/:item`) and `App.tsx:227` (`/governance/:item`) are separate routes
- [x] Legacy routes redirect cleanly
  - Evidence: `App.tsx:222-223` — `<Redirect>` components for both old namespaces

## B) Digital HQ Responsibilities (Hard Gate)

- [x] HQ consumes governance outputs only (read-only)
  - Evidence: `server/hq/router.ts:2` — imports `protectedProcedure` (not governed)
  - Evidence: All 8 endpoints are `.query()` — zero `.mutation()` calls
  - Evidence: `grep -rn "from.*server/" client/src/pages/hq/*.tsx` — zero results
- [x] HQ does NOT evaluate policies
  - Evidence: `server/hq/router.ts` — no imports from `policyGate`, `evaluatePolicy`, or policy modules
- [x] HQ does NOT apply gates
  - Evidence: `server/hq/router.ts` — no imports from `requireGate`, no `governedProcedure` usage
- [x] HQ does NOT override freeze
  - Evidence: `server/hq/router.ts` — calls `isFrozen()` and `getFrozenSubjects()` as READ-ONLY. No `freezeSubject()` or `unfreezeSubject()` calls.
- [x] HQ provides 8 exact pages:
  - [x] Organization & Principal Authority — `OrgAuthorityPanel.tsx` → `hq.orgAuthority`
  - [x] Roles & Membership Control — `RolesMembershipPanel.tsx` → `hq.rolesMembership`
  - [x] Workspace Directory & Provisioning — `WorkspaceDirectoryPanel.tsx` → `hq.workspaceDirectory`
  - [x] Agent Orchestration Layer — `AgentOrchestrationPanel.tsx` → `hq.agentOrchestration`
  - [x] Global Discoverability — `DiscoverabilityPanel.tsx` → `hq.discoverability`
  - [x] Global Notifications & Inbox — `NotificationsPanel.tsx` → `hq.notifications`
  - [x] Risk & Security Baselines — `RiskBaselinesPanel.tsx` → `hq.riskBaselines`
  - [x] Collaboration Intelligence — `CollaborationIntelPanel.tsx` → `hq.collaborationIntel`

## C) Governance Center Responsibilities (Hard Gate)

- [x] Governance Center provides exact 8 pages:
  - [x] Overview (`/governance`) — `GovernanceOverviewPanel.tsx`
  - [x] Scorecards Explorer (`/governance/scorecards`) — `ScorecardsExplorerPanel.tsx`
  - [x] Scorecard Detail (`/governance/scorecards/:runId`) — handled inline via ScorecardsExplorerPanel internal state
  - [x] Controls Catalog (`/governance/controls`) — `ControlsCatalogPanel.tsx`
  - [x] Packs & Runners (`/governance/packs`) — `PacksRunnersPanel.tsx`
  - [x] Freeze & Holds (`/governance/freezes`) — `FreezesPanel.tsx`
  - [x] Drift & Monitoring (`/governance/drift`) — `DriftMonitoringPanel.tsx`
  - [x] Gate Coverage Map (`/governance/coverage`) — `CoverageMapPanel.tsx`
- [x] All pages are wired to backend contracts (no mock data)
  - Evidence: Every panel uses `trpc.governance.*` hooks
  - Evidence: `server/governance/router.ts` — all endpoints return real data from scorecard engine

## D) Enforcement Non-Bypassable (Hard Gate)

- [x] Every **governed** mutation performs:
  - [x] freeze check — `trpc.ts:60` (`isFrozen(0)`)
  - [x] evaluate() — `requireGate()` calls `runScorecard()` at `requireGate.ts:146`
  - [x] requireGate() — `trpc.ts:96`
  - [x] fail-closed error on deny — `trpc.ts:106` (`TRPCError({code:"CONFLICT"})`)
  - [x] audit write — `requireGate.ts:92,121,157` (3 audit points)
  - [x] evidence linkage — `requireGate.ts:170` (`evidenceBundleId` in audit metadata)
- [x] No enforcement depends on optional input fields to trigger
  - Evidence: `trpc.ts:72-93` — if `subjectId`/`stage` missing, creates system subject. `requireGate()` ALWAYS called.
- [x] Deny is transport-level error
  - Evidence: `trpc.ts:106-110` — `throw new TRPCError({code:"CONFLICT"})` — HTTP 409
- [ ] **FAIL: Not ALL sensitive mutations are governed** — see Red Team finding B2
  - ~153/205 mutations use `protectedProcedure` instead of `governedProcedure`
  - Providers, LLMs, deploy, policies, secrets, templates, triggers, wiki — ALL ungoverned

## E) Freeze Enforcement (Hard Gate)

- [x] Freeze blocks lifecycle transitions where `governedProcedure` is used
  - Evidence: `trpc.ts:60-65`, `requireGate.ts:88-114, 117-143`
- [ ] **FAIL: Freeze is NOT persisted in DB** — in-memory Map only
  - Evidence: `drift-detector.ts:62` — `const _frozenSubjects = new Map<>()`
- [ ] **FAIL: Freeze can be bypassed by ungoverned endpoints** — 153 mutations skip freeze check
- [ ] Unfreeze requires correct principal and is audited
  - `drift-detector.ts:135-145` — `unfreezeSubject()` has no auth/principal check or audit log

## F) Drift Monitoring (Gate)

- [x] Drift events are persisted (in-memory — not durable)
  - Evidence: `drift-detector.ts:63` — `_driftHistory` array
  - WARN: Lost on restart
- [x] Drift can be run-now via governance endpoint
  - Evidence: `governance/router.ts` — `driftTrigger` mutation exists
- [x] Critical/high drift can auto-freeze
  - Evidence: `drift-detector.ts:246-279` — 3 auto-freeze trigger points
- [x] Drift impacts enforcement where applicable
  - Evidence: Auto-freeze → `isFrozen()` → `requireGate()` denies

## G) Principal Attribution + Audit Integrity (Hard Gate)

- [ ] **FAIL: Hardcoded actor IDs exist** — 9 files use `?? 1` or `actor: 1`
  - `catalog-manage.ts:36`, `catalog-import/router.ts:35`, `policyService.ts:124,297`, `plugins/registry.ts:384`
- [x] Every governed action stores principalId
  - Evidence: `requireGate.ts:93,122,158` — `actor_id: actor.id`
- [x] Every decision is logged with subjectRef, stage, verdict, timestamp
  - Evidence: `requireGate.ts:163-173` — metadata includes stage, verdict, reason, score
- [ ] **WARN: Audit failures are swallowed silently**
  - Evidence: `auditLogger.ts:82-84` — `.catch()` with console.error only
- [x] AI/system actions attributed to dedicated principal
  - Evidence: `trpc.ts:85-92` — system subject `{id:0, type:"system"}`

## H) Evidence Vault Integrity (Gate)

- [x] Evidence stored content-addressed (SHA-256)
  - Evidence: `evidence.ts:83,142-144`
- [x] Evidence is immutable (no overwrite function exists)
- [x] Verify-on-read exists and fails on tampering
  - Evidence: `evidence.ts:133-137` — `verifyBundleIntegrity()`
- [ ] **WARN: Evidence not persisted to DB** — ephemeral after gate call returns
  - Evidence: `evidence.ts` — no `insert()` or `writeFile()` call

## I) Coverage Map + CI Enforcement (Hard Gate)

- [x] Coverage map enumerates:
  - [x] all mutation entrypoints — `coverage-map.ts` scans `.mutation(`
  - [ ] jobs/cron — NOT enumerated
  - [ ] CLI — NOT enumerated
  - [ ] orchestrator transitions — NOT enumerated
- [ ] **WARN: Coverage map has PASS/PARTIAL/FAIL per entrypoint** — only has aggregate %
- [x] CI fails if coverage drops below threshold
  - Evidence: `coverage-map.ts:113-117` — exit(1) if coverage < 20%
  - WARN: Threshold is 20%, should be much higher
- [x] CI enforcement validation workflow added
  - Evidence: `.github/workflows/enforcement-validation.yml` — runs all 8 probes

## J) No Placeholder Logic (Hard Gate)

- [x] No `Math.random()` in compliance paths
  - Evidence: `evidence.ts` — uses `createHash("sha256")` only
- [x] No mock freeze functions returning empty arrays
  - Evidence: `drift-detector.ts` — `getFrozenSubjects()` reads from real Map
- [x] No hardcoded remediation defaults used as "policy result"
- [x] No placeholder "TODO" in critical enforcement flows
  - Evidence: scanned `trpc.ts`, `requireGate.ts`, `evidence.ts`, `engine.ts`, `drift-detector.ts` — zero TODO markers

---

## VERDICT

| Section | Status | Blocking? |
|---------|--------|-----------|
| A) Contract Routes | **PASS** | Hard Gate |
| B) Digital HQ | **PASS** | Hard Gate |
| C) Governance Center | **PASS** | Hard Gate |
| D) Enforcement | **FAIL** | Hard Gate — 153 ungoverned mutations |
| E) Freeze | **FAIL** | Hard Gate — in-memory, bypassable via ungoverned routes |
| F) Drift | **PASS** (with warnings) | Gate |
| G) Principal Attribution | **FAIL** | Hard Gate — hardcoded `?? 1` fallbacks |
| H) Evidence Vault | **PASS** (with warnings) | Gate |
| I) Coverage Map + CI | **PASS** (with warnings) | Hard Gate |
| J) No Placeholder | **PASS** | Hard Gate |

**Overall: CONDITIONAL FAIL**

The refactor correctly implements:
- Route namespace migration (A)
- Digital HQ as read-only governance consumer (B)
- Governance Center with all 8 contract pages (C)
- Non-bypassable enforcement WHERE `governedProcedure` is used (D partial)
- Evidence integrity (H)
- System subject type + mutate stage (J)

The refactor FAILS on:
1. **Coverage gap**: Only ~52/205 mutations use `governedProcedure`. The middleware itself is perfect — it's just not applied to 75% of mutation surfaces.
2. **Freeze durability**: In-memory Map, not DB-persisted.
3. **Principal attribution**: 9 files use hardcoded `?? 1` fallbacks.

**Remediation required before acceptance:** Apply `governedProcedure` to all sensitive mutation routers (providers, LLMs, deploy, policies, secrets, templates, triggers, wiki, conversations, protocols).
