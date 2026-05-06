# Agent Studio ProposedToolCall — ADR

**Owner:** Agent Studio module + Governance
**Phase:** 1 (Retrofit ADRs)
**Status:** Adopted — drives Phase 8
**Authority:** Locked contract for the structured tool-use envelope every model output must produce before the dispatcher will execute a tool.

---

## 1. Problem statement

Today the chat-stream path (`server/agent-studio/chat-stream.ts`) consumes `delta.tool_calls[*]` chunks from the model and forwards `(toolName, arguments)` to `dispatchMcpToolCall(input)` directly. There is no intermediate validation that:

- The tool name actually exists in the live MCP registry.
- The arguments match the tool's input schema (the dispatcher does this; but it's after governance + auth).
- The model's claimed evidence (chunks, knowledge units, CAG blocks) actually exists and was retrieved this turn.
- The model's claimed `riskLevel` matches the tool's manifest `riskClass`.

Without this validation, a model can:

- **Invent tools** that look plausible but don't exist.
- **Invent parameters** the schema doesn't accept (caught later, but with an opaque MCP error).
- **Fabricate evidence references** to pass governance superficially.
- **Lower its claimed risk level** to bypass approval.

This ADR locks a `ProposedToolCall` envelope that the model MUST produce, and a validator that runs BEFORE the dispatcher's existing pipeline.

---

## 2. Decisions

### D-PTC-1 — The contract

```ts
interface ProposedToolCall {
  // Identity
  mcpServerId: string;          // canonical server id from agsMcpServers
  toolName: string;             // tool name in the format the registry exports
  toolVersion?: string;         // optional; matches against schemaHash if both provided

  // Invocation
  arguments: Record<string, unknown>;

  // Justification
  rationale: string;            // model-supplied; trace surfaces verbatim

  // Evidence (P4 retrieval + P5/P3 KB + P5 CAG + P7 tool-knowledge)
  evidenceChunkIds: string[];           // chunk ids from this turn's retrieval
  knowledgeUnitIds?: number[];          // unit ids from this turn's retrieval
  toolKnowledgeIds?: number[];          // tool-knowledge unit ids from P7 mirror
  cagBlockIds?: string[];               // CAG section ids loaded this turn

  // Schema integrity
  schemaHash?: string;          // P7 mirror's tool schema hash; validator re-checks

  // Risk
  riskLevel: "low" | "medium" | "high" | "critical";
  requiresApproval: boolean;    // derived; model claim is verified
}
```

The model emits this envelope as a structured tool-use response. Phase 8's validator parses it before the dispatcher sees it.

### D-PTC-2 — Validation gates

The validator (`server/agent-studio/services/mcp/proposed-tool-call.ts`, Phase 8) runs BEFORE the dispatcher's existing connection/auth/governance pipeline. Eight gates:

1. **Tool existence** — `mcpServerId + toolName` resolves to a live registry row. Reject `invented_tool` otherwise.
2. **Argument schema** — `arguments` validates against the tool's input schema (live registry, not mirror). Reject `invented_parameter` on extra keys; reject `missing_parameter` on required-key absence.
3. **Evidence existence** — every `evidenceChunkIds[i]` exists in this turn's retrieval result; `knowledgeUnitIds` resolve to `agsKnowledgeUnits`; `toolKnowledgeIds` resolve to tool-knowledge units; `cagBlockIds` resolve to the live CAG pack section ids. Reject `fabricated_evidence` on any miss.
4. **Schema hash integrity** — if `schemaHash` provided, it matches the live registry's tool snapshot hash. Reject `schema_mismatch` if the live tool changed since the model planned the call.
5. **Risk level computed** — `riskLevel` is derived from `readRiskClass(tool)` + the D-APP-EXT-4 mapping table. Model-supplied value MUST match. Reject `risk_level_mismatch` if the model lowered the claim.
6. **Approval claim verified** — `requiresApproval` is derived from `riskLevel` + the policy table. Reject `approval_claim_mismatch` if the model claimed `false` for a tool that requires approval.
7. **Quarantined block** — if `riskClass="quarantined"`, reject hard with `quarantined_tool` (D-TOOL-1 default-deny).
8. **Sandbox prerequisite** — if `riskClass="code_execution"`, the validator checks `getToolSandbox().health().ok`. Reject `sandbox_required` if the sandbox is unhealthy or unbound (D-SBX-2).

