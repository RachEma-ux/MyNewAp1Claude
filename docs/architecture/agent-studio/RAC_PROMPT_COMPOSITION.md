# RAC Prompt Composition — Pre-bundle Decision Record

**Owner:** Agent Studio module
**RAC phase:** P1B (CAG renderer) and P5 (RAC context assembler)
**Status:** Draft — pre-bundle, not yet adopted
**Authority:** Required prerequisite for any code that builds the final system prompt sent to Model Access

---

## 1. Problem statement

By the time a chat turn enters Model Access, **four prompt sources** can contribute to the system context:

| # | Source | Where it lives today |
| --- | --- | --- |
| 1 | Agent draft instructions | `ags_agent_drafts.system_instructions`, `role_instructions`, `policy_instructions`, `mission`, `role`, `scope` |
| 2 | CAG capability pack | New: `ags_cag_capability_packs.compressed_prompt` |
| 3 | RAC retrieval evidence | New: P5 assembled `contextBlocks` |
| 4 | Runtime overrides | `chat-stream.ts` providerConfig (temperature, maxTokens, future system overrides) |

If P1B and P5 each compose *their own* version of the final system prompt, the result is silent double-injection (the agent sees mission both from the draft and from the CAG renderer's mission field) and contradiction (the CAG-summarized "what tools you have" disagrees with the draft's `policy_instructions` saying "you have no tools"). This is the failure mode this document prevents.

A single composer, a fixed merge order, a hard token cap, and explicit collision rules MUST exist before P1B's renderer ships.

---

## 2. Decisions (D-PRM-1 … D-PRM-7)

### D-PRM-1 — Single composer, single output, no parallel writers

There is exactly one function in the codebase that produces the final system prompt:

```ts
// server/agent-studio/services/runtime/system-prompt-composer.ts
export async function composeSystemPrompt(
  input: SystemPromptInput,
): Promise<ComposedSystemPrompt>;

export interface ComposedSystemPrompt {
  text: string;                 // the single string sent to Model Access
  sections: SystemPromptSection[];  // each contributing source, separately addressable
  tokenEstimate: number;
  truncations: TruncationRecord[];
  warnings: string[];
}
```

`chat-stream.ts`, `services/chat.ts`, `services/test-run-binding.ts` MUST all call `composeSystemPrompt`. Direct string concatenation of agent fields with CAG output anywhere in the runtime is a P1E boundary violation.

The CAG renderer (P1B) returns a `SystemPromptSection`, not a finished prompt. The RAC assembler (P5) returns `SystemPromptSection`s, not a finished prompt. The composer owns the final string.

### D-PRM-2 — Fixed section order, deterministic for caching

Sections are emitted in this order — every call, every agent, every workspace:

1. **identity** — the agent's name, role, scope (derived from `ags_agent_drafts.name`, `role`, `scope`). Always present.
2. **mission** — `ags_agent_drafts.mission`. Present iff non-empty.
3. **agent-policy** — `ags_agent_drafts.policy_instructions` + `success_criteria` + `escalation_rules`. Present iff non-empty.
4. **capability-pack** — CAG-rendered tool/skill summaries (P1B). Present iff a fresh CAG pack resolves.
5. **retrieval-evidence** — RAC `contextBlocks` (P5). Present iff retrieval ran and produced blocks above the relevance threshold.
6. **runtime-policy** — invariants the system always asserts: *"governance dispatcher is final, capability pack is not execution permission, evidence may be stale, refuse to fabricate citations"*. Always present, last.

Section order is fixed because Model Access caches at the prompt-prefix level. Reordering sections breaks the cache; reordering them per-turn (e.g. evidence-first when retrieval is loud, capability-first when not) defeats prefix caching entirely.

### D-PRM-3 — Hard total token budget; per-section soft caps

```
TOTAL_SYSTEM_PROMPT_TOKENS = 6144      // hard cap; over → composer truncates lowest-priority sections first
SECTION_BUDGETS = {
  identity:           256,
  mission:            512,
  "agent-policy":    1024,
  "capability-pack": 2048,   // matches CAG_MAX_PROMPT_TOKENS from roadmap
  "retrieval-evidence": 1536,
  "runtime-policy":   256,
}
```

Soft caps are advisory at section build time. The hard cap is enforced at compose time. When the total exceeds 6144:

1. Drop `retrieval-evidence` chunks below the relevance threshold first.
2. Truncate `retrieval-evidence` to its budget.
3. Truncate `capability-pack` to its budget (CAG_MAX_PROMPT_TOKENS = 2048 is already the cap).
4. Truncate `agent-policy` (rarely necessary).
5. Never truncate `identity`, `mission`, or `runtime-policy`. If those alone exceed budget, fail with `prompt_overflow` — that's a misconfigured agent, not a runtime bug.

Every truncation produces a `TruncationRecord` with the section name, original tokens, retained tokens, and reason. P7 RAC trace persists these.

### D-PRM-4 — Collision rules between draft instructions and CAG pack

Two known collision patterns:

