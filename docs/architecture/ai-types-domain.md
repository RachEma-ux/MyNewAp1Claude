# AI Types Domain Architecture

## Overview

The AI Types domain manages five entity types: **providers**, **LLMs**, **models**, **agents**, and **bots**. Each type has a dedicated domain table that serves as the source of truth for type-specific data.

## Architecture Principle

```
AI Types Domain Tables (providers, ai_type_models, ai_type_llms, agents, bots)
   = source of truth for type-specific data

catalog_entries (sourceType + sourceId -> domain table)
   = normalized cross-module projection
   = lifecycle/governance gate
   = discovery surface for other modules

Other modules -> read catalog_entries + runtime APIs only
```

## Domain Tables

| Table | Purpose | Pre-existing? |
|---|---|---|
| `providers` | Provider registry (Ollama, OpenAI, etc.) | Yes |
| `ai_type_models` | Model domain truth (context length, API model ID, family) | New |
| `ai_type_llms` | LLM domain truth (role, model binding, provider binding) | New |
| `agents` | Agent definitions (system prompt, capabilities, governance) | Yes |
| `bots` | Bot definitions (channel bindings, behavior config) | Yes |

### Why new tables?

- The existing `models` table is for local download management (HuggingFace, GGUF files).
- The existing `llms` table is for the LLM control plane (versioning, attestation, drift detection).
- `ai_type_models` and `ai_type_llms` store the domain truth for **catalog entries** of these types.

## Module Boundary

```
server/ai-types/           <- INTERNAL: domain service, types, projection
  types.ts                 <- Shared domain type definitions
  service.ts               <- CRUD + catalog projection
  projection.ts            <- Domain -> catalog mapping
  import-normalizer.ts     <- Import data -> domain shapes
  migration.ts             <- Backfill existing catalog -> domain

drizzle/tables/ai-types.ts <- Table definitions (ai_type_models, ai_type_llms)
```

**Other modules MUST NOT:**
- Import from `server/ai-types/`
- Query `ai_type_models` or `ai_type_llms` directly
- Write to domain tables outside the AI Types service

**Other modules SHOULD:**
- Read from `catalog_entries` via `server/db/catalog.ts`
- Use runtime resolution APIs for provider/model lookup

## Data Flow

### Create (domain-first)
```
1. Caller (UI / import / sync) provides entity data
2. AI Types service writes to domain table (e.g. ai_type_models)
3. AI Types service projects to catalog_entries (sourceType + sourceId)
4. Catalog entry is available for governance, discovery, runtime
```

### Read (catalog-centric)
```
1. Consumer reads catalog_entries (getCatalogEntries, getCatalogEntryById)
2. If type-specific data needed: resolve sourceType/sourceId -> domain table
3. Runtime resolution: catalog entry -> domain entity -> provider registry
```

### Validate (domain-aware)
```
1. Validation reads catalog entry
2. Resolves provider via domain chain:
   a. sourceType=provider -> sourceId -> providers table
   b. sourceType=model -> sourceId -> ai_type_models.providerId -> providers
   c. Fallback: entry.providerId -> providers
   d. Fallback: config.providerId (legacy)
3. Provider registry handshake
```

## Catalog Entry Linkage

Every domain entity projects to a `catalog_entries` row with:
- `sourceType`: the domain type (`"model"`, `"llm"`, `"provider"`, `"agent"`, `"bot"`)
- `sourceId`: the domain table primary key

This replaces ad-hoc `config.sourceModelId`, `config.sourceProviderId`, etc.

## Canonical Key

Domain tables include a `canonicalKey` column for future portability matrix support:
- Models: `"openai/gpt-4o"`, `"anthropic/claude-3-opus"`
- Providers: `"openai"`, `"anthropic"`, `"local-ollama"`
- LLMs: TBD (role-based keys)

Not used for runtime resolution yet.

## Migration

The `backfillDomainTables()` function in `server/ai-types/migration.ts`:
1. Finds all `catalog_entries` without `sourceId`
2. Creates domain records from catalog fields + config blobs
3. Sets `sourceType` + `sourceId` on catalog entries
4. Resolves string provider slugs to numeric FKs

Safe to run multiple times (idempotent).
