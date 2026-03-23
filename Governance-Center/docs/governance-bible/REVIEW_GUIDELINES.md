# Governance Review Guidelines

These guidelines apply to all PRs that modify files in the AI Types governance scope.

---

## Scope

A PR is governance-relevant if it modifies any of:

| Path | Role |
|------|------|
| `server/catalog/availability.ts` | Shared availability authority |
| `server/routers/catalog-manage.ts` | Catalog lifecycle router |
| `server/routers/agents.ts` | Agent domain router |
| `server/routers/llm.ts` | LLM domain router |
| `server/routers/models.ts` | Model domain router |
| `server/routers/bots.ts` | Bot domain router |
| `server/routers/llm-providers.ts` | Provider registry router |
| `shared/catalog-state.ts` | Unified catalog state helper |
| `drizzle/schema.ts` (catalog tables) | Database schema |
| `tests/integration/runtime-db/` | Governance invariant tests |

---

## Rejection Criteria

**Reject the PR if it:**

1. **Introduces direct `catalog_entries` writes in a domain router**
   - Domain routers must NOT call `createCatalogEntry()` directly
   - They must delegate to the Catalog via `importToCatalog` patterns

2. **Bypasses Catalog availability**
   - Any code that checks `status === "active" && reviewState === "approved"` inline
   - Must use `server/catalog/availability.ts` helpers instead

3. **Weakens lifecycle checks**
   - Removing `reviewState === "approved"` requirement from activation
   - Allowing publish without prior stage approvals
   - Removing audit logging from governance mutations

4. **Introduces a new authority path**
   - Any new endpoint that returns "available" or "usable" entries without going through `CATALOG_AVAILABILITY_FILTERS`
   - Any new way for entries to become runtime-ready that bypasses the Catalog

5. **Removes or weakens governed procedure usage**
   - Changing `governedProcedure` to `protectedProcedure` on a mutation
   - Removing governance middleware from existing endpoints

6. **Modifies immutable bundle fields**
   - Any code that updates `snapshot` or `snapshotHash` on an existing bundle

7. **Deletes or weakens governance tests**
   - Removing test cases from `tests/integration/runtime-db/`
   - Changing assertions to be less strict
   - Disabling `.runIf(hasDb)` guards

---

## Approval Criteria

**Approve the PR if:**

- All governance invariant tests pass (CI green)
- Static governance guard passes (no forbidden patterns)
- PR description includes governance impact section (if governance-relevant)
- No rejection criteria are triggered
- Changes are consistent with `docs/governance/GOVERNANCE_CONTRACT.md`

---

## Escalation

If a PR needs to intentionally modify a governance invariant:

1. The PR description must explicitly state which invariant is being changed and why
2. The `docs/governance/GOVERNANCE_CONTRACT.md` must be updated in the same PR
3. The `docs/architecture/AI_TYPES_GOVERNANCE_STANDARD.md` must be updated if affected
4. The governance test suite must be updated to reflect the new invariant
5. Architectural review is required (not just code review)

---

## Quick Reference

```
INV-1: Catalog owns intake (only catalog-manage creates catalog_entries)
INV-2: Domain separation (domain routers don't create catalog_entries)
INV-3: Lifecycle authority (only catalog-manage changes lifecycle state)
INV-4: Runtime authority (only via server/catalog/availability.ts)
INV-5: Shared availability helper (no inlined checks)
INV-6: Blocking audit (all governance mutations are audited)
INV-7: Immutable bundles (published snapshots never change)
INV-8: Governed mutations (all mutations use governedProcedure)
```

See: [GOVERNANCE_CONTRACT.md](GOVERNANCE_CONTRACT.md) for full details.
