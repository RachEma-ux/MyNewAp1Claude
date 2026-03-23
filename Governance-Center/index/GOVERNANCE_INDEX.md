# Governance Index

Navigational map of all governance-related content in this repository.

---

## Global Governance Doctrine (`global/`)

| Document | Purpose |
|---|---|
| [GOVERNANCE_MODEL.md](../global/GOVERNANCE_MODEL.md) | Platform governance architecture and enforcement layers |
| [SECURITY_MODEL.md](../global/SECURITY_MODEL.md) | Implemented security controls (auth, RBAC, secrets, audit) |
| [AUDIT_MODEL.md](../global/AUDIT_MODEL.md) | Audit systems, fragmentation, and unification plans |
| [OPERATIONAL_COMPLIANCE_MODEL.md](../global/OPERATIONAL_COMPLIANCE_MODEL.md) | Review cadence, evidence, compliance ownership |
| [CONTROL_MATRIX.md](../global/CONTROL_MATRIX.md) | Controls mapped to implementation, scope, fail mode, gaps |
| [POLICY_ENGINE_POSITION.md](../global/POLICY_ENGINE_POSITION.md) | Rule-based vs OPA clarification |
| [GOVERNANCE_COVERAGE_MATRIX.md](../global/GOVERNANCE_COVERAGE_MATRIX.md) | Mutation/read governance coverage per module |
| [THREAT_MODEL.md](../global/THREAT_MODEL.md) | Threats and governance-security risks |
| [GOVERNANCE_FIRST_MODULE_AND_SANDBOX_POLICY.md](../global/GOVERNANCE_FIRST_MODULE_AND_SANDBOX_POLICY.md) | Official governance-first module and sandbox policy |

---

## Sandbox (`sandbox/`)

| Document | Purpose |
|---|---|
| [README.md](../sandbox/README.md) | Sandbox overview, active sandboxes, promotion process |
| [SANDBOX_POLICY.md](../sandbox/SANDBOX_POLICY.md) | Operational sandbox rules (concise) |
| [_templates/](../sandbox/_templates/) | Copy-ready sandbox governance templates (4 files) |

---

## Module Governance Packet Templates (`templates/module/`)

| Template | Purpose |
|---|---|
| [README.template.md](../templates/module/README.template.md) | Module overview and governance status |
| [MODULE_GOVERNANCE_PROFILE.template.md](../templates/module/MODULE_GOVERNANCE_PROFILE.template.md) | Governance model, procedures, permissions |
| [MODULE_CONTROL_SURFACE.template.md](../templates/module/MODULE_CONTROL_SURFACE.template.md) | Controls, gates, enforcement points |
| [MODULE_AUDIT_MODEL.template.md](../templates/module/MODULE_AUDIT_MODEL.template.md) | Audit logging, evidence, traceability |
| [MODULE_PERIODIC_CHECKS.template.md](../templates/module/MODULE_PERIODIC_CHECKS.template.md) | Recurring governance checks |
| [MODULE_RISKS.template.md](../templates/module/MODULE_RISKS.template.md) | Risk register and categories |
| [MODULE_OPEN_GAPS.template.md](../templates/module/MODULE_OPEN_GAPS.template.md) | Open governance gaps and remediation |
| [MODULE_RUNTIME_REFERENCES.template.md](../templates/module/MODULE_RUNTIME_REFERENCES.template.md) | Runtime code locations |

---

## Module Governance Profiles (`modules/`)

| Module | Governance Status | Key File |
|---|---|---|
| [Human Resources](../modules/human-resources/README.md) | Full | governedProcedure + permissions + SoD + masking |
| [AI Types](../modules/ai-types/README.md) | Partial | governedProcedure + policy engines |
| [Workspace](../modules/workspace/README.md) | Partial | hasWorkspaceAccess |
| [Automation](../modules/automation/README.md) | Minimal | protectedProcedure only |
| [Resources](../modules/resources/README.md) | Minimal | protectedProcedure + access checks |
| [Collaboration](../modules/collaboration/README.md) | Minimal | protectedProcedure only |
| [PM Central](../modules/pm-central/README.md) | Partial | PMT governance schema |
| [Digital HQ](../modules/digital-hq/README.md) | Minimal | Dashboard display only |
| [Governance Center](../modules/governance-center/README.md) | Full | Self-governed |
| [Infrastructure](../modules/infrastructure/README.md) | Low | CRITICAL gaps (C2, C3) |

---

## Platform Domain Governance (`platform-domains/`)

