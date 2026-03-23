# Infrastructure — Module Governance

## Overview

Infrastructure covers providers, provider connections, secrets, key rotation, and deployment configuration.

## Governance Status: Low

- Provider connections have zero governance (C2 — 8 mutations ungoverned)
- Key rotation has zero governance (C3 — 13 mutations ungoverned)
- Secrets management uses `protectedProcedure` only
- Provider registry is governed via catalog manage

## Known Gaps

- C2: Provider connection lifecycle (PAT rotation, activation, deletion) has no governance gate
- C3: Key rotation (certificate create/activate/revoke) has no principal attribution
- These are CRITICAL-ranked risks in the risk matrix

## Runtime References

| File | Location | Reason |
|---|---|---|
| Provider connections router | `server/routers/provider-connections/router.ts` | Runtime tRPC router |
| Key rotation service | `server/services/keyRotation.ts` | Runtime service |
| Secrets module | `server/secrets/` | Runtime secrets engine |
| Providers module | `server/providers/` | Runtime provider registry |
