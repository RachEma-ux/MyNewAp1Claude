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
| **`openRouter.modelAccess.execute`** | medium | **policy-based (per-intent)** | **handler enforcement** | When `input.intent === "agent-test"`, no receipt is required (test runs are sandboxed by definition). For every other intent (`agent-run`, `chat`, `evaluation`), the handler refuses calls without a receipt. The descriptor stays `receiptRequired: false` to preserve the test path; the handler raises an `Error` with a stable message when the policy is violated. |
| `openRouter.modelAccess.stream` | medium | policy-based (per-intent) | handler enforcement | Same shape as `execute`. |
| `openRouter.modelAccess.validateBinding` | low | not required | static descriptor | Probe is read-only and does not consume tokens. |
| `openRouter.config.update` | high | required | static descriptor | Routing config change. |

## Enforcement implementation

The per-intent split for `openRouter.modelAccess.execute` and `openRouter.modelAccess.stream` is enforced by the handlers registered in `server/openrouter/manifest.ts`. The handlers receive the sealed context as their second argument and check:

```ts
if (input.intent !== "agent-test" && !sealed.governanceReceiptId) {
  throw new Error(
    `[ModelAccess] Action 'openRouter.modelAccess.execute' with intent='${input.intent}' requires a governance receipt. Test intent ('agent-test') is exempt.`,
  );
}
```

The error message is stable so callers can match on it. Tests in `server/openrouter/model-access/execute.test.ts` (Phase 20 group) lock down both branches: `agent-test` without receipt succeeds; `agent-run` without receipt throws.

## Adding a new action to this table

When you add a governance action key to a manifest, add a row to this table in the SAME PR. If the policy is not obvious, request governance signoff before the PR merges.
