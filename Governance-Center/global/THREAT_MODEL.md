# Threat Model

## Overview

This document describes the main threats and governance-security risks for the MyNewAp1Claude platform.

## Threat Categories

### T1: Unauthorized Mutation Execution
- **Description**: A user executes a mutation they should not have access to
- **Current mitigation**: `governedProcedure` + RBAC + workspace access checks
- **Gaps**: Provider connections, key rotation, bulk document delete bypass access checks
- **Risk level**: CRITICAL (C2, C3, C4)

### T2: Governance Bypass
- **Description**: A mutation bypasses the governance engine entirely
- **Current mitigation**: `governedProcedure` wraps most mutations
- **Gaps**: `requireGate()` is dead code (C1); some routers use `protectedProcedure` only
- **Risk level**: CRITICAL (C1)

### T3: Secret Exposure
- **Description**: API keys, PATs, or secrets are exposed in plaintext
- **Current mitigation**: Secrets module, key rotation service
- **Gaps**: Catalog import stores API keys unencrypted in config field (C5)
- **Risk level**: CRITICAL (C5)

### T4: Audit Trail Gaps
- **Description**: Mutations occur without audit log entries, breaking traceability
- **Current mitigation**: `governanceLogger` + evidence emitter
- **Gaps**: Provider connections, key rotation have no audit; catalog uses hardcoded actor
- **Risk level**: HIGH (H2)

### T5: Freeze Bypass
- **Description**: Mutations execute during a governance freeze period
- **Current mitigation**: Freeze check in governance engine
- **Gaps**: Agent promotion freeze is a no-op mock (H1)
- **Risk level**: HIGH (H1)

### T6: Privilege Escalation
- **Description**: A user escalates their role or accesses another user's data
- **Current mitigation**: RBAC, workspace membership, HR data scope enforcement
- **Gaps**: Demo mode bypasses all auth; some endpoints lack role checks
- **Risk level**: MEDIUM

### T7: Data Exfiltration via Reads
- **Description**: Sensitive data read without authorization or logging
- **Current mitigation**: HR talent masking, sensitive-read logging, data scope enforcement
- **Gaps**: Non-HR modules have no read governance; most reads are unlogged
- **Risk level**: MEDIUM

### T8: Supply Chain / Model Injection
- **Description**: Malicious LLM provider or model injected into the platform
- **Current mitigation**: Provider registry, catalog governance, model policy engine
- **Gaps**: Provider connections created without governance gate
- **Risk level**: HIGH

## Risk Summary

| Risk | Severity | Status |
|---|---|---|
| C1: requireGate dead code | CRITICAL | Open |
| C2: Provider connections ungoverned | CRITICAL | Open |
| C3: Key rotation ungoverned | CRITICAL | Open |
| C4: Bulk delete access bypass | CRITICAL | Open |
| C5: API keys unencrypted | CRITICAL | Open |
| H1: Agent freeze mock | HIGH | Open |
| H2: Hardcoded actor ID | HIGH | Open |
| T6: Demo mode auth bypass | MEDIUM | By design (dev mode) |
| T7: Non-HR reads unlogged | MEDIUM | Open |
| T8: Provider injection | HIGH | Open |

## Reference

Full risk matrix with evidence: [Risk Matrix](../reports/audit/06_risk_matrix.md)
