# Red Team Validation Findings

**Date:** 2026-02-23
**Target:** MyNewAp1Claude — Post-refactor (Master Alignment Directive)
**Mode:** Static code analysis (no runtime — device cannot build/run)
**Reviewer:** Hostile red team (assume worst-case attacker)

---

## A) Route + IA Integrity (Contract)

### A1: Route existence — PASS

**Evidence:**
`client/src/App.tsx:225` — `/hq/:item` route exists
`client/src/App.tsx:227` — `/governance/:item` route exists
`client/src/pages/DigitalHQPage.tsx:15-33` — 8 switch cases (org-authority, roles, workspaces, agents, discover, notifications, risk-baselines, collaboration)
`client/src/pages/GovernanceCenterPage.tsx:14-22` — 7 switch cases + default (overview, scorecards, controls, packs, freezes, drift, coverage)

**Count verification:**
- HQ: 8 pages — PASS
- Governance: 7 sidebar items + 1 detail view (handled inline in ScorecardsExplorerPanel) = 8 conceptual pages — PASS

### A2: Legacy redirects — PASS

`client/src/App.tsx:222` — `/digital-hq/:item` → redirects to `/hq/:item`
`client/src/App.tsx:223` — `/governance-center/:item` → redirects to `/governance/:item`

### A3: No stale references — PASS

```
$ grep -rn "digital-hq\|governance-center" client/ server/ --include="*.ts" --include="*.tsx" --include="*.html"
```
Only 2 hits — both are the backward-compat redirects in `App.tsx:222-223`. Zero stale references.

---

## B) Non-bypassable Governance (Structural)

### B1: Middleware structure — PASS (with CRITICAL FINDING)

**Enforcement chain:**
`server/_core/trpc.ts:122` — `governedProcedure = t.procedure.use(requireUser).use(requireGovernance)`
`server/_core/trpc.ts:52-120` — `requireGovernance` middleware:
- L60: Always checks `isFrozen(0)` (system-wide freeze)
- L72-93: Derives subject from input OR creates system subject `{id:0, type:"system", stage:"mutate"}`
- L96-103: Always calls `requireGate()`
- L105-110: Throws `TRPCError({code:"CONFLICT"})` on deny

**No conditional bypass:** The `if/else` at L72 is not a bypass — both branches run `requireGate()`. Omitting `subjectId`/`stage` from payload causes system subject enforcement, not a skip.

### B2: CRITICAL FINDING — Mutation surface NOT fully governed

**Total mutations:** 205 (across all routers)
**Governed mutations:** ~52 (using `governedProcedure` or `governedAdminProcedure`)
**Ungoverned mutations:** ~153

**HIGH-RISK BYPASS SURFACES:**

| File | Line | Procedure | Risk |
|------|------|-----------|------|
| `server/providers/router.ts` | L92-600 | `protectedProcedure` | Provider create/update/delete/activate/rotate — ALL ungoverned |
| `server/routers/llm.ts` | L107-307 | `protectedProcedure` | LLM create/update/delete — ALL ungoverned |
| `server/routers/llm-creation.ts` | L50-743 | `protectedProcedure` | LLM creation wizard — ALL ungoverned |
| `server/routers/llm-providers.ts` | L60-235 | `protectedProcedure` | LLM provider ops — ALL ungoverned |
| `server/routers/deploy.ts` | L133-458 | `protectedProcedure` | Deploy actions — ALL ungoverned |
| `server/routers/policies.ts` | L67-308 | `protectedProcedure` | Policy CRUD — ALL ungoverned |
| `server/routers/protocols.ts` | L72-166 | `protectedProcedure` | Protocol CRUD — ALL ungoverned |
| `server/routers/templates.ts` | L57-160 | `protectedProcedure` | Template CRUD — ALL ungoverned |
| `server/routers/triggers.ts` | L148-403 | `protectedProcedure` | Trigger CRUD — ALL ungoverned |
| `server/routers/discovery-ops.ts` | L461-672 | `protectedProcedure` | Discovery mutations — ALL ungoverned |
| `server/routers/wcpWorkflows.ts` | L20-181 | `protectedProcedure` | WCP workflow CRUD — ALL ungoverned |
| `server/routers/wiki.ts` | L82-161 | `protectedProcedure` | Wiki CRUD — ALL ungoverned |
| `server/routers/conversations.ts` | L63-184 | `protectedProcedure` | Conversation mutations — ALL ungoverned |
| `server/chat/router.ts` | L25-300 | `protectedProcedure` | Chat mutations — ALL ungoverned |
| `server/secrets/secrets-router.ts` | L24-89 | `protectedProcedure` | Secret CRUD — ALL ungoverned |
| `server/vectordb/vectordb-router.ts` | L21-60 | `protectedProcedure` | Vector DB ops — ALL ungoverned |
| `server/catalog-import/router.ts` | L32-159 | `protectedProcedure` | Catalog import — ALL ungoverned |
| `server/provider-connections/router.ts` | L45-205 | `protectedProcedure` | Provider connections — ALL ungoverned |
| `server/embeddings/embeddings-router.ts` | L46 | `protectedProcedure` | Cache clear — ungoverned |
| `server/hardware/hardware-router.ts` | L74 | `protectedProcedure` | Cache clear — ungoverned |
| `server/routers.ts` | L84 | `publicProcedure` | Logout — public, ungoverned (acceptable) |

