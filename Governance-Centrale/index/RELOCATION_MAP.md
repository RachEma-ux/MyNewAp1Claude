# Relocation Map

Files moved into Governance-Centrale and files intentionally left in place.

---

## Moved Files

| Old Path | New Path | Type |
|---|---|---|
| `GOVERNANCE_COMPLIANCE_REPORT.md` | `Governance-Centrale/reports/GOVERNANCE_COMPLIANCE_REPORT.md` | real move |
| `cross-domain-alignment-audit-2026-03-21.md` | `Governance-Centrale/reports/cross-domain-alignment-audit-2026-03-21.md` | real move |
| `Governance_Page_Content.md` | `Governance-Centrale/docs/Governance_Page_Content.md` | real move |
| `AI-Types-Governance-Alignment-Architecture.md` | `Governance-Centrale/docs/AI-Types-Governance-Alignment-Architecture.md` | real move |
| `wiki-governance-manifest.json` | `Governance-Centrale/manifests/wiki-governance-manifest.json` | real move |
| `policies/agent_governance.rego` | `Governance-Centrale/manifests/agent_governance.rego` | real move |
| `policies/README.md` | `Governance-Centrale/docs/policies-README.md` | real move |
| `docs/governance/GOVERNANCE_BIBLE.md` | `Governance-Centrale/docs/governance-bible/GOVERNANCE_BIBLE.md` | real move |
| `docs/governance/GOVERNANCE_CONTRACT.md` | `Governance-Centrale/docs/governance-bible/GOVERNANCE_CONTRACT.md` | real move |
| `docs/governance/GOVERNANCE_FREEZE.md` | `Governance-Centrale/docs/governance-bible/GOVERNANCE_FREEZE.md` | real move |
| `docs/governance/ENFORCEMENT_RULES.md` | `Governance-Centrale/docs/governance-bible/ENFORCEMENT_RULES.md` | real move |
| `docs/governance/ENFORCEMENT_VALIDATION.md` | `Governance-Centrale/docs/governance-bible/ENFORCEMENT_VALIDATION.md` | real move |
| `docs/governance/LINKING_FRAMEWORK.md` | `Governance-Centrale/docs/governance-bible/LINKING_FRAMEWORK.md` | real move |
| `docs/governance/MATURITY_LADDER.md` | `Governance-Centrale/docs/governance-bible/MATURITY_LADDER.md` | real move |
| `docs/governance/NO_REGRESSION_POLICY.md` | `Governance-Centrale/docs/governance-bible/NO_REGRESSION_POLICY.md` | real move |
| `docs/governance/README.md` | `Governance-Centrale/docs/governance-bible/README.md` | real move |
| `docs/governance/RED_TEAM_PROTOCOL.md` | `Governance-Centrale/docs/governance-bible/RED_TEAM_PROTOCOL.md` | real move |
| `docs/governance/REVIEW_GUIDELINES.md` | `Governance-Centrale/docs/governance-bible/REVIEW_GUIDELINES.md` | real move |
| `docs/architecture/AI_TYPES_GOVERNANCE_STANDARD.md` | `Governance-Centrale/docs/architecture/AI_TYPES_GOVERNANCE_STANDARD.md` | real move |
| `docs/archive/AGENT_GOVERNANCE.md` | `Governance-Centrale/docs/archive/AGENT_GOVERNANCE.md` | real move |
| `docs/archive/AGENT_GOVERNANCE_COMPATIBILITY_CHECK.md` | `Governance-Centrale/docs/archive/AGENT_GOVERNANCE_COMPATIBILITY_CHECK.md` | real move |
| `docs/archive/AGENT_GOVERNANCE_COMPLETE.md` | `Governance-Centrale/docs/archive/AGENT_GOVERNANCE_COMPLETE.md` | real move |
| `docs/archive/AGENT_GOVERNANCE_FINAL.md` | `Governance-Centrale/docs/archive/AGENT_GOVERNANCE_FINAL.md` | real move |
| `docs/archive/AGENT_GOVERNANCE_MAPPING.md` | `Governance-Centrale/docs/archive/AGENT_GOVERNANCE_MAPPING.md` | real move |
| `docs/archive/AGENT_GOVERNANCE_UI_IMPLEMENTATION.md` | `Governance-Centrale/docs/archive/AGENT_GOVERNANCE_UI_IMPLEMENTATION.md` | real move |
| `docs/archive/GOVERNANCE_ARCHITECTURE.md` | `Governance-Centrale/docs/archive/GOVERNANCE_ARCHITECTURE.md` | real move |
| `docs/archive/GOVERNANCE_README.md` | `Governance-Centrale/docs/archive/GOVERNANCE_README.md` | real move |
| `docs/archive/OPA_POLICY_GUIDE.md` | `Governance-Centrale/docs/archive/OPA_POLICY_GUIDE.md` | real move |
| `audit/01_mutation_entrypoints.md` | `Governance-Centrale/reports/audit/01_mutation_entrypoints.md` | real move |
| `audit/02_gate_coverage_report.md` | `Governance-Centrale/reports/audit/02_gate_coverage_report.md` | real move |
| `audit/03_systemic_findings.md` | `Governance-Centrale/reports/audit/03_systemic_findings.md` | real move |
| `audit/04_governance_engine_usage.md` | `Governance-Centrale/reports/audit/04_governance_engine_usage.md` | real move |
| `audit/05_freeze_drift_enforcement.md` | `Governance-Centrale/reports/audit/05_freeze_drift_enforcement.md` | real move |
| `audit/06_risk_matrix.md` | `Governance-Centrale/reports/audit/06_risk_matrix.md` | real move |
| `audit/FINAL_REPORT.md` | `Governance-Centrale/reports/audit/FINAL_REPORT.md` | real move |
| `audit/compliance_checklist.md` | `Governance-Centrale/reports/audit/compliance_checklist.md` | real move |
| `audit/freeze_verification.md` | `Governance-Centrale/reports/audit/freeze_verification.md` | real move |
| `audit/next_governance_targets.md` | `Governance-Centrale/reports/audit/next_governance_targets.md` | real move |

