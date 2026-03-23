# Governance Coverage Matrix

## Mutation Governance Coverage

### Modules using `governedProcedure`

| Module/Router | Governed Mutations | Notes |
|---|---|---|
| `server/governance/router.ts` | All | Full governance self-enforcement |
| `server/hr/*/router.ts` | All | governedProcedure + requireHrPermission |
| `server/agents/promotions` | Most | Freeze check is mock (H1) |
| `server/routers/catalog-manage.ts` | Most | Hardcoded actor ID (H2) |

### Modules using `protectedProcedure` only (no governance overlay)

| Module/Router | Unprotected Mutations | Risk |
|---|---|---|
| `server/routers/provider-connections` | 8 mutations | C2 — PAT rotation ungoverned |
| `server/services/keyRotation.ts` | 13 mutations | C3 — cert lifecycle ungoverned |
| `server/routers/documents-crud-router.ts` | bulkDelete | C4 — cascade delete no access check |
| `server/routers/catalog-import` | discoverFromApi | C5 — API keys in config |

### Mutations with partial governance

| Module | Issue |
|---|---|
| Agent promotions | Freeze check mock (`checkActiveIncidents()` returns `[]`) |
| Catalog manage | Actor attribution hardcoded to `1` instead of `ctx.user.id` |

## Read Governance Coverage

### Policy-gated reads

| Module | Read Type | Gate |
|---|---|---|
| HR Time | listTimeEntries, getTimeEntry, etc. | resolveDataScope (self/team/all) |
| HR Performance | listGoals, getGoal, listReviews, getReview | resolveDataScope |
| HR Talent | listTalentReviews, getTalentReview | maskTalentFields |

### Sensitive-read logging

| Module | Logging |
|---|---|
| HR | logSensitiveRead on talent reviews |
| Other modules | No sensitive-read logging |

## Modules with dedicated governance overlays

| Module | Overlay Type |
|---|---|
| HR | Full (governedProcedure + permissions + SoD + audit + data scope + talent masking) |
| Governance Center | Self-governed (governance engine governs itself) |
| Agents | Partial (promotions with governance, but mock freeze) |
| Catalog | Partial (governed mutations, but hardcoded actor) |

## Modules without governance overlays

- Provider connections
- Key rotation
- Documents (bulk operations)
- Catalog import
- Wiki
- Embeddings
- Vector DB
- Inference routing
