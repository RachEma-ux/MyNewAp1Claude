# Receipt Policy Table — Provider/Model Binding

**Plan v3 Phase 20 deliverable.** Records the governance receipt policy for every Plan v3-touched action: which actions require a `governanceReceiptId` to be attached to the gateway call, which are policy-based (caller decides per-context), and what the risk classification is.

The policy is enforced in two places:

1. **Static descriptor enforcement.** `server/platform/modules/module-gateway.ts` checks `entry.descriptor?.receiptRequired` and throws if no receipt is attached. This is a single boolean per action key.
2. **Per-input policy enforcement (Plan v3 Phase 20).** When an action's policy varies by input (e.g. `openRouter.modelAccess.execute` distinguishes `intent="agent-test"` from `intent="agent-run"`), the descriptor's `receiptRequired` stays `false` and the handler enforces the rule against the sealed context. This avoids changing the gateway's static-descriptor contract while still letting the handler refuse policy violations.

## Policy Table

| Action | Risk | Receipt | Enforcement | Rationale |
|---|---|---|---|---|
| `providerConnections.validateAndStore` | high | required | static descriptor | Writes a new encrypted secret to `provider_connections`. Every credential lifecycle event is auditable. |
| `providerConnections.rotate` | high | required | static descriptor | Replaces an existing secret. Same audit profile as validateAndStore. |
| `providerConnections.listActiveForProvider` | low | not required | static descriptor | Read-only, no secrets. Used by the binding picker (Phase 14) and the eligibility gate. |
| `providerConnections.getBindingEligibility` | low | not required | static descriptor | Read-only health/lifecycle check. |
| `aiTypes.catalog.publish` | high | required | static descriptor | Produces a new immutable bundle and flips the entry's status to `published`. |
| `aiTypes.catalog.register` *(Phase 25)* | high | required | static descriptor | **Policy declared in Phase 20; action will be wired in Phase 25.** Creates a new catalog entry — irreversible, audited, and the only sanctioned write path replacing the LC-* direct writers (`server/llm/authority.ts:107`, `server/routers/catalog-manage.ts:607-710`). |
| `agentStudio.agent.publish` | **medium** *(downgraded in Phase 20 from high)* | required | static descriptor | After the lifecycle-only refactor (publish writes `agsAgentReleases` + flips `lifecycleState`, no catalog writes), the risk is the lifecycle flip itself. Receipt remains required because publishing affects routing for production runs. |
| `agentStudio.run.execute` | medium | required | static descriptor | Production agent runs always carry a receipt. |
| `agentStudio.providerBindings.create` | medium | not required | static descriptor | Picker save. Eligibility gate (Phase 8) is the data-integrity guarantor; receipts are reserved for credential-touching paths. |
| `agentStudio.providerBindings.update` | medium | not required | static descriptor | Same as `create`. |
| `agentStudio.providerBindings.remove` | medium | not required | static descriptor | Idempotent delete. |
| `agentStudio.providerBindings.list` | low | not required | static descriptor | Read-only. |
| `agentStudio.providerBindings.validate` | low | not required | static descriptor | Reference/policy check, no upstream HTTP. |
| `agentStudio.providerBindings.resolveForRun` | low | not required | static descriptor | Read-only resolution; the actual model call requires its own receipt below. |
| **`openRouter.modelAccess.execute`** | medium | **policy-based (per-intent)** | **handler enforcement** | When `input.intent === "agent-test"` OR `input.intent === "system-internal"`, no receipt is required. `agent-test` is sandboxed by definition; `system-internal` is the infrastructure-call lane (PMB Phase 29.4a — document indexing, RAG retrieval, operator classifiers, automation `invokeAgent` fallbacks) where the calling subsystem has no user-attributed receipt source. Audit for `system-internal` calls is captured by the `correlationId` on every Model Access result plus the calling subsystem's own audit log. For every other intent (`agent-run`, `chat`, `evaluation`), the handler refuses calls without a receipt. The descriptor stays `receiptRequired: false` to preserve the exempt paths; the handler raises an `Error` with a stable message when the policy is violated. |
| `openRouter.modelAccess.stream` | medium | policy-based (per-intent) | handler enforcement | Same shape as `execute`. |
| `openRouter.modelAccess.embed` | medium | policy-based (per-intent) | handler enforcement | Same shape as `execute`. |
| `openRouter.modelAccess.validateBinding` | low | not required | static descriptor | Probe is read-only and does not consume tokens. |
| `openRouter.config.update` | high | required | static descriptor | Routing config change. |

## Enforcement implementation

The per-intent split for `openRouter.modelAccess.execute` / `.stream` / `.embed` is enforced by the `enforceModelAccessReceipt` helper in `server/openrouter/manifest.ts`. The handlers receive the sealed context as their second argument and check:

```ts
if (
  intent === "agent-test" ||
  intent === "system-internal" ||
  sealed.governanceReceiptId
) {
  return;
}
throw new Error(
  `[ModelAccess] Action 'openRouter.modelAccess.${action}' with intent='${intent}' requires a governance receipt. Test intent ('agent-test') and infrastructure intent ('system-internal') are exempt.`,
);
```

The error message is stable so callers can match on it. Tests in `server/openrouter/manifest-receipt-policy.test.ts` lock down all branches: `agent-test` without receipt succeeds; `system-internal` without receipt succeeds (Phase 29.4a); `agent-run` / `chat` / `evaluation` without a receipt throw.

### When to use `system-internal` vs a real intent

Use `system-internal` ONLY when the call originates from infrastructure that has no user-attributed receipt source. Concrete cases (locked at Phase 29.4a):

- Document indexing (`server/documents/processor.ts:storeChunkEmbeddings`).
- RAG retrieval inside legacy agent runtime (`server/agents/executor.ts:searchSimilarChunks`).
- Operator classifier calls (`server/operators/provider-hub.ts:callProviderHub`).
- Automation `invokeAgent` fallback against the legacy `agents` table when Path B refusal is bypassed for a backwards-compatibility window (currently NOT used — Phase 29.6b ships Path B refuse).

Use `agent-run` / `chat` / `evaluation` whenever the caller has a real user context AND a receipt mintable from the run/chat/eval boundary. The receipt requirement preserves the audit guarantee for user-facing flows; the `system-internal` exemption preserves it for infrastructure flows by relying on the calling subsystem's own audit log + the Model Access `correlationId`.

## Adding a new action to this table

When you add a governance action key to a manifest, add a row to this table in the SAME PR. If the policy is not obvious, request governance signoff before the PR merges.
