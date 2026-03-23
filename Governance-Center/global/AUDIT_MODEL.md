# Audit Model

## Current Audit Systems

### 1. Governance Audit Logger
- **Location**: `server/services/governanceLogger.ts`
- Logs governance decisions (allow/deny) with actor, action, target, reason
- Used by governance engine and policy gate

### 2. Evidence Emitter
- **Location**: `server/governance/evidence-emitter.ts`
- Emits structured evidence artifacts for governance actions
- Stored in `artifacts/governance/` directory

### 3. Audit Runner
- **Location**: `server/governance/audit-runner.ts`
- Platform-wide audit runner that checks governance health
- Exposed via `server/governance/audit-router.ts` tRPC endpoints

### 4. Routing Audit Logs
- **Database table**: `routing_audit_logs`
- Records inference routing decisions for traceability

### 5. HR Audit Logging
- Sensitive read logging via `logSensitiveRead`
- SoD (Separation of Duties) enforcement logging
- Per-action audit in HR governance procedures

### 6. Scorecard System
- **Location**: `server/governance/scorecard/`
- Evaluates governance health per entity against a YAML control catalog
- Drift detection flags governance regressions

## Fragmentation

Current audit is fragmented across multiple systems:
- Governance logger (service-level)
- Evidence emitter (artifact-level)
- Database audit logs (query-level)
- HR-specific audit (module-level)
- Scorecard drift (governance-health-level)

Each system uses its own format, storage, and query mechanism.

## Intended Future Unification

A unified audit backbone would:
1. Consolidate all audit events into a single queryable store
2. Standardize event schema across all audit sources
3. Provide a single audit query API
4. Enable cross-module audit correlation
5. Support audit evidence export for compliance reporting

This unification has not yet been implemented. Each subsystem currently operates independently.

## Audit Coverage

| Domain | Audit Coverage | System |
|---|---|---|
| Governance engine | Full | governanceLogger + evidence emitter |
| HR mutations | Full | governedProcedure + HR audit |
| HR reads | Partial (sensitive reads only) | logSensitiveRead |
| Provider connections | None | No audit logging |
| Key rotation | None | No audit logging |
| Catalog mutations | Partial (hardcoded actor) | Audit with actor: 1 |
| Agent promotions | Partial | Governance but mock freeze check |
| Document operations | None on bulk | No audit on bulkDelete |
