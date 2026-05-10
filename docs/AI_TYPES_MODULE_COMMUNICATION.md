# AI Types — Module Communication Map

How the AI Types module talks to the rest of the platform: every inbound and outbound channel, who uses it, and where the declared public surface diverges from actual usage.

Captured against `main` at the time of writing. Citations are `file:line` against the live tree.

---

## 1. What AI Types is

Per `server/ai-types/manifest.ts:1-8`:

> "AI Types is platform-core: it is the canonical catalog. It is registered as a module so the registry tracks it, but its DB is the platform `appdb` (catalog tables) — not a module-owned DB."

It owns three tables in the platform `appdb`:

- `catalog_entries`
- `ai_type_models`
- `ai_type_llms`

It is the only module declared in its manifest with `database.kind: "shared"` and `schema: "appdb"` (`manifest.ts:22-27`). All other capsules own a dedicated DB (`asdb`, `pmdb`, `wfdb`, …). That's deliberate — the catalog is platform-wide and every other module reads from it.

Its tRPC namespace is `aiTypes`, with sub-namespaces `catalog` / `registry` / `import` / `taxonomy` / `relationships` / `validation` / `orchestration` (`router.ts:28-43`). On the client it lives at `client/src/modules/ai-types/`.

---

## 2. Communication mechanisms at a glance

| Mechanism | Direction | Status | Where it's wired |
|---|---|---|---|
| **Public-API barrel** (`public-api.ts`) | inbound (others import types/contracts/events/ports) | ✅ in use | `server/ai-types/public-api.ts` |
| **Module gateway action** (`aiTypes.catalog.publish`) | inbound (governance-gated invoke) | ✅ defined, gateway-only invocation | `manifest.ts:53-86` |
| **Events emitted** (`aiTypes.catalog.published`, `aiTypes.catalog.deprecated`) | outbound | ⚠️ defined, **zero subscribers** | `events.ts`, `manifest.ts:91` |
| **Ports CONSUMED** (provider registry, agents DB, governance, providers DB) | outbound (lazy, via boot wiring) | ✅ in use | `ports.ts`, `boot.ts:44-128` |
| **Ports PROVIDED** (`aiTypes.catalog`) | inbound | declared in manifest, no formal consumer port shim | `manifest.ts:92` |
| **Catalog gate** (provider load-time approval check) | inbound (load-bearing) | ✅ critical | `server/providers/init.ts:17-44` + `server/providers/catalog-guard.ts:15-23` |
| **tRPC namespace** (`trpc.aiTypes.*`) | inbound from client | ✅ in use, ~16 call sites | `client/src/modules/ai-types/` |
| **Direct DB-API imports** (`from "../ai-types/db"`, etc.) | inbound | ⚠️ widely used, bypasses `public-api.ts` | see §6 |
| **Direct table reads** (`db.select().from(catalogEntries)`) | inbound | ⚠️ minor, three call sites | see §7 |
| **Handoffs** | n/a | none — AI Types is not a handoff acceptor or publisher | — |

---

## 3. The declared public surface

`server/ai-types/public-api.ts` is a 12-line barrel:

```ts
/** AI Types — Public API
 *  AI Types is platform-core: its catalog is the cross-module
 *  coordination surface. This file is the only allowed import surface.
 */
export * from "./types";
export * from "./contracts";
export * from "./events";
export * from "./ports";
export { aiTypesManifest } from "./manifest";
```

Everything other modules need *should* be reachable from `import { … } from "../ai-types/public-api"`. In practice, most consumers reach into deeper internal files — see §6.

---

## 4. Outbound — what AI Types calls into

AI Types is supposed to never directly import another module's internals. It uses **ports** (dependency-inverted) instead. The port interfaces are defined in `ports.ts`; the real implementations are wired into them at boot in `boot.ts`.

