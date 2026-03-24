# HR Carbon SideNav — Phase 0 Governance Impact Note

## Document Status

- **Type:** Governance impact analysis
- **Phase:** 0 — Governance-first definition
- **Date:** 2026-03-24
- **Canonical source of truth:** `client/src/config/hrNavConfig.ts`

---

## 1. Change Description

The HR module adopts an IBM Carbon-inspired SideNav architecture that replaces a flat route list with a **13-section, 68-item hierarchical navigation model**. This navigation model is not merely a UI change — it introduces a **governed module surface** where every navigable capability declares its permission gate, scope classification, masking policy, and audit expectation.

---

## 2. Why This Is a Governed Change

| Dimension | Impact |
|---|---|
| **Data sensitivity** | The SideNav exposes entry points to PII, financial data (compensation), disciplinary records (relations), talent assessments, and security configurations |
| **Access control** | Every leaf item declares a `requiredAction` that maps to the HR role-permission matrix; unauthorized users are hidden from seeing the item entirely |
| **Field masking** | 15+ items trigger backend field masking across 4 masking domains (directory, compensation, relations, talent) |
| **Audit surface** | 10 items trigger `logSensitiveRead()` on access; all mutations across 14 backend routers are audited |
| **Scope enforcement** | Items use 5 scope types (self, team, all, sensitive, mixed) with backend `resolveDataScope()` cascade |
| **Backward compatibility** | 48 mounted routes coexist with 28 documented route aliases; no existing routes removed |
| **Organizational risk** | Incorrect visibility could expose grievances, salary data, or investigation records to unauthorized roles |

---

## 3. Governance Obligations

### 3.1 Before Implementation (Phase 0)

1. Define the full capability inventory with governance metadata per item
2. Classify every route by visibility mode and access requirement
3. Map every item to its required permission action
4. Classify every item by data scope type
5. Identify all items requiring field masking or sensitive-read audit
6. Define audit expectations for every navigable capability
7. Document the relationship between the grouped SideNav and existing flat routes

### 3.2 During Implementation (Phases 1+)

1. Nav config must be the single source of truth — no parallel hardcoded nav
2. Permission enforcement must match nav declarations
3. Masking functions must exist for every declared masking field set
4. Sensitive-read audit must fire for every declared sensitive item
5. Scope resolution must honor declared scope types
6. Deferred items must render as non-navigable placeholders
7. All changes must follow AGENTS.md orchestration

### 3.3 Ongoing Governance

1. Any new leaf item must declare all governance metadata before being added
2. Scope, masking, and audit declarations must be reviewed by the Governance agent
3. Drift detection (Phase 9) monitors structural changes against a frozen baseline
4. Compliance tests validate structural integrity on every `npm test` run

---

## 4. Impact Scope

| Surface | Before SideNav | After SideNav |
|---|---|---|
| Navigation model | 29 flat `/hr/*` routes | 13 sections + 68 items + 48 mounted routes |
| Permission declaration | Per-route, implicit | Per-item, explicit `requiredAction` |
| Visibility control | Auth-only (logged in = visible) | Role-aware (hide-if-no-access, show, show-disabled) |
| Scope classification | Not declared | Per-item: self, team, all, sensitive, mixed |
| Masking declaration | Code-only | Config-declared `maskingRequired` + `maskingFieldSet` |
| Audit declaration | Code-only | Config-declared `sensitiveReadAudit` |
| Governance documentation | Partial | Full Phase 0 governance package |

---

## 5. Risk Summary

| Risk | Severity | Mitigation |
|---|---|---|
| Visibility misconfiguration exposes sensitive data | High | All sensitive items use `hide-if-no-access`; validated by automated tests |
| Permission drift between config and backend | Medium | `validateModuleNavConfig()` checks action format; compliance tests verify action existence |
| Masking bypass | Medium | Backend masking functions independent of nav config; config declares intent, backend enforces |
| Route ordering breaks navigation | Medium | Section routes mounted before flat routes in App.tsx; tested by route coherence checks |
| Deferred items create false expectations | Low | "Coming soon" cards with dashed borders and progress indicators |

---

## 6. Phase 0 Artifact Package

This governance impact note is part of a complete Phase 0 governance package. See [CARBON_SIDENAV_PHASE0_SUMMARY.md](CARBON_SIDENAV_PHASE0_SUMMARY.md) for the full inventory of Phase 0 artifacts.

---

## 7. Approval

Phase 0 governance analysis is complete. The HR Carbon SideNav is classified as a **high-sensitivity governed change** requiring full AGENTS.md orchestration (Planner → Builder → Reviewer → Tester → Governance) for all subsequent phases.
