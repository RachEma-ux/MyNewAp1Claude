# Import Runtime Linking

How the catalog import pipeline resolves admin selections into real platform fields.

## The Problem (Before This Fix)

Import saved entries with `providerId: null` regardless of what the admin selected during import review. This caused downstream failures:
- Validation: `No linked provider found. Set providerId on the catalog entry.`
- Publish: blocked because validation never passed
- Execution: no provider to route to

## How It Works Now

### Field Resolution at Import Time

When `bulkCreate` creates catalog entries, it resolves runtime defaults in this order:

#### 1. `providerId` (top-level relational field)
- **Priority:** Admin selection (`runtimeDefaults.providerId`) > file metadata (`config.providerId`) > null
- **Written to:** `catalog_entries.providerId` (the field validation reads)
- **Also written to:** `config.providerId` (fallback path)
- **Applies to:** ALL entry types (model, llm, provider, agent, bot)

#### 2. Agent LLM Reference
- **Field:** `config.agent.defaultReasoningLlmRef`
- **Source:** `runtimeDefaults.llmId`
- **Applies to:** agent and bot entry types only

#### 3. Agent Provider + Model Fallback
- **Fields:** `config.agent.defaultReasoningProviderRef`, `config.agent.defaultReasoningModel`
- **Source:** `runtimeDefaults.providerId`, `runtimeDefaults.modelId`
- **Applies to:** agent and bot entry types only

#### 4. Model Reference
- **Field:** `config.model`
- **Source:** `runtimeDefaults.modelId`
- **Applies to:** ALL entry types

## Validation Alignment

After import, entries should pass validation without manual `providerId` patching:
- `entry.providerId` is set → validation resolves provider from registry
- `config.providerId` is set as fallback → secondary resolution path

## Repair Endpoint

For entries imported before this fix, use the repair endpoint:

```
POST /api/trpc/catalogImport.repairProviderLinks
Body: { "json": { "dryRun": true } }    // preview what would be fixed
Body: { "json": { "dryRun": false } }   // actually fix
Body: { "json": { "entryIds": [1, 2] }} // fix specific entries
```

Resolution strategy:
1. `config.providerId` → match to existing provider by ID
2. `config.providerType` + `config.baseUrl` → match to provider by type and URL
3. Entry name → match to provider by name

## Import Selections Are Real

Import review selections (Provider / LLM / Model) are **not** just visual defaults.
They are persisted into the real runtime-linked fields the platform uses.
Descriptive config alone (`providerType`, `baseUrl`) is not sufficient for runtime.
