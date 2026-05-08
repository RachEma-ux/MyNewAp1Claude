# ADR — `test-run-binding` is a tools-less single-shot lane

**Owner:** Agent Studio module + Governance
**Status:** Locked 2026-05-08
**Authority:** Closes G2 of the 2026-05-08 RAC audit

---

## 1. Context

The 2026-05-08 RAC audit flagged the `runTestWithBinding` path
(`server/agent-studio/services/test-run-binding.ts`) as **asymmetric**
with `chat-stream.ts` and `chat.ts`: the former invokes the RAC
orchestrator (best-effort) but does not call the ProposedToolCall
validator (D-PTC-2 / D-PTC-3), the approval gate (D-APP-EXT-2/3/4/5),
or the tool-call trace writer (D-PTC-5).

The audit marked the asymmetry as "Medium severity, unverified." Direct
verification on `main@03fb194` reveals the path is **structurally
tools-less**, not bypass-shaped: there is nothing for the validator to
gate.

---

## 2. Decision

The `runTestWithBinding` lane is the canonical shape for **single-shot
model-binding test runs**. It deliberately advertises no tool surface
to the model, which is why it does not invoke the validator / approval
/ trace chain.

The wiring asymmetry is correct.

---

## 3. Evidence

Verifiable on `main@03fb194`:

| Surface | Tools-less assertion | File:line |
|---|---|---|
| Service input type `RunTestWithBindingInput` | 9 fields: `draftId`, `role?`, `workspaceId`, `actorId`, `prompt`, `systemPrompt?`, `intent?`, `temperature?`, `tokenBudget?`, `correlationId?`. **No `tools` field.** | `services/test-run-binding.ts:60-84` |
| tRPC procedure `agentStudio.providerBindings.testRunWithBinding` zod input | Closed-shape `z.object({...})` with the same 9 keys. **No `tools` field.** | `api/provider-bindings-router.ts:214-243` |
| `runTestWithBinding` constructing `ModelAccessExecuteInput` | Passes `providerConnectionId`, `modelRef`, `messages`, `intent`, `workspaceId`, `actorId`, `temperature?`, `tokenBudget?`, `correlationId?`. **No `tools` field.** | `services/test-run-binding.ts:220-230` |
| Service result type `RunTestWithBindingSuccess` | `output: string`, `latencyMs`, `usage?`, four binding-correlation refs, `correlationId?`. **No `tool_calls` field.** | `services/test-run-binding.ts:86-97` |

Therefore the model is invoked with no tool surface and cannot emit
`tool_use` blocks. **D-PTC-3 ("every model-emitted tool-use passes the
validator") holds vacuously** in this lane.

---

## 4. Why this isn't a chat-path bypass

`chat-stream.ts` and `chat.ts` both:

1. Pass `tools` to `ModelAccessExecuteInput` (sourced from the CAG
   capability pack).
2. Loop on streamed `tool_use` blocks until the model emits
   end-of-turn.
3. Validate every block (D-PTC-2), gate on approval (D-APP-EXT-2),
   trace each attempt (D-PTC-5), and dispatch through the single MCP
   chokepoint (D-SBX-3).

`runTestWithBinding` does none of these because **none apply**. The
service exists to validate that:

- The provider/model binding resolves end-to-end (Phase 16
  `resolveForRun`).
- Phase 21 provider-use governance gates pass.
- Model Access executes via the platform gateway with the no-secret
  reference projection (Phase 16's contract).
- Optionally, the runtime system-prompt builder can still produce an
  output for the test (RAC P6, best-effort, errors swallowed).

It is **not a "smaller chat path."** It is a smoke test for the
binding plumbing.

---

## 5. Trip wire (load-bearing)

If any of the following ever change:

- `RunTestWithBindingInput` gains a `tools` field, OR
- the tRPC `testRunWithBinding` input schema gains a `tools` key, OR
- `executeInput` in `runTestWithBinding` is extended with `tools`, OR
- `RunTestWithBindingSuccess` is extended with a `tool_calls` field

…then the ProposedToolCall validator (D-PTC-2/3) MUST be wired on the
same change, alongside:

- the approval gate (D-APP-EXT-2/3/4/5),
- the tool-call trace writer (D-PTC-5),
- the dispatcher's pre-flight pipeline as `chat.ts` and `chat-stream.ts`
  already use.

This lane's parity claim with the chat paths is **conditional on the
tools-less shape**. Adding tools without the validator chain would
create exactly the bypass surface the audit was worried about, so the
trip wire pre-commits the implementer to a coupled change.

---

## 6. What does NOT change

- The chat paths (`chat-stream.ts`, `chat.ts`) keep their full
  ProposedToolCall + approval + trace wiring.
- The dispatcher (`services/mcp/dispatcher.ts`) remains the single
  MCP chokepoint.
- `runTestWithBinding`'s best-effort RAC orchestrator call (the
  `try { buildRuntimeSystemPrompt(...) } catch {}` block at
  `test-run-binding.ts:166-196`) stays as-is. RAC's job there is to
  produce a system prompt; failure should not block the binding test.

---

## 7. Audit closure

G2 from the 2026-05-08 RAC audit is closed by this ADR. No code change
required; the lane's existing shape is correct and load-bearing.

Future audits that flag this path again should consult this document
and the trip wire in §5 before recommending instrumentation.
