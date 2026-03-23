# Governance Index

Navigational map of all governance-related content in this repository.

---

## Centralized in Governance-Centrale/

### Core Governance Specification (docs/governance-bible/)
- `GOVERNANCE_BIBLE.md` -- Master governance specification (CGT v2)
- `GOVERNANCE_CONTRACT.md` -- Governance contract definitions
- `GOVERNANCE_FREEZE.md` -- Freeze protocol specification
- `ENFORCEMENT_RULES.md` -- Enforcement rule definitions
- `ENFORCEMENT_VALIDATION.md` -- Enforcement validation criteria
- `LINKING_FRAMEWORK.md` -- Governed linking framework
- `MATURITY_LADDER.md` -- Governance maturity ladder
- `NO_REGRESSION_POLICY.md` -- No-regression policy
- `README.md` -- Governance docs overview
- `RED_TEAM_PROTOCOL.md` -- Red team protocol
- `REVIEW_GUIDELINES.md` -- Review guidelines

### Architecture Standards (docs/architecture/)
- `AI_TYPES_GOVERNANCE_STANDARD.md` -- AI types governance standard

### Governance Design Documents (docs/)
- `AI-Types-Governance-Alignment-Architecture.md` -- AI types alignment architecture
- `Governance_Page_Content.md` -- Governance UI page content spec
- `policies-README.md` -- Policies directory documentation

### Archived Governance Docs (docs/archive/)
- `AGENT_GOVERNANCE.md`
- `AGENT_GOVERNANCE_COMPATIBILITY_CHECK.md`
- `AGENT_GOVERNANCE_COMPLETE.md`
- `AGENT_GOVERNANCE_FINAL.md`
- `AGENT_GOVERNANCE_MAPPING.md`
- `AGENT_GOVERNANCE_UI_IMPLEMENTATION.md`
- `GOVERNANCE_ARCHITECTURE.md`
- `GOVERNANCE_README.md`
- `OPA_POLICY_GUIDE.md`

### Reports (reports/)
- `GOVERNANCE_COMPLIANCE_REPORT.md` -- Compliance report
- `cross-domain-alignment-audit-2026-03-21.md` -- Cross-domain alignment audit

### Audit Reports (reports/audit/)
- `FINAL_REPORT.md` -- Platform audit final report
- `01_mutation_entrypoints.md` -- Mutation entrypoint audit
- `02_gate_coverage_report.md` -- Gate coverage report
- `03_systemic_findings.md` -- Systemic findings
- `04_governance_engine_usage.md` -- Governance engine usage audit
- `05_freeze_drift_enforcement.md` -- Freeze/drift enforcement audit
- `06_risk_matrix.md` -- Risk matrix
- `compliance_checklist.md` -- Compliance checklist
- `freeze_verification.md` -- Freeze verification report
- `next_governance_targets.md` -- Next governance targets

### Manifests (manifests/)
- `wiki-governance-manifest.json` -- Wiki governance manifest
- `agent_governance.rego` -- Agent governance OPA policy (reference copy)

---

## Runtime Implementation (not moved -- remains in original locations)

### Core Governance Engine
- `server/governance/` -- Full governance runtime module
  - `governance-engine.ts` -- Central enforcement engine
  - `router.ts` -- tRPC governance API endpoints
  - `index.ts` -- Public API barrel file
  - `rbac-model.ts` -- Role-based access control
  - `risk-classifier.ts` -- Risk severity classification
  - `lifecycle-guard.ts` -- Lifecycle transition enforcement
  - `publication-gate.ts` -- Publication gate validation
  - `architecture-validator.ts` -- Architecture boundary validation
  - `self-check.ts` -- Runtime health check
  - `stage-review.ts` -- Stage review checklist
  - `requireGate.ts` -- Gate enforcement
  - `requireGovernedAction.ts` -- Governed action pipeline
  - `action-registry.ts` -- Platform action registry loader
  - `action-key-map.ts` -- tRPC path to action key mapping
  - `artifact-store.ts` -- Evidence artifact storage
  - `audit-router.ts` -- Audit tRPC endpoints
  - `audit-runner.ts` -- Platform audit runner
  - `catalog-lint.ts` -- Control catalog linting
  - `gate-coverage.ts` -- Gate coverage analysis
  - `production-hardening.ts` -- Production hardening checks
  - `discovery-artifact.ts` -- Discovery artifact schema
  - `evidence-emitter.ts` -- Evidence emission
  - `drift-runner.ts` -- Drift detection runner
  - `scorecard/` -- Scorecard engine subsystem
    - `engine.ts`, `runner.ts`, `aggregator.ts`, `control-catalog.ts`
    - `governed-subject.ts`, `pack-resolver.ts`, `evidence.ts`
    - `drift-detector.ts`, `yaml-loader.ts`

### Governance Services
- `server/services/governanceLogger.ts` -- Governance audit logger
- `server/services/governanceMetrics.ts` -- Governance metrics
- `server/services/policyGate.ts` -- Policy gate (uses RBAC)

### Governance Middleware
- `server/middleware/governance.ts` -- Express enforcement middleware

### Governance Operators / Syscalls
- `server/operators/governance-operator.ts` -- Autonomous governance operator
- `server/syscall/governance-gate.ts` -- Syscall deny-by-default gate

### Runtime Config (loaded at runtime)
- `config/governance/platform_action_registry.yaml` -- Action registry YAML
- `controls/*.yaml` -- YAML control catalog (base, provider, llm, model, agent, bot, schema, system)
- `schemas/governance/link_contract.schema.json` -- Link contract schema
- `schemas/discovery-artifact.schema.json` -- Discovery artifact schema

### Runtime Policy Engines
- `server/policies/agent_governance.rego` -- Runtime OPA policy
- `server/policies/*-policy-engine.ts` -- Domain policy engines

### CI/CD Governance
- `.github/workflows/governance-gate.yml` -- CI governance gate
- `.github/workflows/governance-validation.yml` -- CI governance validation
- `scripts/governance/` -- CI invariant checks
- `scripts/governance-validation/` -- CI governance probes

### Client UI
- `client/src/pages/GovernanceCenterPage.tsx`
- `client/src/pages/GovernanceScorecard.tsx`
- `client/src/pages/governance/` -- Governance panels
- `client/src/components/GovernanceNav.tsx`
- `client/src/components/workspace/PMGovernanceBadge.tsx`

### Database
- `drizzle/tables/governance.ts` -- Governance DB schema
- `drizzle/0010_governance_freeze.sql` -- Freeze migration
- `migrations/add_governance_fields.sql` -- Governance fields migration

### Tests
- `tests/governance/` -- Governance blocking/transition tests
- `tests/helpers/governance-harness.ts` -- Governance test harness
- `tests/integration/runtime/governance-authority.test.ts`
- `tests/integration/ai-types/scenario4.governance-violation.test.ts`
- `server/governance/*.test.ts` -- Unit tests co-located with runtime

### Cross-Domain Governance References
- `HR/GOVERNANCE_HR_COMPATIBILITY_ASSESSMENT.md` -- HR governance assessment
- `HR/HR_GOVERNANCE_COMPLIANCE_AUDIT.md` -- HR compliance audit
- `Template/Shell/FederatedGovernanceModel.md` -- Federated governance template
- `Template/Shell/GovernanceBible_v1.0.0.md` -- Bible template
- `Template/Shell/GovernanceEnforcementMiddleware.md` -- Middleware template