| Port | Used for | Wired to | boot.ts line |
|---|---|---|---|
| `ICatalogProviderPort.getRegistry()` | retrieving `IStreamingProvider` instances by id for catalog execution | `server/providers/registry` (pre-loaded async) | `boot.ts:44-55` |
| `ICatalogAgentPort.getAgent(id)` | looking up an agent referenced by a catalog entry | `server/agents/db` | `boot.ts:57-62` |
| `ICatalogGovernancePort.evaluateStageReview(entryId, stage, ctx)` | running the lifecycle stage review during catalog publish | `server/governance/stage-review` (with shape-mapping shim) | `boot.ts:64-116` |
| `ICatalogProviderDbPort.getAllProviders()` / `getProviderById(id)` | catalog-manage operations that need provider rows | `server/providers/db` | `boot.ts:118-128` |

A grep of `server/ai-types/**/*.ts` for cross-module imports returns hits **only inside `boot.ts`** — i.e., AI Types itself respects the rule "no direct imports from `server/providers/`, `server/agents/`, `server/governance/`" stated in `ports.ts:9-11`. The lazy `import()`s in `boot.ts` are the legitimate dependency-injection bridge.

`bootAiTypesModule()` is invoked twice (idempotent via `_booted` flag at `boot.ts:40`):
1. From `server/_core/index.ts` early in startup so subsequent steps can use the ports.
2. From the AI Types manifest's `boot()` hook, fired by the platform RuntimeManager.

---

## 5. Outbound — events emitted (and the listener vacuum)

`server/ai-types/events.ts` declares two event types:

```ts
export const AI_TYPES_EVENTS = {
  catalogPublished: "aiTypes.catalog.published",
  catalogDeprecated: "aiTypes.catalog.deprecated",
} as const;
```

`manifest.ts:91` advertises them: `events: { emits: [...] }`.

A repo-wide grep for `aiTypes.catalog.published`, `aiTypes.catalog.deprecated`, `AI_TYPES_EVENTS.catalogPublished`, `AI_TYPES_EVENTS.catalogDeprecated`, and any `eventBus.on(...)` referencing those keys returns **zero subscribers** outside the events file itself.

Implication: events are defined but currently inert. If they're emitted at all (publishing.ts is the suspect), no other capsule reacts to them. Either (a) the events were forward-declared for future subscribers and should stay, or (b) they should be removed until a real consumer exists. Decision belongs to the AI Types owner; for now the doc just records the state.

---

## 6. Inbound — direct imports from `server/ai-types/`

24 files outside `server/ai-types/` import from it. They split into three groups.

### 6a. Through the public-api barrel — ✅ contract-respecting

None.

(No file imports from `server/ai-types/public-api.ts`. Every consumer reaches deeper.)

### 6b. Through the platform's own re-exports — ✅ legitimate bridge

| Importer | Imports from | Note |
|---|---|---|
| `server/db.ts:1` | `../ai-types/db` (`export *`) | Re-exports as part of the platform's combined `db` namespace |
| `server/db/index.ts:1` | `../ai-types/db` | Same |
| `server/db/catalog.ts:1` | `../ai-types/db` (multiple named functions) | Re-exposed under `server/db/catalog.ts` |
| `server/_core/index.ts:14,15,30` | execution + boot helpers | Platform startup orchestration |
| `server/platform/modules/manifests.ts:1` | `aiTypesManifest` | Module registry |
| `server/platform/modules/module-routers.ts:1` | `aiTypesRouter` | tRPC composition |

These are the platform infrastructure laying out AI Types' interfaces for everyone else. Allowed by design.

### 6c. Direct internal imports — ⚠️ outside the declared public-api

These reach into `ai-types/db.ts`, `ai-types/execution.ts`, `ai-types/invoke.ts`, `ai-types/service.ts`, `ai-types/import-normalizer.ts`, or `ai-types/service-runtime.ts`:

