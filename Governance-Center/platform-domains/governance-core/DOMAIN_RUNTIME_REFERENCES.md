# Governance Core — Runtime References

All governance core files are runtime-critical. None have been moved.

| File | Location | Import Count | Reason |
|---|---|---|---|
| governance-engine.ts | `server/governance/` | 15+ | Central engine imported by all governed routers |
| index.ts | `server/governance/` | 15+ | Barrel file for governance exports |
| rbac-model.ts | `server/governance/` | 5+ | RBAC imported by policyGate and routers |
| lifecycle-guard.ts | `server/governance/` | 3+ | Lifecycle rules |
| publication-gate.ts | `server/governance/` | 3+ | Publication enforcement |
| architecture-validator.ts | `server/governance/` | 2+ | Boundary checks |
| risk-classifier.ts | `server/governance/` | 2+ | Risk classification |
| requireGate.ts | `server/governance/` | 0 | Dead code but part of governance module |
| requireGovernedAction.ts | `server/governance/` | 3+ | Governed action pipeline |
| action-registry.ts | `server/governance/` | 2+ | Loads YAML at runtime |
| action-key-map.ts | `server/governance/` | 2+ | tRPC path mapping |
| router.ts | `server/governance/` | 1 | Mounted in appRouter |
| audit-router.ts | `server/governance/` | 1 | Mounted in appRouter |
| audit-runner.ts | `server/governance/` | 2+ | Platform audit |
| artifact-store.ts | `server/governance/` | 2+ | Evidence storage |
| evidence-emitter.ts | `server/governance/` | 3+ | Evidence emission |
| catalog-lint.ts | `server/governance/` | 1+ | Control catalog linting |
| gate-coverage.ts | `server/governance/` | 1+ | Coverage analysis |
| drift-runner.ts | `server/governance/` | 1+ | Drift detection |
| self-check.ts | `server/governance/` | 1+ | Health check |
| scorecard/* | `server/governance/scorecard/` | 5+ | Scorecard subsystem |
| governanceLogger.ts | `server/services/` | 5+ | Audit logging service |
| governanceMetrics.ts | `server/services/` | 2+ | Metrics service |
| policyGate.ts | `server/services/` | 3+ | Policy gate service |
| governance.ts | `server/middleware/` | 1 | Express middleware |
| governance-operator.ts | `server/operators/` | 1 | Operator registry |
| governance-gate.ts | `server/syscall/` | 1 | Syscall gate |
| platform_action_registry.yaml | `config/governance/` | 1 | Loaded by fs.readFileSync |
| controls/*.yaml | `controls/` | 1 | Loaded by yaml-loader.ts |
