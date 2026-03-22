## Summary

<!-- Brief description of what this PR does -->

## Changes

<!-- List the key changes made -->

-

## Test Plan

<!-- How was this tested? -->

- [ ] Existing tests pass
- [ ] New tests added (if applicable)

---

### Governance Impact

<!-- REQUIRED for any change touching server/catalog/, server/routers/, shared/catalog-state.ts, or tests/integration/runtime-db/ -->

Does this change:
- [ ] Affect Catalog intake (how entries are created)?
- [ ] Affect lifecycle (approve, publish, activate flow)?
- [ ] Affect runtime authority (how availability is determined)?
- [ ] Modify the shared availability rule (`server/catalog/availability.ts`)?
- [ ] Add new `createCatalogEntry()` calls?
- [ ] Change governance middleware usage (`governedProcedure`)?

**If any box is checked, explain why governance invariants are preserved:**

<!--
Reference: docs/governance/GOVERNANCE_CONTRACT.md
Key invariants:
  - Catalog owns intake and lifecycle
  - Domain creates entities but does NOT create catalog_entries
  - Runtime authority comes ONLY from Catalog
  - Availability must use shared authority rules
-->