| Caller | Path imported | Symbols |
|---|---|---|
| `server/agents/executor.ts:10` | `../ai-types/execution` | `resolveCatalogAgentExecutionTarget` |
| `server/agents/stream.ts:1` | `../ai-types/invoke` | `invokeCatalogEntry` |
| `server/catalog-import/router.ts:1-3` | `../ai-types/service`, `../ai-types/import-normalizer` | `createModel`, `createLlm`, normalizers, projection linker |
| `server/governance/router.ts:1` | `../ai-types/db` | `getCatalogEntryById`, `getEntryClassifications` |
| `server/llm/authority.ts:4` | `../ai-types/db` | `getActiveBundleForEntry`, `getCatalogEntryById` |
| `server/providers/catalog-guard.ts:8` | `../ai-types/db` | `getCatalogEntries` (load-bearing — see §8) |
| `server/providers/router.ts:1` | `../ai-types/db` | `getCatalogEntries`, `createCatalogEntry`, `createCatalogAuditEvent`, `getTaxonomyNodes`, `setEntryClassifications` |
| `server/ps/context-translator-router.ts:1` | `../ai-types/service-runtime` | … |
| `server/routers/agents.ts:34` | `../ai-types/db` | `createCatalogEntry`, `createCatalogAuditEvent`, `getTaxonomyNodes`, `setEntryClassifications` |
| `server/routers/bots.ts:1` | `../ai-types/db` | (same as agents.ts) |
| `server/routers/catalog-manage.ts:1` | `../ai-types/service` | `createModel`, `createLlm`, `resolveProviderFromCatalogEntry` |
| `server/routers/conversations.ts:1` | `../ai-types/execution` | … |
| `server/routers/models.ts:1` | `../ai-types/db` | catalog management functions |
| `server/routers/catalog-registry.ts:1` | `../ai-types/execution` | `resolveCatalogAgentExecutionTarget`, `resolveServiceAgentExecutionTarget` |
| `server/sandbox-wf/seed-orchestrator.ts:1` | `../ai-types/db` | `createCatalogEntry`, `createPublishBundle` |
| `server/modules/pmt/context-translator-agent.ts:1` | `../../ai-types/db` | All db functions |
| `server/modules/pmt/idea-builder-agent.ts:1` | `../../ai-types/db` | All db functions |

**Two observations:**

1. The de-facto public surface is `ai-types/db.ts` (CRUD + lookup), `ai-types/execution.ts` (catalog-driven runtime resolution), `ai-types/invoke.ts` (single-call streaming), `ai-types/service.ts` (publish-side mutations), `ai-types/service-runtime.ts`, and `ai-types/import-normalizer.ts`. Everyone uses these, none of them are re-exported by `public-api.ts`.
2. The boundary comment in `public-api.ts:5` ("this is the only allowed import surface") is aspirational, not enforced. Enforcement would require either: re-exporting db/execution/invoke/service from the barrel (and adding a lint rule), or introducing a port-style shim like the four ports in `ports.ts` and migrating callers to it.

This doesn't necessarily indicate a bug — most of these consumers existed before the modular refactor finalized in PR #75 and the catalog tables genuinely are platform-wide infrastructure. But the gap between declared and actual surface is worth knowing.

---

## 7. Inbound — direct table reads

Three sites bypass even the `db.ts` helpers and run raw Drizzle against the catalog table:

| Caller | Pattern | Reason |
|---|---|---|
| `server/catalog-import/router.ts:481` | `db.select().from(catalogEntries).where(...)` | One-off repair to backfill missing `providerId` on imported entries |
| `server/llm/authority.ts:87,107` | `tx.select().from(catalogEntries)` + `tx.insert(catalogEntries)` | LLM-onboarding flow that creates a catalog entry inside the same transaction as authority records |
| `server/routers/agents.ts:81` | `db.select().from(catalogEntries)` | Read-only join on the agent list endpoint |

None are critical functionality breaks. They are precisely the boundary edge cases that an enforced public-api would force into the helper module.

---

## 8. Inbound — the catalog gate (load-bearing)

The single most operationally important integration in the platform. `server/providers/init.ts:17-44`:

