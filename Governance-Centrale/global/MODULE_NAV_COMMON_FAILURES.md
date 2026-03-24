# Module Navigation — Common Failures and Drift Patterns

## Document Status

- **Type:** Platform-wide failure prevention guide
- **Date:** 2026-03-24
- **Version:** 1.0.0
- **Phase:** 14

---

## 1. Purpose

This document catalogs common mistakes, drift patterns, and failure modes observed during module-nav adoption. Use it to avoid repeating known errors.

---

## 2. Common Mistakes During Adoption

### M1: Starting with code, not governance

**What happens:** Contributor writes a nav config without doing the governance analysis first. Permissions, scope, and visibility are guessed or left as defaults.

**How to avoid:** Follow the governance-first rule. Fill out the governance review template before writing code.

### M2: Forgetting to register in the code-facing registry

**What happens:** Module has a nav config but is not in `moduleNavRegistry.ts`. Compliance tests don't cover it. Admin dashboards don't know about it.

**How to avoid:** Step 4 of Workflow A. Always add a registry entry when creating a new nav config.

### M3: Live item with no route

**What happens:** An item is marked `implementationStatus: "live"` but no route is mounted in `App.tsx`. Users click the nav item and get a 404 or blank page.

**How to avoid:** Run route coherence validation. Compliance tests check this for adopted modules.

### M4: Live item with backedBy "not-yet-implemented"

**What happens:** Contradictory metadata — the item claims to be live but also claims no surface exists. This is a blocking compliance failure.

**How to avoid:** The shared validator (`validateModuleNavConfig()`) catches this automatically.

### M5: Missing governance pack

**What happens:** Module is adopted in code but has no governance documentation. Risks, gaps, and permissions are undocumented.

**How to avoid:** Create at minimum README.md and MODULE_GOVERNANCE_PROFILE.md in the governance pack. Use the scaffolding script to generate stubs.

### M6: Forgetting to update indexes after changes

**What happens:** Governance-Centrale indexes (`GOVERNANCE_INDEX.md`, `README.md`) become stale. New docs are not discoverable.

**How to avoid:** Use the operating checklist. Step 9 of Workflow A covers index updates.

---

## 3. Common Drift Patterns

### D1: Nav config diverges from governance docs

**Where it appears:** Module's nav config has items that don't match what's documented in the governance pack's control surface or open gaps.

**How to detect:** Compare `MODULE_CONTROL_SURFACE.md` item lists against the actual nav config. HR uses frozen baseline + drift detection tests.

**How to fix:** Update governance docs to match the current nav config state, or fix the nav config if the docs are correct.

### D2: Registry status doesn't match actual compliance

**Where it appears:** Module is marked "compliant" in the registry but has missing validation, incomplete governance pack, or unresolved exceptions.

**How to detect:** Compliance tests check status consistency. Review manually during governance pass.

**How to fix:** Update the registry to match reality. Add exceptions if needed.

### D3: Route ordering causes wrong page to render

**Where it appears:** Section landing routes and flat routes conflict. wouter uses first-match-wins, so if a flat route is mounted before a section route, the flat route catches all traffic.

**How to detect:** Manual testing of section landing page URLs. Route coherence tests can catch missing routes but not ordering issues.

**How to fix:** Mount section routes BEFORE flat routes in App.tsx.

### D4: Exception registry goes stale

**Where it appears:** Exceptions have passed their review date or the gap has been fixed but the exception is still active.

**How to detect:** Check review dates in `MODULE_NAV_EXCEPTION_REGISTRY.md`. The compliance report flags stale exceptions.

**How to fix:** Review the exception. If the gap is fixed, move to "Closed Exceptions". If still active, update the review date and next action.

### D5: Template diverges from standard

**Where it appears:** Templates in `Governance-Centrale/templates/` reference outdated types, missing fields, or old patterns.

**How to detect:** Compare template shapes against `client/src/navigation/moduleNavTypes.ts`.

**How to fix:** Update templates to match the current shared contract.

---

## 4. What to Check After Any Nav Change

See `MODULE_NAV_OPERATING_CHECKLIST.md` for the full post-change verification list. Key quick checks:

1. Does `validateModuleNavConfig()` pass with zero errors?
2. Are all live items routed in App.tsx?
3. Is the registry accurate?
4. Are governance docs updated?
5. Do compliance tests pass?

---

## 5. Anti-Patterns to Avoid

| Anti-Pattern | Why It's Bad | What to Do Instead |
|---|---|---|
| Copying HR config verbatim and stripping fields | Leaves broken references, wrong actions | Use the template or scaffolding script |
| Adding items as "live" before the page exists | Users hit dead ends | Add as "not-started", promote when page is ready |
| Skipping the governance review for "small" changes | Permissions, scope, visibility can silently drift | Check governance rules Section 2 — if it changes metadata, review is needed |
| Creating routes for not-yet-implemented items | Dead-end navigation | Only route live and placeholder items |
| Hardcoding module nav in MainLayout | Bypasses the config-driven model | Always derive sidebar from the canonical nav config |
| Adding exception entries without review dates | Exceptions become permanent | Every exception must have a review date |