**Attack scenario:**
```
// Direct tRPC call — provider create without governance
POST /api/trpc/providers.create
Content-Type: application/json
{"json":{"name":"Evil Provider","type":"openai","config":{"apiKey":"sk-stolen"}}}
```
**Expected:** CONFLICT (409) — governance gate blocks
**Actual:** 200 OK — mutation proceeds with only auth check
**Evidence:** `server/providers/router.ts:92` uses `protectedProcedure`, not `governedProcedure`

**Verdict:** FAIL — Only ~25% of mutation surface is governed. The `governedProcedure` middleware is correct and non-bypassable WHERE USED, but it is NOT used on the majority of mutations.

### B3: Governed mutations ARE properly enforced — PASS

For the ~52 mutations using `governedProcedure`:
- `server/automation/automation-router.ts` — 7 mutations governed
- `server/documents/documents-crud-router.ts` — 5 mutations governed
- `server/routers/agents.ts` — 7 mutations governed
- `server/routers/keyRotation.ts` — ~10 mutations governed
- `server/routers/agents-promotions.ts` — 4 mutations governed
- `server/routers/agents-control-plane.ts` — 6 mutations governed
- `server/routers/catalog-manage.ts` — ~13 mutations governed

These all correctly chain `requireUser → requireGovernance → requireGate`.

---

## C) Freeze Hard-Block (Everywhere)

### C1: System-wide freeze enforcement — PASS (where governed)

`server/_core/trpc.ts:60-65` — System freeze (subjectId=0) checked FIRST in middleware
`server/governance/requireGate.ts:117-143` — System freeze checked AGAIN in requireGate
`server/governance/requireGate.ts:88-114` — Per-subject freeze checked

**Both checks throw TRPCError({code:"CONFLICT"})** — transport-level denial.

### C2: Freeze storage — PARTIAL PASS (FINDING)

`server/governance/scorecard/drift-detector.ts:108-130` — `freezeSubject()` stores in `_frozenSubjects` Map
`server/governance/scorecard/drift-detector.ts:150-151` — `isFrozen()` reads from Map

**FINDING:** Freeze is **in-memory only** (Map). Server restart clears all freezes.
**File:** `drift-detector.ts:62` — `const _frozenSubjects = new Map<number, FrozenSubject>()`
**Risk:** Freeze does NOT survive process restart. Attacker can bypass by triggering server restart.
**Severity:** HIGH — Freeze is not durable.

### C3: Freeze bypass via ungoverned routes — FAIL

Since ~153 mutations use `protectedProcedure` (not `governedProcedure`), freeze does NOT block those endpoints even when system-wide freeze is active. The freeze check only runs inside `requireGovernance` middleware.

**Attack scenario:**
```
// System-wide freeze active (isFrozen(0) === true)
// Direct tRPC call — provider delete bypasses freeze
POST /api/trpc/providers.deleteProvider
{"json":{"id":42}}
```
**Expected:** CONFLICT (409) — system freeze blocks
**Actual:** 200 OK — `protectedProcedure` has no freeze check
**Evidence:** `server/providers/router.ts` imports `protectedProcedure`, never imports `governedProcedure`

---

## D) Transport-Level Deny (No payload-only "fail")

### D1: Governed paths — PASS

`server/_core/trpc.ts:106-110` — Throws `TRPCError({code:"CONFLICT"})` on gate deny
`server/_core/trpc.ts:61-64` — Throws `TRPCError({code:"CONFLICT"})` on system freeze
`server/governance/requireGate.ts:105` — Returns `httpStatus: 409` in gate result

