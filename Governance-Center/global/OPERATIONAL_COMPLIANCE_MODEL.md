# Operational Compliance Model

## How Operational Compliance Differs

| Concept | Focus |
|---|---|
| **Governance doctrine** | What the rules are (freeze, lifecycle, RBAC, scorecard) |
| **Security controls** | How threats are mitigated (auth, secrets, input validation) |
| **Operational compliance** | How we verify and maintain adherence over time |

Operational compliance is the ongoing practice of confirming that governance and security controls remain effective.

## Review Cadence

### Continuous (Automated)
- Governance engine evaluates every governed mutation in real-time
- Scorecard drift detector flags governance regressions
- CI governance gate runs on every PR (`.github/workflows/governance-gate.yml`)
- CI governance validation probes run periodically

### Per-Release
- Audit runner produces platform governance health report
- Gate coverage analysis checks for ungoverned mutations
- Control catalog linting verifies YAML consistency

### Periodic (Manual)
- Cross-domain alignment audits (see `reports/`)
- Module governance re-audits (e.g., HR v7.2.0 re-audit)
- Risk matrix review and re-ranking

## Evidence Expectations

Each governance action should produce:
1. **Audit log entry** — who, what, when, decision, reason
2. **Evidence artifact** — structured JSON stored in `artifacts/governance/`
3. **Scorecard evaluation** — governance health score per entity

Current state: evidence production is inconsistent across modules (see [Audit Model](AUDIT_MODEL.md)).

## Compliance Ownership

| Area | Owner |
|---|---|
| Platform governance engine | Platform team (governance-engine maintainers) |
| Module governance (HR, etc.) | Module owners |
| CI governance gates | DevOps / platform team |
| Security controls | Platform team |
| Audit trail integrity | Platform team |

## Periodic Governance Checks

1. **Mutation coverage check**: Are all mutations governed? (gate-coverage.ts)
2. **Freeze integrity check**: Is freeze enforcement operational? (freeze_verification)
3. **Scorecard drift check**: Have governance scores regressed? (drift-runner.ts)
4. **Action registry sync**: Are all actions registered? (action-registry.ts)
5. **Control catalog lint**: Are YAML controls valid? (catalog-lint.ts)

## Sandbox Compliance

Sandbox explorations are subject to the [Sandbox Policy](../sandbox/SANDBOX_POLICY.md) and the overarching [Governance-First Module and Sandbox Policy](GOVERNANCE_FIRST_MODULE_AND_SANDBOX_POLICY.md). Active sandboxes must be tracked in `Governance-Center/sandbox/README.md` and reviewed at their declared target review dates. Sandbox promotion requires full module governance packet compliance.

## Remediation Tracking

Governance gaps identified in audits are tracked in:
- `reports/audit/next_governance_targets.md` — prioritized remediation list
- `reports/audit/06_risk_matrix.md` — severity-ranked risk matrix
- Module-specific `MODULE_OPEN_GAPS.md` files (in this structure)

Remediation follows the standard workflow: identify gap → create task → implement fix → re-audit → close gap.
