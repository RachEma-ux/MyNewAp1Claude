# Module Nav — Exception Registry

## Document Status

- **Type:** Platform-wide exception tracking
- **Date:** 2026-03-24
- **Version:** 1.0.0
- **Phase:** 13

---

## 1. Purpose

This registry tracks all formal exceptions to the module-nav enforcement policy. Exceptions allow modules to operate in non-compliant or partially compliant states without hiding drift.

Every exception must be:
- Visible (listed here)
- Time-bounded (has a review/expiry date)
- Justified (has a documented reason)
- Actionable (has a next required action)

---

## 2. Exception Types

| Type | Meaning |
|---|---|
| `legacy-pending` | Module uses hardcoded nav, migration not yet started |
| `partial-adoption` | Module has adopted the standard but some requirements are incomplete |
| `pilot-deviation` | Module is in pilot/trial state, not yet expected to be fully compliant |
| `deferred-scope` | Module is intentionally deferred — too small, immature, or not applicable |
| `temporary-gap` | Module has a specific gap that will be resolved in a planned phase |

---

## 3. Active Exceptions

### EX-001: HR — Mixed-scope items without explicit scopeActions

| Field | Value |
|---|---|
| Module | human-resources |
| Exception type | `temporary-gap` |
| Reason | 6 live items with `scopeType=mixed` lack explicit `scopeActions` definitions. Scope resolution works via fallback but is not declared in nav metadata. |
| Scope | Nav metadata completeness only — runtime behavior is correct |
| Owner | HR module maintainer |
| Created | 2026-03-24 |
| Review date | Next HR phase |
| Expiry | When mixed-scope items are enriched with scopeActions |
| Compensating controls | Backend `resolveDataScope()` handles scope correctly at runtime |
| Next action | Add `scopeActions` to the 6 affected items during next HR nav update |

### EX-002: Automation — Visibility alignment partial

| Field | Value |
|---|---|
| Module | automation |
| Exception type | `partial-adoption` |
| Reason | Automation uses `visibilityMode: "show"` for all items including secrets. No permission gating on frontend yet because the auth model for automation is not mature. |
| Scope | Frontend visibility gating — backend endpoints have their own access controls |
| Owner | Automation module maintainer |
| Created | 2026-03-24 |
| Review date | When workspace auth model matures |
| Expiry | When frontend role-gating is implemented for automation |
| Compensating controls | Backend tRPC procedures use `protectedProcedure` / `adminProcedure` |
| Next action | Add frontend permission gating when auth model supports it |

### EX-003: AI Types — Legacy nav pending migration

| Field | Value |
|---|---|
| Module | ai-types |
| Exception type | `legacy-pending` |
| Reason | Complex module with 5 sub-entity types using 3-level navigation. Migration requires careful section design work. |
| Scope | Full module — no adoption started |
| Owner | Unassigned |
| Created | 2026-03-24 |
| Review date | Wave 2 planning |
| Expiry | When Wave 2 adoption begins |
| Compensating controls | None — module operates outside nav standard |
| Next action | Design section structure during Wave 2 planning |

### EX-004: Digital HQ — Legacy nav pending migration

| Field | Value |
|---|---|
| Module | digital-hq |
| Exception type | `legacy-pending` |
| Reason | 8-item module with clear structure. Good Wave 2 candidate but not yet scheduled. |
| Scope | Full module — no adoption started |
| Owner | Unassigned |
| Created | 2026-03-24 |
| Review date | Wave 2 planning |
| Expiry | When Wave 2 adoption begins |
| Compensating controls | None — module operates outside nav standard |
| Next action | Adopt during Wave 2 |

### EX-005: Governance Center — Legacy nav pending migration

| Field | Value |
|---|---|
| Module | governance-center |
| Exception type | `legacy-pending` |
| Reason | 8-item module with natural governance alignment. Good Wave 2 candidate but not yet scheduled. |
| Scope | Full module — no adoption started |
| Owner | Unassigned |
| Created | 2026-03-24 |
| Review date | Wave 2 planning |
| Expiry | When Wave 2 adoption begins |
| Compensating controls | None — module operates outside nav standard |
| Next action | Adopt during Wave 2 |

### EX-006: Infrastructure — Deferred module

| Field | Value |
|---|---|
| Module | infrastructure |
| Exception type | `deferred-scope` |
| Reason | Placeholder pages (item1-item7) with no real domain logic. Too immature for nav standard adoption. |
| Scope | Full module |
| Owner | Unassigned |
| Created | 2026-03-24 |
| Review date | When module matures beyond placeholders |
| Expiry | Indefinite — re-evaluate when real domain logic exists |
| Compensating controls | N/A |
| Next action | Re-evaluate when infrastructure module gains real features |

### EX-007: WS Sandbox — Deferred module

| Field | Value |
|---|---|
| Module | ws-sandbox |
| Exception type | `deferred-scope` |
| Reason | Small surface (5 items), workspace management scope, lower priority for nav standardization. |
| Scope | Full module |
| Owner | Unassigned |
| Created | 2026-03-24 |
| Review date | Post-Wave 2 |
| Expiry | Indefinite |
| Compensating controls | N/A |
| Next action | Re-evaluate post-Wave 2 |

### EX-008: Communication — Deferred module

| Field | Value |
|---|---|
| Module | communication |
| Exception type | `deferred-scope` |
| Reason | Only 3 items. Too small to benefit from section-based navigation. |
| Scope | Full module |
| Owner | Unassigned |
| Created | 2026-03-24 |
| Review date | Post-Wave 2 |
| Expiry | Indefinite |
| Compensating controls | N/A |
| Next action | Re-evaluate if module grows beyond 3 items |

---

## 4. Closed Exceptions

*None yet — all exceptions are active as of Phase 13.*

---

## 5. Exception Lifecycle

1. **Create** — When a module cannot meet the enforcement policy, create an exception entry
2. **Track** — Each exception has a review date and expiry
3. **Review** — At each review date, assess whether the exception is still justified
4. **Resolve** — When the gap is fixed, move the exception to "Closed Exceptions"
5. **Escalate** — If an exception has been active for 3+ phases without progress, flag it in the compliance report

---

## 6. Rules

- Every partially compliant module MUST have at least one exception entry
- Every legacy module SHOULD have a legacy-pending exception entry
- Deferred and not-applicable modules SHOULD have a deferred-scope entry
- Exceptions without a review date are invalid
- Exceptions must be referenced from the module's adoption registry entry