All denial is TRPCError-based → HTTP 409 Conflict. No `{success:false}` with 200.

### D2: Ungoverned paths — N/A

Ungoverned mutations never reach governance, so "soft deny" is moot — they simply succeed.

---

## E) Principal Attribution Integrity

### E1: Hardcoded actor fallbacks — FAIL

**CRITICAL FINDINGS:**

| File | Line | Pattern | Risk |
|------|------|---------|------|
| `server/routers/catalog-manage.ts` | L36 | `actor: number = 1` | Default actor ID is `1` in audit function |
| `server/catalog-import/router.ts` | L35 | `ctx.user?.id ?? 1` | Falls back to `1` if user missing |
| `server/services/policyService.ts` | L124 | `actorId ?? parseInt(actor, 10) \|\| 1` | Falls back to `1` |
| `server/services/policyService.ts` | L297 | `actorId ?? 1` | Falls back to `1` |
| `server/plugins/registry.ts` | L384 | `installedBy: installedByUserId ?? 1` | Falls back to `1` |
| `server/chat/router.ts` | L99 | `wsId = userWorkspaces[0]?.id ?? 1` | Workspace ID falls back to `1` |
| `server/chat/router.ts` | L225 | `wsId = userWorkspaces[0]?.id ?? 1` | Same |
| `server/chat/router.ts` | L271 | `wsId = workspaces[0]?.id ?? 1` | Same |
| `server/documents/documents-router.ts` | L107 | `input.workspaceId ?? 1` | Same |

**Attack scenario:**
```
// Unauthenticated or minimal-auth user calls catalog import
// Actor is attributed as "1" (phantom principal)
POST /api/trpc/catalogImport.importOllamaModels
{"json":{...}}
```
**Expected:** Real principal attribution
**Actual:** `actor: 1` recorded in audit trail
**Evidence:** `server/catalog-import/router.ts:35`

### E2: Audit event structure — PARTIAL PASS

`server/services/auditLogger.ts:34-44` — AuditEvent has: `actor_id`, `action_type`, `target_type`, `target_id`, `decision_result`, `timestamp`
Missing: `principalType` (human/ai/system) — not in the schema.
Missing: `stage` — not a top-level field (buried in metadata).

### E3: Fire-and-forget audit — FINDING

`server/services/auditLogger.ts:82-84`:
```ts
this.persistToDb(event).catch((err) => {
  console.error("[AuditLogger] Failed to persist:", err.message);
});
```
**FINDING:** Audit persistence is fire-and-forget. DB write failure is logged to console but does NOT block the mutation. Attacker could cause DB write failures (e.g., connection exhaustion) and mutations would proceed without audit trail.
**Severity:** MEDIUM — Audit integrity is best-effort, not guaranteed.

---

## F) Evidence Vault Integrity

### F1: Content-addressed evidence — PASS

`server/governance/scorecard/evidence.ts:83-84` — bundleId uses SHA-256 hash
`server/governance/scorecard/evidence.ts:142-144` — `computeHash()` uses `createHash("sha256")`
`server/governance/scorecard/evidence.ts:122` — integrityHash computed over bundle data

### F2: Verify-on-read — PASS

`server/governance/scorecard/evidence.ts:133-137` — `verifyBundleIntegrity()` recomputes hash and compares

### F3: Evidence storage — FINDING

Evidence bundles are generated in `generateEvidenceBundle()` but there is NO persistent storage. The bundles exist only:
1. In the scorecard result object (returned to caller)
2. In CI artifacts (uploaded by governance-gate.yml)
3. In audit log metadata (embedded in audit event)

There is NO dedicated evidence table or file-based vault. Evidence is ephemeral after the gate call returns.
**Severity:** MEDIUM — Evidence exists at generation time but is not independently queryable or retrievable by bundle ID.

---

## G) Drift Monitoring Integrity

### G1: Drift detection — PASS

`server/governance/scorecard/drift-detector.ts:172+` — `detectDrift()` runs scorecard comparison

### G2: Drift persistence — FINDING

`server/governance/scorecard/drift-detector.ts:63-64`:
```ts
const _driftHistory: DriftReport[] = [];
let _lastReport: DriftReport | null = null;
```
Drift history is **in-memory only**. Server restart clears history.
**Severity:** MEDIUM — No durable drift event storage.

