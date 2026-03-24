# Module Nav — Adoption Entry Template

## Template

Copy and fill this out when adding a new module to the adoption registry.

---

## For MODULE_NAV_ADOPTION_REGISTRY.md

Add a row to the main table:

```
| [Module Name] | [Status] | [Compliance] | [Exception] | `[configFile].ts` | [Gov Pack] | [Validation] | [Next Action] |
```

### Field Reference

| Field | Values | Notes |
|---|---|---|
| Module Name | Human-readable name | e.g., "Finance" |
| Status | `Reference`, `Pilot`, `Wave 1`, `Wave 2`, `Legacy`, `Deferred`, `N/A` | Adoption stage |
| Compliance | `Compliant`, `Partial`, `Exempt` | Current compliance level |
| Exception | `None`, `EX-NNN` | Exception ID if any |
| Nav Config | File name or `—` | e.g., `financeNavConfig.ts` |
| Gov Pack | `Full`, `Minimal`, `—` | Governance pack completeness |
| Validation | `Pass`, `N/A` | Whether structural validation passes |
| Next Action | Brief description | What needs to happen next |

---

## For moduleNavRegistry.ts

Add an entry to the `MODULE_NAV_REGISTRY` array:

```typescript
{
  moduleId: "[module-id]",
  label: "[Module Label]",
  baseRoute: "/[base-route]",
  adoptionStatus: "[reference|pilot|wave-1|wave-2|legacy|deferred|not-applicable]",
  navConfigPath: "client/src/config/[module]NavConfig.ts",
  navConfigExists: true,
  governancePackPath: "Governance-Centrale/modules/[module-id]/",
  governancePackExists: true,
  sectionCount: [N],
  itemCount: [N],
  complianceStatus: "[compliant|partially-compliant|exempt|non-compliant]",
  exceptionStatus: "[none|active|not-required]",
  exceptionIds: [],  // e.g., ["EX-009"]
  validationPasses: true,
},
```