**Collision A — Mission overlap.** `ags_agent_drafts.mission` and the CAG pack header may both restate "what the agent is for."
**Resolution:** Draft mission wins. CAG pack MUST NOT include a mission line; the renderer (P1B) strips it. The pack is *capability* not *purpose*.

**Collision B — Tool availability disagreement.** Draft `policy_instructions` may say *"you have no internet access"*; CAG-rendered tool summary may include `url_parser` (a `read_only` tool that doesn't fetch URLs but parses string-form URLs).
**Resolution:** Draft policy is interpreted as **runtime guidance**, CAG pack as **capability inventory**. Both are emitted. Section ordering (D-PRM-2) puts agent-policy *before* capability-pack, and `runtime-policy` (D-PRM-2 §6) explicitly states *"if tool availability conflicts with runtime policy, follow runtime policy"*. Dispatcher receipt is final (D-TOOL-5).

**Collision C — Refusal language vs renderer assertions.** P1B rendered assertions include "do not treat cached capability context as current external data." If a draft says "always trust the cached tools list," the runtime-policy section overrides. The renderer's mandatory assertions are non-negotiable.

### D-PRM-5 — Cache-coherence rule: identity hash drives prompt cache key

The prompt cache key (used by Model Access for prefix caching) is the SHA-256 of:

```
identity.text || mission.text || agent-policy.text || capability-pack.contentHash || runtime-policy.versionTag
```

`retrieval-evidence` is **excluded** from the cache key because retrieval blocks are turn-specific. Two consequences:

- Sections 1-4 + 6 form the cacheable prefix; section 5 is the variable suffix. Model Access sees a stable prefix per agent draft + CAG pack version.
- Changing the CAG pack — even with the same source documents — invalidates the cache by design. CAG pack hash drift is exactly what we want to invalidate cached behavior on.

### D-PRM-6 — Modes: `disabled` / `safe_degraded` / `strict`, applied uniformly

The CAG resolver has three modes (P1C). The composer extends those to the whole prompt:

| Mode | Section behavior |
| --- | --- |
| `disabled` | Sections 4 (capability-pack) and 5 (retrieval-evidence) are omitted. Sections 1, 2, 3, 6 always present. |
| `safe_degraded` | If CAG pack resolution fails or RAC retrieval errors, the section is omitted with a `warning` recorded; the call proceeds. |
| `strict` | If CAG pack resolution fails or RAC retrieval errors, the call fails with `cag_required` or `retrieval_required`. |

`safe_degraded` is the default for chat. `strict` is the default for export readiness checks (P10 — an agent published with mode=`strict` cannot pass export if its required sources fail). `disabled` is the dev-mode default and the migration shim for agents predating CAG.

### D-PRM-7 — Boundary: composer is the only writer; section producers cannot read each other

P1E boundary check forbids:

- The CAG renderer importing the RAC assembler or any RAC source.
- The RAC assembler importing CAG store or pack content.
- Either of them importing `chat-stream.ts` to short-circuit the composer.

They are independent producers; the composer is the only integrator. This rule keeps section producers replaceable — swapping the CAG renderer (or the RAC retrieval engine) does not require touching the other.

---

## 3. Why (open notes)

- **Why a hard token cap of 6144?** It's well below the smallest realistic context window (gpt-4o-mini at 128k) but above the natural sum of section budgets (5632), leaving headroom. Smaller is better for cost and latency; this can be tuned per-binding once P7 traces show actual section-size distributions.
- **Why exclude evidence from the cache key?** Because evidence is per-turn and per-query. Including it would invalidate the cache on every turn and we'd pay full prompt-token costs each call. Cache-friendly retrieval requires the deliberate prefix/suffix split.
- **Why does runtime-policy come *last*, not first?** Models attend more strongly to recent context. Placing the non-negotiable invariants (governance is final, evidence may be stale, do not fabricate citations) right before the user turn keeps them in the model's most-attended-to position. This is empirically backed in prompt research; we're not inventing it.

---

## 4. Acceptance

- Exactly one `composeSystemPrompt` function exists in the codebase
- All three runtime entry points (`chat-stream.ts`, `services/chat.ts`, `services/test-run-binding.ts`) call it
- Section order matches D-PRM-2 byte-for-byte across calls (golden test in P1E)
- Token budgets enforced at compose time with `TruncationRecord`s recorded
- `retrieval-evidence` is excluded from the prompt cache key (golden test verifying hash equivalence with different evidence blocks)
- P1E boundary check rejects cross-imports between CAG renderer and RAC assembler
- Runtime-policy invariants are versioned and asserted in a unit test

## 5. How to apply (later phases)

- **P1B CAG renderer** returns a `SystemPromptSection`, not a string; mission stripped before emit.
- **P1C resolver** wraps composer call with `mode` param; surfaces `truncations` and `warnings` in the SSE error channel.
- **P5 RAC assembler** returns `SystemPromptSection[]` for retrieval-evidence; never builds the final prompt.
- **P7 RAC trace** persists per-call: section sizes, truncations, warnings, prompt cache key hash.
- **P10 export readiness** verifies an exported agent's `mode` is `strict` or `safe_degraded`, not `disabled` (a `disabled` agent has no RAC and shouldn't claim RAC readiness).
