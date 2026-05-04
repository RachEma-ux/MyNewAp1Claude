# Validator split — reference vs runtime

**Plan v3 Phase 13.** The provider/model binding architecture has TWO validators with confusingly similar names. They answer different questions and run at different times. This doc fixes the names and behavior so neither operators nor future engineers get them mixed up.

## TL;DR

| Validator | What it checks | Cost | When called |
|---|---|---|---|
| `agentStudio.providerBindings.validate` | Does the binding row exist, is the Provider Connection bind-eligible (active + not unreachable + secret present), is the model catalog entry approved? | Cheap (DB only, no fetch) | On binding save, on UI render, on every run preflight |
| `openRouter.modelAccess.validateBinding` | Can we reach the upstream provider right now? Is `modelRef` listed in the provider's `/v1/models`? | Network round-trip; possibly slow | On-demand when an operator asks "is this still working?"; not on every run |

If you only remember one thing: **`agentStudio.providerBindings.validate` does NOT make a network call to the provider.** Anything that would require a network call lives in `openRouter.modelAccess.validateBinding`.

---

## 1. `agentStudio.providerBindings.validate` — reference/policy validation

**Module:** Agent Studio (`server/agent-studio/bindings.ts:validateBindingPolicy`).
**Surface:** Gateway action registered in `boot.ts`; called via `gatewayCall("agentStudio.providerBindings.validate", { draftId, role })`.

### What it does

1. Reads the binding row by `(draftId, role)` from `ags_agent_provider_bindings`.
2. Refuses if the row is missing (`binding_not_found`).
3. Refuses if `status` is `legacy_unresolved` / `disabled` / `archived`.
4. For non-local-provider bindings (`providerConnectionId !== null`): calls Phase 8's `providerConnections.getBindingEligibility` and refuses on `not_active` / `validated_only` / `health_failed` / `secret_missing`.
5. Returns `ok=true` when all gates pass. Catalog availability is currently `null`-stubbed — Phase 12.b tightening will wire `aiTypes.providerModels.listAvailable` (Phase 7) into this gate.

### What it does NOT do

- **No fetch to the provider.** The `unreachable` health flag was already set by a separate health-check job (`providerConnections.healthCheck`); this validator just READS it.
- **No upstream model-list probe.** That is `openRouter.modelAccess.validateBinding`.

### When it is called

- Before persisting a binding (Agent Studio binding picker save → `agentStudio.providerBindings.create`/`update`).
- On every UI render of the binding picker (to surface "this binding is now disabled" warnings).
- On every run preflight (Phase 15+ runtime adapter calls `resolveForRun` which calls this validator).
- During CI policy checks.

Because it is cheap, it is fine to call this on every interaction.

---

## 2. `openRouter.modelAccess.validateBinding` — runtime execution validation

**Module:** OpenRouter Model Access (`server/openrouter/model-access/execute.ts:validateBinding`).
**Surface:** Gateway action registered in `server/openrouter/manifest.ts`.

### What it does

1. Resolves the credential via `withProviderCredential(providerConnectionId, …)` — the only place outside `server/secrets/` that holds a decrypted PAT.
2. Issues `GET /v1/models` (or the Anthropic equivalent) to the upstream provider.
3. Returns `ok=true` if the response is healthy AND `modelRef` appears in the listed models. Anthropic absence is treated as ok (Anthropic underreports its catalog).
4. Returns `ok=false` with `reason: "upstream_unreachable" | "model_not_listed" | "auth_failed" | …` otherwise.

### When it is called

- Operator-driven: "Test this binding" button in the picker UI calls this on demand.
- Connection-rotation flow: after a PAT rotation, the operator runs this once to confirm the new credential works.
- Health-check job (`providerConnections.healthCheck`) — populates the `health_status` column that the cheap validator reads.
- **Not** on every run preflight. Calling this every run would multiply latency and hit upstream rate limits.

---

## 3. Naming + UI labels

The risk with two `validate*` actions is that a UI button labelled "Validate" is ambiguous. Phase 13 fixes this with explicit labels:

| UI surface | Old label (avoid) | New label | Calls |
|---|---|---|---|
| Binding picker save | "Validate" | (no label — happens automatically) | `agentStudio.providerBindings.validate` |
| Binding row "test" button | "Validate" | "**Test connection**" | `openRouter.modelAccess.validateBinding` |
| Connection rotation flow | "Verify" | "**Test new credential**" | `openRouter.modelAccess.validateBinding` |
| Status chip on binding row | "Validated" | "**Active**" / "**Degraded**" / "**Blocked**" | (read-only render of `validateBindingPolicy` result) |

The word "validate" is reserved for the cheap policy check; "test" is reserved for the network round-trip.

---

## 4. Decision flow at runtime

```
runtime adapter (Phase 15)
  └─ agentStudio.providerBindings.resolveForRun(draftId, role)
       └─ validateBindingPolicy   ← cheap reference check
            ├─ ok=true → return refs (binding + Provider Connection ref)
            └─ ok=false → reason (binding_not_found / legacy_unresolved /
                          provider_connection_ineligible / binding_disabled)
                          → runtime REFUSES the call (no fallback)

operator UI: "Test connection" button
  └─ openRouter.modelAccess.validateBinding(connectionId, modelRef)
       └─ withProviderCredential → fetch /v1/models
            ├─ ok → display "Provider reachable, model listed"
            └─ not ok → display reason (upstream_unreachable / auth_failed / model_not_listed)
                       → suggest rotation / check upstream status
```

The runtime path NEVER calls the network validator. If the cheap validator says ok, the runtime calls `openRouter.modelAccess.execute` directly — that call's own error path handles upstream issues in-line (returns a normalized `ModelAccessError`).

---

## 5. Test coverage

Both validators have direct test coverage:

- **`agentStudio.providerBindings.validate`** — `server/agent-studio/bindings-policy.test.ts` (10 cases, every reason branch + local-provider null-PCID).
- **`openRouter.modelAccess.validateBinding`** — `server/openrouter/model-access/execute.test.ts` (3 cases: ok / model_not_listed / Anthropic-absence-treated-as-ok) + `tests/model-access/mock-provider.test.ts` (wire-level case against the local mock provider).

Phase 13 does not add new tests — the split was already implemented in Phase 4 + Phase 12. This document records *why* and *when* each is called so the next person to read the code does not collapse them.

---

## 6. Open question deferred

**Should `validateBindingPolicy` opportunistically call `validateBinding` once per session?** Considered and deferred. The argument for: a binding picker render that displays "Active" should reflect the current upstream reality, not the last health-check sweep's output. The argument against: that doubles latency on every render, and the existing `health_status` column already exposes the most recent probe result. Decision: leave the split as-is; rely on the periodic health-check job (`providerConnections.healthCheck`) to keep `health_status` fresh.
