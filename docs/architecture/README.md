# Architecture Documentation

## AI Types Governance — LOCKED

The AI Types governance architecture has reached production-grade hardened state.

**All changes must preserve the defined invariants.**

See [AI_TYPES_GOVERNANCE_STANDARD.md](AI_TYPES_GOVERNANCE_STANDARD.md) for the canonical specification.

---

## What Is Locked

- Domain-first entity creation pattern
- Catalog-owned intake and lifecycle (candidate -> approved -> published -> active)
- Runtime authority exclusively from Catalog
- Shared availability rule (`server/catalog/availability.ts`)
- Policy engine enforcement on all mutations
- Blocking audit on governance transitions
- Versioning with immutable publish bundles
- Structured FK linking with legacy fallback
- Catalog-backed selectors for app usage
- Real DB-backed runtime validation tests

## Enforcement

| Layer | Mechanism |
|-------|-----------|
| Runtime tests | `tests/integration/runtime-db/` — validates all invariants against real PostgreSQL |
| Static guard | `scripts/governance/check-invariants.ts` — scans for forbidden patterns |
| CI pipeline | `run-tests.yml` — fails build on invariant violation |
| Governance gate | `governance-gate.yml` — architecture boundary + policy checks |
| PR template | `.github/pull_request_template.md` — requires governance impact statement |
| Code review | `docs/governance/REVIEW_GUIDELINES.md` — rejection criteria for governance violations |

## Related Documents

- [Governance Contract](../governance/GOVERNANCE_CONTRACT.md)
- [Review Guidelines](../governance/REVIEW_GUIDELINES.md)
- [Governance Bible](../governance/GOVERNANCE_BIBLE.md)
- [Enforcement Rules](../governance/ENFORCEMENT_RULES.md)
