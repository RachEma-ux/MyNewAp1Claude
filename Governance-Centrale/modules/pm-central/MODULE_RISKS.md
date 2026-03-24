# PM Central Module — Risks

## Document Status

- **Type:** Risk register
- **Module:** PM Central
- **Last updated:** 2026-03-24

---

## Active Risks

### R1. No Backend Permission Enforcement

| Aspect | Value |
|---|---|
| Severity | Medium |
| Likelihood | High (current state) |
| Impact | All PM Central data accessible to any authenticated user |
| Mitigation | Permission model defined in nav config (`pm.*` actions); enforcement deferred to post-pilot |
| Status | Accepted for Phase 11 pilot — PM Central operates in demo mode |

### R2. Config-Sidebar Drift

| Aspect | Value |
|---|---|
| Severity | Low |
| Likelihood | Low |
| Impact | Sidebar shows items that don't match config, or config has items not in sidebar |
| Mitigation | Config-driven sidebar rendering; tests validate structural integrity |
| Status | Mitigated by Phase 11 integration |

### R3. Overfitting to HR Patterns

| Aspect | Value |
|---|---|
| Severity | Medium |
| Likelihood | Low |
| Impact | Shared standard becomes too HR-specific, forcing PM Central into unnatural shapes |
| Mitigation | Phase 11 explicitly simplified PM Central config; no masking/audit metadata forced |
| Status | Mitigated — shared types are minimal, HR extensions remain in HR code |

---

## Resolved Risks

None yet — Phase 11 is the initial risk assessment.
