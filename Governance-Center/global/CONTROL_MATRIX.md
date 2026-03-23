# Control Matrix

Maps governance controls to their implementation, scope, and known gaps.

## Control Inventory

| Control | Category | Implementation Location | Runtime Enforcement | Scope | Fail Mode | Known Gaps |
|---|---|---|---|---|---|---|
| Freeze check | Change control | `governance-engine.ts` | governedProcedure | Platform-wide | Fail-closed | Agent promotion freeze is mock (H1) |
| Lifecycle guard | Lifecycle | `lifecycle-guard.ts` | governedProcedure | Entity lifecycle | Fail-closed | — |
| RBAC check | Access control | `rbac-model.ts` | policyGate, governedProcedure | Platform-wide | Fail-closed | Provider connections ungoverned (C2) |
| Publication gate | Publication | `publication-gate.ts` | governedProcedure | Publishable entities | Fail-closed | — |
| Architecture validator | Boundary | `architecture-validator.ts` | governedProcedure | Architecture rules | Fail-closed | — |
| Risk classification | Risk | `risk-classifier.ts` | governedProcedure | All governed actions | Log only | — |
| Audit logging | Audit | `governanceLogger.ts` | governedProcedure | Governed mutations | Log-on-fail | Catalog uses hardcoded actor (H2) |
| Evidence emission | Evidence | `evidence-emitter.ts` | governedProcedure | Governed mutations | Fail-open | Not all mutations emit evidence |
| Scorecard evaluation | Health | `scorecard/engine.ts` | On-demand | Per entity | Informational | — |
| Drift detection | Regression | `scorecard/drift-detector.ts` | On-demand | Per entity | Informational | — |
| HR permissions | Access control | `server/hr/` | requireHrPermission | HR module | Fail-closed | — |
| HR SoD | Integrity | `server/hr/` | preventSelfApproval | HR approvals | Fail-closed | — |
| HR data scope | Data access | `server/hr/` | resolveDataScope | HR reads | Fail-closed | — |
| HR talent masking | Privacy | `server/hr/talent/` | maskTalentFields | Talent reads | Mask-on-deny | — |
| Workspace access | Access control | Various routers | hasWorkspaceAccess | Workspace resources | Fail-closed | Bulk delete bypasses (C4) |
| Input validation | Input | tRPC Zod schemas | All endpoints | All inputs | Fail-closed | — |
| CI governance gate | CI/CD | `governance-gate.yml` | PR merge | All PRs | Fail-closed | — |

## Coverage Summary

- **Governed mutations**: Majority via `governedProcedure`
- **Ungoverned mutations**: Provider connections (8), key rotation (13), some catalog ops
- **Governed reads**: HR sensitive reads, talent masking
- **Ungoverned reads**: Most non-HR reads have no governance overlay

See [Governance Coverage Matrix](GOVERNANCE_COVERAGE_MATRIX.md) for detailed mutation-level coverage.
