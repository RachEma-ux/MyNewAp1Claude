# Provider/Model Binding Bridge

**Status:** Active. Plan v3 Phases 7–17 landed the bridge between
Provider Connections, AI Types catalog, and Agent Studio bindings.
Decisions D1–D11 in `DECISION_RECORD.md` are the binding contract.

---

## What this document covers

The end-to-end path that lets an Agent Studio agent reach a real
provider model at runtime — without the agent (or any frontend
component) ever holding a credential.

The bridge is built from four parts:

1. **Provider Connections** owns connection lifecycle and stores the
   encrypted PAT/API key.
2. **AI Types catalog** holds the canonical provider/model entries
   that bindings reference.
3. **Agent Studio** persists per-agent bindings (provider connection
   + model catalog entry, no credentials).
4. **OpenRouter Model Access** is the only call site that combines
   the binding with the credential at runtime.

---

## The reference shape (D2, D7, D8)

A binding is a tuple of immutable references:

```
(workspaceId, agentId, draftId, role) → {
  providerConnectionId,         // Provider Connections row id
  providerCatalogEntryId,       // AI Types catalog row id
  modelCatalogEntryId,          // AI Types catalog row id
  modelRef,                     // upstream provider model identifier
  status: "binding_v1" | "legacy_no_credential" | "legacy_unresolved"
                              | "disabled" | "archived"
  lastValidatedAt,              // Phase 15 staleness window
}
```

No credential material is stored on the binding row, in the agent
draft, or in any catalog entry. The credential lives in
`provider_secrets` (Provider Connections-owned) and is reachable
**only** through `withProviderCredential` — the internal resolver
gated to OpenRouter Model Access.

---

## Lifecycle gates

```
   ┌──────────────────────────────────────────────────────────────┐
   │ Provider Connections                                          │
   │   create → validateAndStore → activate                        │
   │   status: pending → validated → active                        │
   │   public read APIs return ProviderConnectionRef (no secrets)  │
   └──────────────────────────────────────────────────────────────┘
                              │
                              │  getBindingEligibility (Phase 8)
                              │  → eligible iff lifecycleStatus="active"
                              │     AND healthStatus !== "unreachable"
                              ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ Agent Studio: agentStudio.providerBindings.create / update    │
   │   - re-runs eligibility gate                                  │
   │   - writes ags_agent_provider_bindings row                    │
   │   - status="binding_v1" on success                            │
   └──────────────────────────────────────────────────────────────┘
                              │
                              │  resolveForRun (Phase 15+16)
                              │  → blocks if validation_stale (5min default)
                              ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ OpenRouter Model Access (D4)                                  │
   │   - openRouter.modelAccess.execute / stream                   │
   │   - calls withProviderCredential(providerConnectionId)        │
   │   - executes the upstream call                                │
   │   - never returns the credential                              │
   └──────────────────────────────────────────────────────────────┘
```

---

## Cross-module call shape

Every cross-module call uses the Module Gateway with sealed context:

```ts
gatewayCall({
  ctx: {
    sourceModule: "agentStudio",
    targetModule: "openRouter",
    actionKey: "openRouter.modelAccess.execute",
    governanceReceiptId: "...",   // when descriptor.receiptRequired = true
  },
  input: { providerConnectionId, modelRef, intent, prompt, ... },
});
```

Forbidden patterns (enforced by `check:architecture` and the Phase 42
boundary tests in `tests/pmb/boundary.test.ts`):

- Agent Studio importing `server/provider-connections/internal/...`
  directly.
- AI Types importing `server/agent-studio/<anything-not-shared>`.
- AI Types reading `getAsDb()`.
- Anyone outside Provider Connections reading `process.env.<X>_API_KEY`
  for a provider key.

---

## Receipt policy (Phase 20)

Every governance descriptor declares `risk` (low | medium | high) and
a static `receiptRequired` boolean. The gateway enforces the receipt
before invoking the handler. Two exceptions use Phase 20's hybrid
policy:

- `openRouter.modelAccess.execute` — descriptor flag `false`, handler
  calls `enforceModelAccessReceipt(payload.intent, sealed, "execute")`
  which decides per-intent. Test/playground intents skip the receipt;
  production intents require one.
- `openRouter.modelAccess.stream` — same hybrid pattern.

`server/openrouter/manifest-receipt-policy.test.ts` verifies the
hybrid wiring.

---

## Staleness (Phase 15)

`ags_agent_provider_bindings.last_validated_at` records the most
recent successful policy validation. `resolveForRun` blocks bindings
older than `VALIDATION_STALENESS_MS` (5 min default) with
`reason="validation_stale"`. The Refresh button on the Agent Binding
page calls `validateBindingPolicy` to refresh the timestamp.

---

## Where to read more

- `DECISION_RECORD.md` — D1–D11 locked decisions
- `CURRENT_REALITY_MAP.md` — pre-Plan-v3 starting state
- `RECEIPT_POLICY.md` — Phase 20 hybrid policy
- `RUNTIME_PATH_MIGRATION_MATRIX.md` — Phase 17 migration
- `MODEL_ACCESS_CONTRACT.md` — the runtime call surface
