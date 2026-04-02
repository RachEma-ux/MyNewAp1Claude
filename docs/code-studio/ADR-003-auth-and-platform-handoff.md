# ADR-003: Authentication and Platform Handoff

## Status: Accepted

## Context
Code Studio must integrate with the platform's authentication system and provide
a clean contract for inbound/outbound communication.

## Decision
- Authentication: Reuse platform's auth context (protectedProcedure).
- Inbound handoff: Platform POSTs a structured payload (sourceModule, repository,
  objective, constraints, priority, actor, etc.) to create a coding job.
- Outbound callback: Code Studio returns structured result (status, diffSummary,
  reviewSummary, testSummary, governanceSummary, artifactRefs).
- Service-to-service calls use internal trust (same process in MVP).

## Consequences
- No separate auth system needed for MVP.
- Handoff contract is version-controlled and documented.
- Future extraction requires adding explicit service auth (JWT/API key).