## Deleted

| Path | Reason |
|---|---|
| `Governance` | Empty file (0 bytes), removed |

## Left in Place (runtime/build/CI-critical)

| Path | Reason |
|---|---|
| `server/governance/*` | Live runtime governance engine -- imported by 15+ server files |
| `server/middleware/governance.ts` | Live Express middleware |
| `server/services/governanceLogger.ts` | Live service -- used by governance engine and policyGate |
| `server/services/governanceMetrics.ts` | Live service -- used by governance engine |
| `server/operators/governance-operator.ts` | Live operator in operator registry |
| `server/syscall/governance-gate.ts` | Live syscall gate in kernel |
| `server/policies/agent_governance.rego` | Runtime OPA policy loaded by server |
| `server/policies/*-policy-engine.ts` | Runtime policy engines |
| `server/modules/pmt/governance-schema.ts` | PMT module governance schema |
| `config/governance/platform_action_registry.yaml` | Loaded at runtime by action-registry.ts |
| `controls/*.yaml` | Loaded at runtime by yaml-loader.ts |
| `schemas/governance/link_contract.schema.json` | Copied to dist/ by build script |
| `schemas/discovery-artifact.schema.json` | Loaded at runtime by discovery-artifact.ts |
| `scripts/governance/*` | Referenced by CI workflow governance-gate.yml |
| `scripts/governance-validation/*` | Referenced by CI workflow |
| `scripts/governance-pipeline.py` | CI script |
| `scripts/add-governance-wiki.*` | Script files |
| `scripts/populate-governance-wiki.mjs` | Script file |
| `scripts/setup-governance-wiki.mjs` | Script file |
| `scripts/generateGovernanceCoverageMap.ts` | Script file |
| `.github/workflows/governance-gate.yml` | GitHub requires workflows in .github/workflows/ |
| `.github/workflows/governance-validation.yml` | Same |
| `client/src/pages/governance/*` | Vite build tree -- must stay in client/src/ |
| `client/src/pages/GovernanceCenterPage.tsx` | Vite build tree |
| `client/src/pages/GovernanceScorecard.tsx` | Vite build tree |
| `client/src/components/GovernanceNav.tsx` | Vite build tree |
| `drizzle/tables/governance.ts` | Drizzle ORM schema |
| `drizzle/0010_governance_freeze.sql` | Drizzle migration |
| `migrations/add_governance_fields.sql` | Migration file |
| `tests/governance/*` | Test framework structure |
| `tests/helpers/governance-harness.ts` | Shared test helper used by 25+ test files |
| `artifacts/governance/` | Runtime artifact store base path |
| `HR/GOVERNANCE_HR_*.md` | HR domain docs (cross-domain, not pure governance) |
| `Template/Shell/Governance*.md` | Template domain docs (cross-domain) |