```ts
let approvedProviderIds: Set<number>;
try {
  approvedProviderIds = await getApprovedProviderIds();
  console.log(`[Providers] Catalog gate: ${approvedProviderIds.size} approved provider(s)`);
} catch (err: any) {
  console.warn(`[Providers] Catalog gate unavailable (${err.message}) — loading all enabled providers`);
  approvedProviderIds = new Set(providers.map(p => p.id));
}
…
if (!approvedProviderIds.has(provider.id)) {
  console.log(`[Providers] Blocked provider: ${provider.name} (id=${provider.id}) — no active catalog entry`);
  blockedCount++;
  continue;
}
```

`getApprovedProviderIds()` lives at `server/providers/catalog-guard.ts:15-23` and runs `getCatalogEntries({ entryType: "provider", status: "active", reviewState: "approved" })`.

**Effect:** at server boot, a provider row in the platform `providers` table will not be loaded into the runtime registry unless AI Types has an `active`+`approved` catalog entry referencing it. The catalog is the source of truth for "what providers can the platform actually use right now."

This is why the local dev server log shows `[Providers] Blocked provider: OpenAI (id=1) — no active catalog entry` — the row exists in the DB, but no approved catalog entry covers it, so it stays out of the registry. (Reminder: this gate is what protects production from un-vetted provider configs being loaded.)

---

## 9. Inbound — module gateway

`manifest.ts:53-86` registers one public action via `registerPublicApi`:

```
key: "aiTypes.catalog.publish"
description: "Publish a catalog entry"
risk: "high"
receiptRequired: true
```

The handler calls `publishCatalogEntry` from `./publishing`. The payload demands a `catalogEntryId` and `publishedBy`; optional `versionLabel`, `policyDecision`.

A repo-wide grep for the literal `"aiTypes.catalog.publish"` finds it only in `manifest.ts:35` (definition) and `server/governance/action-key-map.ts:1` (governance routing table). No module currently calls it — invocation must happen via the gateway with a governance receipt, and that path is exercised through `aiTypes.catalog.publish` from the UI's Catalog tab and through governance escalation flows that route through the action-key-map.

---

## 10. Inbound — tRPC client surface

Roughly 16 client-side call sites across 8 files in `client/src/modules/ai-types/`:

| Sub-namespace | Client uses | Pages |
|---|---|---|
| `taxonomy` | 4 | `AITypesControlPanelPage`, `AITypesTaxonomyPage` |
| `orchestration` | 4 | `AITypesControlPanelPage`, `AITypesOverviewPage` |
| `validation` | 2 | `AITypesControlPanelPage`, `AITypesValidationPage` |
| `relationships` | 2 | `AITypesControlPanelPage`, `AITypesRelationshipsPage` |
| `catalog` | 2 | `AITypesControlPanelPage` |
| `registry` | 1 | `AITypesGovernancePage` |
| `import` | 1 | `AITypesControlPanelPage` |

Cross-module client imports are fenced by `client/src/modules/index.ts` — capsules can only import from each other through `@/modules/<name>`.

---

## 11. Topology diagram

