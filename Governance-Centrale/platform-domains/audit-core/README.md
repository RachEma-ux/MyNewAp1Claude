# Audit Core — Platform Domain

## Overview

The audit core domain covers all audit, evidence, and traceability infrastructure across the platform.

## Components

| Component | Location | Purpose |
|---|---|---|
| Governance logger | `server/services/governanceLogger.ts` | Central audit logger |
| Evidence emitter | `server/governance/evidence-emitter.ts` | Structured evidence emission |
| Artifact store | `server/governance/artifact-store.ts` | Evidence artifact storage |
| Audit runner | `server/governance/audit-runner.ts` | Platform audit execution |
| Audit router | `server/governance/audit-router.ts` | tRPC audit endpoints |
| Scorecard engine | `server/governance/scorecard/` | Governance health scoring |
| Drift detector | `server/governance/scorecard/drift-detector.ts` | Regression detection |
| Audit artifacts | `artifacts/governance/` | Evidence files on disk |

## Current Fragmentation

See [Audit Model](../../global/AUDIT_MODEL.md) for details on the fragmented audit landscape and future unification plans.

## All files are runtime-critical and remain in their original locations.
