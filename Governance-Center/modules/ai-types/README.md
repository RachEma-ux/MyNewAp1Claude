# AI Types — Module Governance

## Overview

AI Types encompasses the catalog taxonomy: providers, LLMs, models, agents, and bots. Governance covers lifecycle management, publication gates, and policy engine evaluation for each entity type.

## Governance Status: Partial

- Catalog manage uses `governedProcedure` for most mutations
- Domain policy engines evaluate per-type governance rules
- Publication gate enforces pre-publish checks
- Known gaps: hardcoded actor ID (H2), catalog import stores API keys unencrypted (C5)

## Runtime References

| File | Location | Reason |
|---|---|---|
| Catalog manage router | `server/routers/catalog-manage.ts` | Runtime tRPC router |
| Catalog import router | `server/routers/catalog-import/router.ts` | Runtime tRPC router |
| Policy engines | `server/policies/*-policy-engine.ts` | Runtime policy evaluation |
| Catalog taxonomy | `shared/catalog-taxonomy.ts` | Shared types used by client+server |
| AI Types governance standard | `Governance-Center/docs/architecture/AI_TYPES_GOVERNANCE_STANDARD.md` | Already centralized |
| AI Types alignment doc | `Governance-Center/docs/AI-Types-Governance-Alignment-Architecture.md` | Already centralized |