```
                ┌────────────────────────────────────────────────────┐
                │                  AI TYPES (capsule)                │
                │                                                    │
                │  server/ai-types/                                  │
                │  ├── manifest.ts        — registers module         │
                │  ├── public-api.ts      — declared barrel          │
                │  ├── ports.ts           — port interfaces          │
                │  ├── boot.ts            — DI port wiring           │
                │  ├── events.ts          — event keys               │
                │  ├── db.ts              — owned-table CRUD         │
                │  ├── execution.ts       — catalog → runtime target │
                │  ├── invoke.ts          — single-call streaming    │
                │  ├── service.ts         — model/llm authoring      │
                │  └── publishing.ts      — gateway publish action   │
                │                                                    │
                │  appdb tables (owned):                             │
                │   • catalog_entries                                │
                │   • ai_type_models                                 │
                │   • ai_type_llms                                   │
                └────────────────────────────────────────────────────┘
                          ↑                          ↓
        Inbound calls                           Outbound (via ports, lazy)
        (today's actuals)                       (boot.ts wiring)
                          ↑                          ↓
   ┌──────────────────────┴───┐    ┌─────────────────┴─────────────────┐
   │                          │    │                                   │
   │  Direct internal imports │    │  ICatalogProviderPort   →  providers/registry
   │  from 24 server files    │    │  ICatalogAgentPort      →  agents/db
   │  (db / execution /       │    │  ICatalogGovernancePort →  governance/stage-review
   │   invoke / service)      │    │  ICatalogProviderDbPort →  providers/db
   │                          │    │                                   │
   │  Examples:               │    └───────────────────────────────────┘
   │   • providers/catalog-guard.ts (← LOAD-BEARING)
   │   • providers/router.ts
   │   • routers/{agents,bots,models,catalog-manage,catalog-registry,conversations}.ts
   │   • llm/authority.ts
   │   • catalog-import/router.ts
   │   • sandbox-wf/seed-orchestrator.ts
   │   • modules/pmt/{context-translator,idea-builder}-agent.ts
   │   • _core/index.ts (platform boot)
   │                          │
   │                          │
   │  tRPC: trpc.aiTypes.*    │  ←  client/src/modules/ai-types/
   │   catalog / registry /
   │   import / taxonomy /
   │   relationships / validation / orchestration
   │
   │  Gateway: aiTypes.catalog.publish (governance-receipt-required)
   │
   │  Events: aiTypes.catalog.{published,deprecated} (no subscribers today)
   │
   │  Direct table reads (3 sites — repair / cross-domain insert / list-join)
   └──────────────────────────┘
```

---

## 12. Health check — what's solid, what's drifty

**Solid**

- AI Types itself respects its own boundary rule: no direct cross-module imports anywhere except the lazy DI calls in `boot.ts`.
- The catalog gate is the authoritative provider-load policy and is correctly wired through `getApprovedProviderIds()` → `catalog-guard.ts` → `init.ts`.
- The four port interfaces (`ICatalogProviderPort`, `ICatalogAgentPort`, `ICatalogGovernancePort`, `ICatalogProviderDbPort`) are the right shape for what AI Types needs from those modules.
- The tRPC namespace + client capsule isolation is clean.
- The owned-table set is small (3 tables) and clearly documented in the manifest.

**Drift to be aware of (not necessarily a bug — recording as observed state)**

- **`public-api.ts` does not actually export the things consumers use.** `db.ts`, `execution.ts`, `invoke.ts`, `service.ts`, `service-runtime.ts`, `import-normalizer.ts` are imported directly by 24 files. Either re-export those from the barrel and add a lint rule, or accept that the catalog is platform infrastructure and the strict-public-api stance was aspirational.
- **Events are defined but unsubscribed.** `aiTypes.catalog.published` / `…deprecated` have zero listeners. Either kill them or document the intended subscriber.
- **Three direct `from(catalogEntries)` table reads** sneak past even the `db.ts` helpers (see §7). Not load-bearing but they widen the boundary.
- **No formal port shim for "AI Types as a provider."** `manifest.ts:92` advertises `ports: { provided: ["aiTypes.catalog"] }`, but there's no `aiTypes.catalog` port object that other modules wire into — they just import from `db.ts` directly. This is the dependency-inverted analogue of the previous bullet.

The catalog is a platform-wide source of truth. Whether that means its surface should be strictly fenced (option A: tighten `public-api.ts`) or openly available (option B: accept the imports and document them as the platform contract) is an architecture decision for the AI Types owner, not a defect to fix.

---

## 13. Quick file index

| Concern | File |
|---|---|
| Module registration | `server/ai-types/manifest.ts` |
| Declared public surface | `server/ai-types/public-api.ts` |
| Port interfaces | `server/ai-types/ports.ts` |
| Port wiring (DI) | `server/ai-types/boot.ts` |
| Event keys | `server/ai-types/events.ts` |
| Schemas | `server/ai-types/contracts.ts` |
| tRPC composition | `server/ai-types/router.ts` |
| Owned-table CRUD | `server/ai-types/db.ts` |
| Catalog gate | `server/providers/init.ts:17-44` + `server/providers/catalog-guard.ts:15-23` |
| Gateway action key map | `server/governance/action-key-map.ts` |
| Client surface | `client/src/modules/ai-types/` |
