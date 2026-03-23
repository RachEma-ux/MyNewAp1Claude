# Module Registry — Platform Domain

## Overview

Covers the catalog/registry system that tracks all platform entities: providers, LLMs, models, agents, bots.

## Components

| Component | Location | Purpose |
|---|---|---|
| Catalog manage router | `server/routers/catalog-manage.ts` | CRUD for catalog entries |
| Catalog import router | `server/routers/catalog-import/` | External catalog import |
| Registry validator | `server/governance/registry-validator.ts` | Registry integrity checks |
| Catalog lint | `server/governance/catalog-lint.ts` | Control catalog linting |
| Catalog taxonomy | `shared/catalog-taxonomy.ts` | Type definitions for catalog |
| Catalog entries table | `drizzle/schema.ts` | Database schema |

## Governance Status

- Catalog manage uses `governedProcedure` but with hardcoded actor ID (H2)
- Catalog import stores API keys unencrypted (C5)
- Registry validator checks catalog integrity at governance level

## All files are runtime-critical and remain in their original locations.