| Domain | Key File |
|---|---|
| [Governance Core](../platform-domains/governance-core/README.md) | Core engine, RBAC, lifecycle, gates |
| [Policy Engine](../platform-domains/policy-engine/README.md) | TypeScript policy engines, OPA reference |
| [Audit Core](../platform-domains/audit-core/README.md) | Logging, evidence, scorecard, drift |
| [Identity & Access](../platform-domains/identity-access/README.md) | Auth, RBAC, workspace membership |
| [Module Registry](../platform-domains/module-registry/README.md) | Catalog/registry system |
| [Publication & Lifecycle](../platform-domains/publication-lifecycle/README.md) | Lifecycle states, publication gates |
| [Runtime Agents](../platform-domains/runtime-agents/README.md) | Autonomous agents, operators, syscalls |

---

## Core Governance Specification (`docs/governance-bible/`)

| Document | Purpose |
|---|---|
| [GOVERNANCE_BIBLE.md](../docs/governance-bible/GOVERNANCE_BIBLE.md) | Master governance specification (CGT v2) |
| [GOVERNANCE_CONTRACT.md](../docs/governance-bible/GOVERNANCE_CONTRACT.md) | Governance contract definitions |
| [GOVERNANCE_FREEZE.md](../docs/governance-bible/GOVERNANCE_FREEZE.md) | Freeze protocol specification |
| [ENFORCEMENT_RULES.md](../docs/governance-bible/ENFORCEMENT_RULES.md) | Enforcement rule definitions |
| [ENFORCEMENT_VALIDATION.md](../docs/governance-bible/ENFORCEMENT_VALIDATION.md) | Enforcement validation criteria |
| [LINKING_FRAMEWORK.md](../docs/governance-bible/LINKING_FRAMEWORK.md) | Governed linking framework |
| [MATURITY_LADDER.md](../docs/governance-bible/MATURITY_LADDER.md) | Governance maturity ladder |
| [NO_REGRESSION_POLICY.md](../docs/governance-bible/NO_REGRESSION_POLICY.md) | No-regression policy |
| [RED_TEAM_PROTOCOL.md](../docs/governance-bible/RED_TEAM_PROTOCOL.md) | Red team protocol |
| [REVIEW_GUIDELINES.md](../docs/governance-bible/REVIEW_GUIDELINES.md) | Review guidelines |

---

## Reports & Audits (`reports/`)

| Report | Purpose |
|---|---|
| [FINAL_REPORT.md](../reports/audit/FINAL_REPORT.md) | Platform audit final report |
| [01_mutation_entrypoints.md](../reports/audit/01_mutation_entrypoints.md) | Mutation entrypoint audit |
| [02_gate_coverage_report.md](../reports/audit/02_gate_coverage_report.md) | Gate coverage report |
| [03_systemic_findings.md](../reports/audit/03_systemic_findings.md) | Systemic findings |
| [04_governance_engine_usage.md](../reports/audit/04_governance_engine_usage.md) | Governance engine usage audit |
| [05_freeze_drift_enforcement.md](../reports/audit/05_freeze_drift_enforcement.md) | Freeze/drift enforcement audit |
| [06_risk_matrix.md](../reports/audit/06_risk_matrix.md) | Risk matrix |
| [compliance_checklist.md](../reports/audit/compliance_checklist.md) | Compliance checklist |
| [GOVERNANCE_COMPLIANCE_REPORT.md](../reports/GOVERNANCE_COMPLIANCE_REPORT.md) | Compliance report |
| [cross-domain-alignment-audit](../reports/cross-domain-alignment-audit-2026-03-21.md) | Cross-domain alignment audit |

---

## Key Runtime Governance Locations (outside Governance-Center)

These remain in their original locations because they are runtime/build-critical:

| Location | Purpose |
|---|---|
| `server/governance/` | Core governance engine (40+ files) |
| `server/policies/` | Domain policy engines (7 files) |
| `server/middleware/governance.ts` | Express enforcement middleware |
| `server/services/governance*.ts` | Governance services (logger, metrics) |
| `server/hr/` | HR governance implementation (14 sub-routers) |
| `config/governance/` | Runtime action registry YAML |
| `controls/` | Runtime YAML control catalog |
| `scripts/governance*/` | CI governance scripts |
| `.github/workflows/governance-*.yml` | CI governance workflows |
| `client/src/pages/governance/` | Governance UI pages |
| `drizzle/tables/governance.ts` | Governance DB schema |
| `tests/governance/` | Governance test suite |
| `HR/` | HR governance audit docs (cross-domain) |
| `Template/Shell/Governance*.md` | Template governance docs (cross-domain) |

---

## Scope & Organization

See [GOVERNANCE_SCOPE.md](GOVERNANCE_SCOPE.md) for what counts as governance content.
See [RELOCATION_MAP.md](RELOCATION_MAP.md) for the full old path → new path mapping.
