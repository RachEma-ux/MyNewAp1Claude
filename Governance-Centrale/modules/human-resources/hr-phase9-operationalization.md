# HR Carbon SideNav — Phase 9: Operationalization & Maintainability

## Document Status

- **Type:** Phase implementation record
- **Module:** Human Resources
- **Date:** 2026-03-24
- **Phase:** 9 — Operationalization, Observability, and Long-Term Maintainability

---

## 1. Objective

Make the HR Carbon SideNav easy to operate, verify, evolve, and review over time without changing the broad-domain backend architecture or losing governance truthfulness.

---

## 2. What Phase 9 Implements

### 2.1 Nav Integrity and Drift Detection

**Mechanism:** A frozen baseline snapshot (`hrNavBaseline.ts`) captures the known-good state of the nav config after Phase 8 acceptance. Automated tests compare the live config digest against this baseline to detect unintentional drift.

**What it detects:**
- Section count changes
- Item count changes
- Live/placeholder/not-started ratio changes
- Route alias count changes
- Masking/audit item count changes
- Section additions or removals
- Per-section item count drift

**Files:**
- `client/src/config/hrNavBaseline.ts` — Frozen baseline (13 sections, 68 items)
- `client/src/config/hrNavConfigValidator.ts` — `getNavConfigDigest()`, `detectConfigDrift()`, `checkBaselineDrift()`

**Update protocol:** When the nav config is intentionally changed, update `hrNavBaseline.ts` to match the new state.

### 2.2 Lightweight Operational Observability

**Mechanism:** A minimal, privacy-safe event tracking utility (`hrNavObservability.ts`) records navigation signals in an in-memory buffer.

**What it tracks:**
- Section visits (which sections are opened)
- Deferred item clicks (which "Coming soon" items get user interest)
- Dead-end encounters (users hitting empty/unavailable states)
- Permission-denied navigation attempts

**What it does NOT track:**
- User identity or PII
- HR data content
- Session or behavioral profiling

**Files:**
- `client/src/lib/hrNavObservability.ts` — Event buffer, trackers, summary
- `client/src/pages/hr/HRSectionLandingPage.tsx` — Emits `trackSectionVisit()` and `trackDeadEnd()`

### 2.3 Dead-End and Placeholder Handling Improvements

**Improvements:**
- Deferred "Coming soon" cards now suggest exploring available capabilities in the same section
- Section landing pages sort live items before deferred items
- Empty-state sections include a "Back to HR Home" action (no dead-end navigation)
- Sections with high deferral rates show a contextual summary message
- Dead-end detection identifies live items without resolvable routes

**Files:**
- `client/src/pages/hr/HRSectionLandingPage.tsx` — Improved `DeferredCard`, sorted rendering, section summary
- `client/src/config/hrNavConfigValidator.ts` — `getDeadEndItems()`, `getSectionDeferredAnalysis()`

### 2.4 Maintainability Helpers

**Additions:**
- `HR_BACKEND_DOMAINS` constant (14 entries) — reduces drift from string typos in backendDomain fields
- `findUnknownBackendDomains()` — validates all nav items reference valid backend domains
- `getReferencedBackendDomains()` — lists all domains actually used in the config
- `getImplementationBreakdown()` — implementation status counts for dashboards
- `checkBaselineDrift()` — structured drift check result

**Files:**
- `client/src/config/hrNavConfig.ts` — `HR_BACKEND_DOMAINS`, `findUnknownBackendDomains()`, `getReferencedBackendDomains()`, `getImplementationBreakdown()`
- `client/src/config/hrNavConfigValidator.ts` — `checkBaselineDrift()`, `getSectionDeferredAnalysis()`

### 2.5 Test Coverage

**New test file:** `server/hr/__tests__/hr-phase9.test.ts`

**Test sections (8 describe blocks, ~50 assertions):**
- A. Drift detection against frozen baseline
- B. Health summary and section completion stats
- C. Dead-end detection and deferred analysis
- D. Backend domain constant consistency
- E. Observability event tracking (unit)
- F. Maintainability helpers
- G. Baseline integrity
- H. Phase 9 feature flags and version

### 2.6 Feature Flags

Added to `hr.settings.get` response:
- `navDriftDetection: true`
- `navHealthSummary: true`
- `navObservability: true`
- `deferredItemTracking: true`

Router version updated to `9.0.0`.

---

## 3. What Phase 9 Does NOT Do

- Does not add new HR business capabilities
- Does not mirror the nav tree in backend routers
- Does not create route sprawl
- Does not add a large telemetry subsystem
- Does not log sensitive HR content
- Does not refactor unrelated HR code
- Does not create a second governance model for the nav
- Does not bypass the canonical nav config as source of truth

---

## 4. How Drift Is Prevented

| Mechanism | Automated? | Location |
|---|---|---|
| Frozen baseline snapshot comparison | Yes (test) | `hr-phase9.test.ts` section A |
| Per-section item count validation | Yes (test) | `hr-phase9.test.ts` section B |
| Backend domain constant validation | Yes (test) | `hr-phase9.test.ts` section D |
| Nav config structural validator | Yes (test) | `hr-nav-validation.test.ts` section I |
| Route-to-config coherence | Yes (test) | `hr-nav-validation.test.ts` section B |
| Governance doc review | Manual | `MODULE_PERIODIC_CHECKS.md` section 8 |

---

## 5. How Deferred Demand Is Monitored

| Signal | Mechanism | Retrieval |
|---|---|---|
| Which deferred items get clicked | `trackDeferredClick()` | `getTopDeferredItems()` |
| Which sections have dead ends | `trackDeadEnd()` | `getNavEventSummary().deadEndCount` |
| Section completion rates | `getSectionCompletionStats()` | Pure function, no backend needed |
| High-deferral sections | `getSectionDeferredAnalysis()` | `highDeferralRate` flag |

---

## 6. Files Created

| File | Purpose |
|---|---|
| `client/src/config/hrNavBaseline.ts` | Frozen baseline for drift detection |
| `client/src/lib/hrNavObservability.ts` | Lightweight nav event tracking |
| `server/hr/__tests__/hr-phase9.test.ts` | Phase 9 focused tests |
| `Governance-Centrale/modules/human-resources/hr-phase9-operationalization.md` | This document |

## 7. Files Modified

| File | Changes |
|---|---|
| `client/src/config/hrNavConfig.ts` | Added `HR_BACKEND_DOMAINS`, `findUnknownBackendDomains()`, `getReferencedBackendDomains()`, `getImplementationBreakdown()` |
| `client/src/config/hrNavConfigValidator.ts` | Added `checkBaselineDrift()`, `getSectionDeferredAnalysis()`, `validateBackendDomains()` |
| `client/src/pages/hr/HRSectionLandingPage.tsx` | Improved deferred cards, sorting, dead-end UX, observability tracking |
| `server/hr/router.ts` | Phase 9 feature flags, version 9.0.0 |
| `Governance-Centrale/modules/human-resources/MODULE_PERIODIC_CHECKS.md` | Added Phase 9 checks |
| `Governance-Centrale/modules/human-resources/MODULE_AUDIT_MODEL.md` | Added nav observability section |
| `Governance-Centrale/modules/human-resources/MODULE_OPEN_GAPS.md` | Updated gaps |
| `Governance-Centrale/modules/human-resources/MODULE_RUNTIME_REFERENCES.md` | Added Phase 9 files |
| `Governance-Centrale/modules/human-resources/CARBON_SIDENAV_ACCEPTANCE_SUMMARY.md` | Updated to Phase 9 |
