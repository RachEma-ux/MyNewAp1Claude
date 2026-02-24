# Governance Maturity Ladder

Defines the progression levels for governance enforcement maturity across the platform.

Each level builds on the previous. A level is achieved only when all its criteria are met.

---

## Level 0 — Ungoverned

- Mutations use `protectedProcedure` only (authentication, no governance).
- No freeze enforcement.
- No audit logging on mutations.
- No coverage tracking.

**This is the default state for any new mutation. It is not acceptable for production.**

---

## Level 1 — Baseline Coverage (Threshold: 30%)

- Coverage map exists and runs in CI.
- CI blocks merge if coverage drops below threshold.
- Core lifecycle mutations (agents, documents, automation) use `governedProcedure`.
- Governance middleware chain exists: freeze check → gate evaluation → execution → audit.
- Scorecard engine operational with base + type packs.

---

## Level 2 — Structural Enforcement (Threshold: 50%)

- All high-risk mutation categories governed:
  - Secret lifecycle
  - Provider connections
  - Deployment actions
  - Lifecycle transitions (approve/activate/publish/recall)
  - Catalog management
- Freeze enforcement covers all governed mutations.
- Freeze state persisted to database (survives restart).
- Audit writes are blocking (awaited, not fire-and-forget).
- No hardcoded principal fallbacks (`?? 1` eliminated).
- Denial is transport-level (`TRPCError` with HTTP 409) on all governed paths.

---

## Level 3 — Comprehensive Governance (Threshold: 75%)

- All state-mutating entrypoints use `governedProcedure` or `governedAdminProcedure`.
- Drift detection operational with auto-freeze on critical/high findings.
- Drift events persisted to database.
- Evidence bundles persisted to durable storage.
- Coverage map enumerates routers, background jobs, and CLI entrypoints.
- Enforcement validation harness passes all probes in CI.
- Red team validation conducted with no critical findings.

---

## Level 4 — Production Lockdown (Threshold: 90%)

- Gate Coverage Map produced and verified.
- `packs.coverage.json` verified for all subject types.
- Content-addressed evidence integrity enforced.
- Centralized gate semantics (`gate_verdict: ALLOW | DENY`) used everywhere.
- Frozen subjects enforced at database, service, and UI layers.
- Catalog lint passing with minimum control counts per pack.
- Drift job active on schedule.
- All 10 acceptance tests from Governance Bible Section VII passing.
- Triple validation rule enforced: Compliance Matrix + YAML Spec + Admin Checklist.

---

## Level 5 — Full Compliance

- 100% mutation coverage.
- All Governance Bible CGT v2 sections satisfied.
- Production Compliance Declaration issued.
- No Critical, High, or Medium findings in latest red team validation.
- Continuous drift monitoring with automated incident response.
- Policy mutations are themselves governed and require architectural review.
- Coverage threshold ratchets automatically on each increase.

---

## Current State

| Metric | Value |
|--------|-------|
| Coverage threshold | 45% |
| Estimated maturity | Level 2 (in progress) |

Maturity level is determined by the lowest unmet criterion, not by coverage percentage alone.
