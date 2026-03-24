# Module Navigation — Decision Tree

## Document Status

- **Type:** Platform-wide decision guide
- **Date:** 2026-03-24
- **Version:** 1.0.0
- **Phase:** 14

---

## 1. Purpose

Use this decision tree to determine the right adoption path for a module before starting any nav-standard work.

---

## 2. Decision Tree

```
Does the module have more than 3 navigable capabilities?
  |
  +-- NO --> Mark as "not-applicable" in the registry. Done.
  |
  +-- YES
        |
        Does the module have real domain logic (not just placeholders)?
          |
          +-- NO --> Mark as "deferred" in the registry.
          |          Create exception entry (deferred-scope).
          |          Re-evaluate when module matures.
          |
          +-- YES
                |
                Can you define permission actions for each capability?
                  |
                  +-- NO --> The module's auth model is immature.
                  |          Consider "partial adoption" with an exception.
                  |          Use visibilityMode: "show" for all items.
                  |          Create exception entry (partial-adoption).
                  |
                  +-- YES
                        |
                        Is this the first adoption or a Wave 2+ candidate?
                          |
                          +-- FIRST (new module) --> Full adoption (Workflow A)
                          |
                          +-- WAVE 2+ (legacy migration)
                                |
                                Is the module migrating from flat routes?
                                  |
                                  +-- YES --> Full adoption + route alias map
                                  |          Keep all old routes mounted.
                                  |          Document aliases.
                                  |
                                  +-- NO --> Full adoption (Workflow A)
```

---

## 3. Adoption Paths Summary

| Path | When to Use | Compliance Target | Registry Status |
|---|---|---|---|
| Full adoption | Module has clear capabilities, auth model, and domain logic | Compliant | `wave-1`, `wave-2`, or `pilot` |
| Partial adoption | Module has capabilities but auth model is immature | Partially compliant | Same + exception entry |
| Deferred | Module is too small or immature (placeholders only) | Exempt | `deferred` |
| Not applicable | Module has 3 or fewer items, no section-based nav needed | Exempt | `not-applicable` |
| Legacy pending | Module has hardcoded nav, migration planned but not started | Exempt | `legacy` |

---

## 4. Choosing Between Full and Partial Adoption

### Full Adoption Requires

- Canonical nav config using shared contract
- All mandatory metadata fields present
- Structural validation passes
- Governance pack (at minimum README + profile)
- Registry entry
- Route coherence (live items have routes)

### Partial Adoption Allows

Everything in full adoption, except:
- Visibility/permission alignment may be incomplete
- Route normalization may be partial
- Some conditional metadata may be missing
- Exception entry documents what is deferred

### When to Choose Partial

- The module's auth model doesn't support frontend role-gating yet
- Some items are live but missing scope metadata
- Route migration is staged (some routes migrated, others pending)
- The governance pack is minimal (only README + profile)

---

## 5. Examples from the Platform

| Module | Path Chosen | Why |
|---|---|---|
| Human Resources | Full adoption (reference) | Mature auth model, 14 backend routers, complex governance surface |
| PM Central | Full adoption (pilot) | Clean adoption, no legacy routes, simpler permission model |
| Automation | Partial adoption (Wave 1) | All items use `visibilityMode: "show"` because auth model is immature |
| AI Types | Legacy pending | Complex sub-entity types, migration requires design work |
| Infrastructure | Deferred | Placeholder pages only, no real domain logic |
| Communication | Not applicable | Only 3 items, too small for section-based nav |