The validator returns a structured result: `{ok: true, normalized: ValidatedToolCall} | {ok: false, code: ValidationCode, message: string}`. On `ok=false`, the dispatcher returns the error to the chat-stream; the model gets the rejection in-context and can either retry with valid evidence or surface the failure to the user.

### D-PTC-3 — The validator runs in-process; the dispatcher remains the chokepoint

The validator is a function call, not a separate service. It runs synchronously between the chat-stream's tool-call parser and `dispatchMcpToolCall`. The dispatcher's existing entry point is unchanged; the new gate is wrapped around it:

```ts
async function dispatchProposedToolCall(proposed: ProposedToolCall, retrievalCtx) {
  const v = await validateProposedToolCall(proposed, retrievalCtx);
  if (!v.ok) return { ok: false, error: { code: v.code, message: v.message } };

  // Existing dispatcher path; unchanged.
  return dispatchMcpToolCall({
    agentDraftId: retrievalCtx.agentDraftId,
    runtimeRunId: retrievalCtx.runtimeRunId,
    toolName: `mcp__${proposed.mcpServerId}__${proposed.toolName}`,
    args: proposed.arguments,
    source: retrievalCtx.source,
    caller: retrievalCtx.caller,
  });
}
```

The dispatcher's chokepoint is preserved. The validator is a pre-flight gate, not a replacement.

### D-PTC-4 — Canonicalization rule for `proposedToolCallHash`

Phase 9's approval gate uses `SHA-256(canonicalJson(proposed))` as the idempotency key. The canonical form:

- Keys sorted alphabetically at every depth.
- Whitespace stripped.
- Numbers in their canonical JSON form (no trailing zeros, no `.0`).
- Arrays in declared order (model order is significant; reordering changes the call).
- `rationale` IS included in the hash — a different rationale is a different proposal.

This means: same call + same evidence + same rationale → same hash → same approval row. Different rationale (model retried with a different justification) → different hash → new approval. This is intentional: a reviewer who approved one rationale didn't approve a different one.

### D-PTC-5 — Trace records ProposedToolCall verbatim

Phase 10's runtime trace stores the full `ProposedToolCall` payload and the validator's verdict. This means:

- A reviewer can read the original model output (trust signal).
- A debugger can see why a call was rejected (`fabricated_evidence` with the offending chunk id).
- An auditor can re-validate historically (re-run the validator against an old trace's evidence references).

Storage is `agsToolCallTraces` (Phase 2 schema, Phase 10 wiring), FK'd to the runtime trace.

### D-PTC-6 — The validator NEVER executes the tool

Like the approval gate, the validator is pre-dispatch. It reads from the registry, the retrieval result, the CAG pack, the sandbox health probe — none of those are tool calls. The validator's failure modes are all rejections; its success path delegates to the dispatcher.

---

## 3. Consequences

- **Invented tools/parameters fail loudly.** Phase 8's validator catches them before the dispatcher attempts a call that would fail with an opaque error.
- **Evidence fabrication is detectable.** Cross-referencing claimed evidence ids against this turn's retrieval result is cheap and deterministic.
- **Risk gaming is blocked.** The model cannot claim `requiresApproval=false` for a high-risk tool.
- **Approval idempotency is hash-keyed.** D-PTC-4's canonicalization gives Phase 9 a stable key.
- **Trace is rich.** Phase 10's trace stores the full envelope + verdict; reviewers can audit historically.
- **No bypass.** The validator runs in-process before the dispatcher; the dispatcher remains the chokepoint.

---

## 4. Acceptance

- [x] Contract shape locked (D-PTC-1).
- [x] Eight validation gates locked (D-PTC-2).
- [x] Validator wraps the dispatcher; dispatcher chokepoint preserved (D-PTC-3).
- [x] Canonicalization rule for hash locked (D-PTC-4).
- [x] Trace records full envelope + verdict (D-PTC-5).
- [x] Validator never executes (D-PTC-6).
- [ ] `proposed-tool-call.ts` validator implementation lands in Phase 8.
- [ ] `agsToolCallTraces` schema lands in Phase 2.
- [ ] Trace wiring lands in Phase 10.
- [ ] Phase 13 golden set covers invented-tool, invented-parameter, fabricated-evidence, risk-mismatch, approval-mismatch.
