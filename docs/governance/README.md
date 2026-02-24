# Governance Control-Plane Documentation

This folder is the single source of truth for all governance policy and enforcement documentation.

---

## Purpose

All governance-related documents live here. This separation ensures:

- **Policy documents** define what the rules are.
- **Enforcement documents** define how the rules are applied at runtime and in CI.

No governance documentation should exist outside this folder (except archived historical references in `docs/archive/`).

---

## File Index

| File | Purpose |
|------|---------|
| `GOVERNANCE_BIBLE.md` | Canonical governance and security standard (CGT v2). Defines all rules, compliance matrices, risk classification, and the YAML enforcement spec. Primary governance authority. |
| `ENFORCEMENT_RULES.md` | Non-negotiable governance invariants. Absolute rules that override convenience, velocity, and developer preference. |
| `ENFORCEMENT_VALIDATION.md` | Governance Scorecard Engine blueprint. Defines the control-plane architecture, pack system, scoring model, CI integration, drift detection, and API contracts. |
| `MATURITY_LADDER.md` | Governance maturity progression levels (Level 0–5) with criteria per level. |
| `NO_REGRESSION_POLICY.md` | Invariants that prevent governance from weakening — ratchet rules, downgrade prohibitions, CI enforcement. |
| `RED_TEAM_PROTOCOL.md` | Red team validation findings. Static analysis results covering mutation coverage, freeze enforcement, principal attribution, evidence integrity, and drift monitoring. |

---

## Authority

These documents are the control-plane authority for the system. CI enforcement pipelines (`.github/workflows/governance-gate.yml`, `.github/workflows/enforcement-validation.yml`) depend on and validate against the standards defined here.

Changes to governance documents require architectural review.