### G3: Auto-freeze on critical drift — PASS

`server/governance/scorecard/drift-detector.ts:246-279` — Multiple auto-freeze triggers:
- L246: Score drop below freeze threshold → `freezeSubject()`
- L262: Critical risk findings → `freezeSubject()`
- L279: Gate failure → `freezeSubject()`

### G4: Drift blocking subsequent transitions — PASS

Auto-freeze sets `_frozenSubjects` → `isFrozen()` returns true → `requireGate()` denies at L88.

---

## H) Coverage Map + CI Gate

### H1: Coverage map script — PASS

`scripts/governance/coverage-map.ts` — Scans all server `.ts` files for `.mutation(` and classifies as governed vs ungoverned.

### H2: Coverage enumeration — PARTIAL PASS

The coverage map scans for:
- Router mutations — YES
- Jobs/cron — NO (not scanned)
- CLI — NO (not scanned)
- Orchestrator transitions — NO (not scanned)

**FINDING:** Coverage map only scans for `.mutation(` in router files. Background jobs, cron tasks, CLI commands, and orchestrator internal transitions are not enumerated.

### H3: CI fails on ungoverned mutations — PARTIAL PASS

`scripts/governance/coverage-map.ts:9` — `THRESHOLD = 20` (minimum % governed)
With current ~25% governance coverage, CI passes despite 153 ungoverned mutations.
`governance-gate.yml:297` — Runs coverage map as CI step.

**FINDING:** The 20% threshold is far too low to catch regressions meaningfully. Any new ungoverned mutation will pass CI as long as total coverage stays above 20%.

---

## TOP FINDINGS SUMMARY

| # | Severity | Finding | File:Line |
|---|----------|---------|-----------|
| 1 | CRITICAL | ~75% of mutations (153/205) use `protectedProcedure` not `governedProcedure` — bypass governance entirely | Multiple routers |
| 2 | CRITICAL | Freeze check only runs inside `requireGovernance` — ungoverned routes ignore freeze | `server/_core/trpc.ts:60` |
| 3 | HIGH | Freeze state is in-memory only — server restart clears all freezes | `drift-detector.ts:62` |
| 4 | HIGH | 9 files use `?? 1` or `actor: 1` default — phantom principal attribution | `catalog-manage.ts:36`, `catalog-import/router.ts:35`, etc. |
| 5 | MEDIUM | Audit persistence is fire-and-forget — DB write failure doesn't block mutation | `auditLogger.ts:82-84` |
| 6 | MEDIUM | Evidence bundles have no persistent storage/vault — ephemeral after generation | `evidence.ts` (no storage layer) |
| 7 | MEDIUM | Drift history is in-memory only — lost on restart | `drift-detector.ts:63` |
| 8 | LOW | Coverage map threshold is 20% — too low to be meaningful | `coverage-map.ts:9` |
| 9 | LOW | AuditEvent lacks `principalType` and top-level `stage` field | `auditLogger.ts:34-44` |
| 10 | INFO | Coverage map doesn't enumerate jobs, CLI, or orchestrator transitions | `coverage-map.ts` |

---

## REMEDIATION MAP

| Finding | Remediation | Files |
|---------|-------------|-------|
| F1 (CRITICAL) | Change all `protectedProcedure.mutation(` to `governedProcedure.mutation(` in all routers | All 18+ router files listed in B2 |
| F2 (CRITICAL) | Move freeze check into `requireUser` middleware or create a separate `requireFreeze` middleware applied to ALL procedures | `server/_core/trpc.ts` |
| F3 (HIGH) | Persist frozen subjects to DB table, load on startup | `drift-detector.ts`, new migration |
| F4 (HIGH) | Remove all `?? 1` fallbacks, throw if actor is missing | 9 files listed in E1 |
| F5 (MEDIUM) | Make audit write synchronous for governance events (await the insert) | `auditLogger.ts:82` |
| F6 (MEDIUM) | Add evidence storage table, persist bundles on generation | `evidence.ts`, new migration |
| F7 (MEDIUM) | Persist drift reports to DB table | `drift-detector.ts`, new migration |
| F8 (LOW) | Raise coverage threshold to 90%+ | `coverage-map.ts:9` |
| F9 (LOW) | Add principalType and stage to AuditEvent schema | `auditLogger.ts` |
| F10 (INFO) | Extend coverage map to scan for scheduled jobs and CLI entrypoints | `coverage-map.ts` |
