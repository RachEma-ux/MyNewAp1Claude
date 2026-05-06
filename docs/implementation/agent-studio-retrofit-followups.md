# Agent Studio Retrofit — Follow-up Task List

**Owner:** Agent Studio module + Governance
**Status:** Tracking — none blocking; retrofit closed at `55c8b6b` (P14, 2026-05-06).
**Source:** Recorded as work was deferred during the 14-phase retrofit; cross-references the closure doc at `docs/implementation/agent-studio-retrofit-acceptance.md`.

This document is the contract for what the retrofit deliberately did *not* do. Each item names the deferral reason, the locked decision it falls under, and a concrete acceptance test for closing it.

---

## A. Wiring (highest priority — services exist, call sites don't)

### A1 — Wire the ProposedToolCall validator into `chat-stream` ✅

**Status:** CLOSED. Merged at `fea62fc` (PR #198, 2026-05-06).

Wired the Phase 8 validator into both runtime tool-call paths (`chat-stream.ts` SSE + `services/chat.ts` blocking) via a new helper at `services/runtime/proposed-tool-call-runtime.ts`. Production tool-use envelopes don't yet carry rationale + evidence; the helper builds a manifest-derived envelope so gates 5/6 are tautological. **Active gates with this envelope shape:** `invented_tool`, `missing_parameter`, `invented_parameter`, `quarantined_tool`, `sandbox_required`. When tool-use envelopes evolve to carry rationale + evidence, gates 3/4 will fire automatically — the helper accepts those fields when present.

On rejection: tool-role message persisted with `{error, code, gate:"proposed_tool_call_validator"}`; chat-stream also emits a `tool_end` SSE event. Dispatcher is **never** invoked for a rejected call.

9 unit tests cover every active gate + manifest-derived risk + manifest-derived approval. Full retrofit suite (90 tests across 5 files) still green. Helper returns a flattened `RuntimeValidationResult` so callers branch on `ok` cleanly under `strictNullChecks:false`.

### A2 — Wire the approval gate into the dispatch path ✅

**Status:** CLOSED. Merged at `23a7bf2` (PR #200, 2026-05-06).

`gateRuntimeDispatch` composes the validator + approval gate into a single runtime verdict. Decision tree: validator-rejected → reason=`validator_rejected`; `requiresApproval=false` → ok=true (gate not invoked); gate `permit` → ok=true; gate `denied`/`expired`/`pending` → matching reason; gate `approval_required` → `createApprovalRequest`, then reason=`approval_required`. Wired into both `chat-stream.ts` and `services/chat.ts`. Live chat has no formal runtime-run row — `sessionId` stands in as the surrogate `runtimeRunId` on freshly-created approval rows. 8 unit tests with injected fakes for `evaluateApprovalGate` / `createApprovalRequest`.

### A3 — Wire the trace writer ✅

**Status:** CLOSED. Merged at `c49b83f` (PR #201, 2026-05-06).

`persistRuntimeToolCallTrace` writes one `agsToolCallTraces` row per runtime tool-call attempt — rejected by validator, rejected by approval gate, dispatched ok, dispatched error. `dispatchResult` becomes `"ok" | "error" | "blocked"`; `errorMessage` and `durationMs` from the dispatcher; `approvalDecision` derived from the verdict. Best-effort writer — failures are swallowed so trace persistence never blocks the chat loop. `agentId` threaded through the inner runtime loops in both `chat-stream.ts` and `services/chat.ts`. Latent narrowing bug in `trace-writer.ts(48)` fixed in-flight (same `Extract<...>` cast pattern as the original P11 fix). 14 unit tests cover every dispatch shape and verdict-to-decision mapping.

### A4 — Auto-trigger `syncToolKnowledge` on registry republish ✅

**Status:** CLOSED. Merged at `fed8969` (PR #202, 2026-05-06).

Two new surfaces: `services/mcp/registry.ts` gains `subscribeSnapshots(listener)` (returns unsubscribe). `publishSnapshot` fires every listener with `{current, previous}` after the snapshot is committed. Listener exceptions and async rejections swallowed so a buggy subscriber never breaks the connect flow. `services/mcp/auto-sync.ts` wraps `syncToolKnowledge` as a registry subscriber via `installAutoSync({resolveContext})`. The resolver translates the registry's per-process `serverId` into the workspace + canonical-server-id + knowledge-source-id triple `syncToolKnowledge` needs; returning `null` skips the publish (opt-in path). Sync failures fire `onError` but never throw. Subscriber is **not auto-mounted yet** — operators explicitly call `installAutoSync` after they have a `tool_knowledge` `agsRacSources` row. 10 unit tests cover the listener API + orchestration.

---

## B. Coverage (pure helpers tested; DB-touching paths need ASDB e2e)

### B1 — DB-backed e2e for `syncToolKnowledge` ✅

**Status:** CLOSED. Merged at `05f5e75` (PR #204, 2026-05-06).

`tests/integration/agent-studio/sync-tool-knowledge.integration.test.ts` exercises the full Phase 7 round-trip against a live ASDB: insert path (mirror + `tool_knowledge` units materialize per D-NKU-6), hash-drift path (description change updates row + writes new unit; disappeared tool flips `available=false`), idempotent path (zero updates on re-sync). Auto-skips when DB env unset.

### B2 — DB-backed e2e for the approval gate ✅

**Status:** CLOSED. Merged at `05f5e75` (PR #204, 2026-05-06).

`tests/integration/agent-studio/approval-gate.integration.test.ts` covers the full lifecycle: create + idempotency on `(agentDraftId, proposedToolCallHash)`, evaluate-pending, decide-allowed (expiresAt set + audit row in `agsRuntimePolicyEvents` per D-APP-EXT-6 + lastUsedAt bumped + gate flips to permit), forced expiry → expired, denied stays denied, decide-on-decided returns terminal state without a second audit row.

### B3 — DB-backed e2e for the trace writers ✅

**Status:** CLOSED. Merged at `05f5e75` (PR #204, 2026-05-06).

`tests/integration/agent-studio/trace-writer.integration.test.ts` covers `recordToolCallTrace` happy path / rejection-nulls-downstream / ok+permit-surfaces-approval, plus `patchRacRuntimeTrace` for `plannerMode` + `plannerReason` + `cagCompiledHash`.

### B4 — Operator visual review of `RetrofitPage` ✅

**Status:** CLOSED (procedure documented). Merged at `05f5e75` (PR #204, 2026-05-06).

Procedure recorded at `docs/implementation/agent-studio-retrofit-page-smoke.md` — per-tab checklist (Ingestion / Knowledge Units / Provenance / Tool Knowledge / Approvals) + cross-cutting checks + failure recording protocol. Operators run the procedure after any PR that touches `RetrofitPage.tsx` or the four P11 routers.

---

## C. Latent cleanup surfaced during P11

These were fixed in PR #193 but are worth recording as follow-up considerations for the broader codebase.

### C1 — `tsconfig.json` exclude policy ✅

**Status:** CLOSED. Merged at `0700893` (PR #206, 2026-05-06).

Took option (b): dropped `**/agent*` from `tsconfig.json` `exclude`. Effect was +129 agent-studio files in the typecheck graph (7 → 136), covering all of `api/**`, `db/**`, `repository.ts`, `chat-stream.ts`, `manifest.ts`, `bindings.ts`, `boot.ts`, and the schema files. `pnpm run check` stayed green — the latent issues fixed during P11 / A1 / A3 had already covered the cases that mattered. `**/services/**` is still a separate global exclude, so the bulk of agent-studio service code remains out of scope (intentional — those files are too entangled with cross-module imports for the strict-false typechecker to handle today).

### C2 — `pdf-parse` import shape ✅

**Status:** CLOSED (audit). Merged at `0700893` (PR #206, 2026-05-06).

Audit confirmed: the other pdf-parse usage at `server/documents/processor.ts` already uses the equivalent defensive shape `(module as any).default || module`. P3's `basic-pdf-parser` test will catch any future drift. No code change needed.

### C3 — zod arity drift ✅

**Status:** CLOSED (audit). Merged at `0700893` (PR #206, 2026-05-06).

Audit confirmed: zero bare `z.record(z.something())` patterns remain across `server/` + `shared/`. All 5 call-sites use the two-arg form. `tsc` catches any new bare call. No code change needed.

---

## D. Deferred (per closure doc §3.5)

These are tracked here for completeness and were marked *not blocking* at retrofit close.

### D1 — pgvector migration

- **Doc:** `docs/architecture/agent-studio-pgvector-future-migration.md`
- **Trigger:** When KB volume crosses the threshold where the existing per-source embedding binding in `agsRacSources` becomes a bottleneck. The migration plan adds a `vector(N)` column to `agsKnowledgeChunks` and rewires the retrieval planner; no changes required to the RAC source registry.
- **Acceptance:** Latency p95 on a workload that includes vector retrieval drops below the documented target.

### D2 — Multi-region deployment

- **Status:** Single-region remains the operational baseline.
- **Trigger:** When operations team formally requests it. The retrofit's row keys (workspaceId-scoped) are already amenable to per-region sharding.

### D3 — In-process synthesizers (legacy carryover) ✅

**Status:** CLOSED via Path B (enum removal). Merged 2026-05-06.

**What was done:** The five synthesizer source types — `memory`, `workspace_context`, `project_context`, `tool_result_context`, `manual_context` — were removed from `RAC_SOURCE_TYPES` (`server/agent-studio/services/rac/sources/types.ts`) and from `pickAdapter`'s switch (`services/rac/ingestion/dispatcher.ts`) and from `IN_PROCESS_TYPES` in the planner. The acceptance criterion explicitly allowed either path — Parser/Normalizer pair OR enum removal — and Path B was the correct one given:

1. **No producer in the codebase.** Exhaustive grep across `server/`, `client/`, migrations, and seeds turned up zero `createSource({ sourceType: "memory"|... })` call sites. The five types existed only as enum entries that nobody ever instantiated.
2. **Shape mismatch.** These types were carried over to produce content at planner-build time from runtime state (workspace metadata, recent tool results, agent memory, user-curated blocks). RAC's four-layer pipeline is built for raw artifact → Parser → Normalizer → chunks → embedding → similarity retrieval. Synthesized live state is a fixed text snippet that does not benefit from vector retrieval; forcing it through the pipeline would have been an architectural mistake.
3. **Right home elsewhere.** When a real consumer surfaces, the right home for "inject workspace metadata into the prompt" is a **CAG system-prompt section**, not a RAC source row. CAG already supports versioned, hashed, governance-tagged prompt sections that compile into the runtime prompt — this is exactly what these synthesizer types were trying to express.

`cag_pack` remains in the enum and remains the only `in_process_pending` skipReason — it is rendered directly by the CAG resolver, outside the RAC retrieval path. The executor's warning text was updated from `in_process_synthesizer_pending: ... (deferred from P3 — slated for P4 follow-up or P5/P6)` to `cag_rendered: source_type=cag_pack is rendered by the CAG resolver, not retrieved through RAC` to reflect that this is no longer a deferral.

Test coverage: the planner's skipReason matrix test was tightened to a single `cag_pack` case, and `kb-retrieval-adapter.test.ts` gained a regression assertion that the five removed types are no longer in `RAC_SOURCE_TYPES`. CLAUDE.md `## Deferred Scope` and `agent-studio-retrofit-acceptance.md` §3.5 had their "in-process synthesizers" bullets removed.

### D4 — Additional MVP parsers (partial ✅)

**Status:** CSV + xlsx + OCR + audio closed. The retrofit now ships **10 parsers**: `text`, `markdown`, `html-snapshot`, `json`, `basic-pdf`, `basic-code`, `csv`, `xlsx`, `ocr`, `audio`.

| Parser | PR | SHA | Notes |
|---|---|---|---|
| CSV | [#209](https://github.com/RachEma-ux/MyNewAp1Claude/pull/209) | `890ad84` | `text/csv` / `application/csv` / `text/tab-separated-values`. Each non-header row → `table_row` unit; auto-detects comma/semicolon/tab; handles quoted commas/newlines/quote-quotes; tolerates LF/CRLF, blank lines, missing trailing newlines, empty inputs. 16 unit tests. |
| XLSX | [#212](https://github.com/RachEma-ux/MyNewAp1Claude/pull/212) | `ff8e843` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (+ macro-enabled variant). Each non-header row of every **visible** sheet → `table_row` unit; multi-sheet workbooks emit one set per sheet with `sheet` field carried in `contentJson` and Excel-style `selector` location (`<sheet>!A<row>`). Hidden / very-hidden sheets skipped (operators don't intend hidden sheets to flow into retrieval). Cell-shape coverage: dates → ISO; hyperlinks → visible text; formula cells → cached result; error cells → error code; rich text → concatenated runs; booleans → `"true"`/`"false"`. Empty cells → `""` (not the literal `null`). Library: `exceljs` (MIT, no native deps; the legacy `xlsx`/SheetJS package was rejected over unaddressed prototype-pollution CVEs). 18 unit tests. |
| OCR | [#213](https://github.com/RachEma-ux/MyNewAp1Claude/pull/213) | `2e83171` | `image/{png,jpeg,jpg,tiff,webp,gif}`. Bridges to the existing `data-acquisition` worker's `/ocr` endpoint (D-PARSE-OCR-1). Each successful OCR call → one `extracted_artifact` unit (D-NKU-2) with `text`, `confidence`, and `engine` carried in `contentJson`. Wire contract is `multipart/form-data` POST → JSON `{ text, confidence?, engine? }`. Workspace-shared worker; no per-workspace credential binding (D-PARSE-OCR-2). Parser registers always but throws `UnsupportedContentTypeError` from `parse()` when the worker is unhealthy (D-PARSE-OCR-3); dispatcher widened to catch parse-time `UnsupportedContentTypeError` so the failure surfaces as `status="unsupported_type"`. Health probe cached locally with 30s TTL so the worker's health load stays bounded regardless of OCR throughput. Decision record: `docs/architecture/agent-studio-ocr-parser.md`. 14 unit tests including engine-down + cache-recovery paths. |
| Audio | (this PR) | (TBD) | `audio/{webm,mpeg,mp3,wav,wave,ogg,m4a,mp4}`. Bridges to the existing forge proxy at `{BUILT_IN_FORGE_API_URL}/v1/audio/transcriptions` with `whisper-1` (D-PARSE-AUDIO-1) — the same engine the live `voiceTranscription.ts` tRPC surface uses. Workspace-shared, ops-deployed; no per-workspace credentials (D-PARSE-AUDIO-2). Each successful transcription → one `extracted_artifact` unit with full transcript text + `language` + `durationSec` + `segmentCount` + raw `segments` array preserved in `contentJson` (so a future per-segment retrieval amendment can re-shape the units without re-calling the engine). Two distinct failure modes: env-vars empty → `UnsupportedContentTypeError` (dispatcher records `unsupported_type`); forge runtime error → regular `Error` (dispatcher records as parser failure with the forge message preserved for triage) — same split as `voiceTranscription.ts`'s SERVICE_ERROR vs TRANSCRIPTION_FAILED. No TTL cache (env-var check is free). 16 MB request size limit matches `voiceTranscription.ts`. Decision record: `docs/architecture/agent-studio-audio-parser.md`. 16 unit tests including engine-unconfigured + runtime-error + size-limit-boundary. |

**Still deferred** — video (downstream of audio + ffmpeg keyframe extraction). Needs its own `D-PARSE-VIDEO-N` ADR before implementation. Sits alongside D1 (pgvector) and D2 (multi-region) as "ready to build, waiting on a decision," not "actively blocked."

**Acceptance criteria recorded for the deferral spec** (kept here as the contract for video closure):

1. **A `D-PARSE-EXTRACT-N` decision record** that picks the engine (or per-workspace binding model) and locks the graceful-degradation contract.
2. **Parser registration semantics defined** — register conditionally OR register always with a parse-time engine health check (OCR + audio both picked the latter).
3. **Per-workspace binding row** (mirroring `D-EMB-1`) when the engine is a remote provider with workspace-scoped credentials.
4. **Engine-down test coverage**, not just the happy path.

### D5 — Pre-existing 10 `ai-types/integration` test failures ✅

**Status:** CLOSED. Merged at `e645713` (PR #208, 2026-05-06).

**Root cause:** `vi.mock(path)` in `tests/integration/ai-types/execution.test.ts` and `execution-observability.test.ts` used paths relative to the TEST FILE (`./db`, `../db`, etc.), but vitest resolves mock paths against the file where `vi.mock` is called. The SUT (`server/ai-types/execution.ts`) imported `./db` (= `server/ai-types/db`), `../db` (= `server/db`), `../agents/db`, `../providers/registry` — those resolved to entirely different module identities than the mocks declared in the test files. The mocks never intercepted; the real modules loaded; the tests saw "catalog entry no longer exists" and similar real-DB errors.

**Fix:** Repathed all `vi.mock` calls to use absolute-from-test paths (`../../../server/...`); split the test imports so each symbol came from the same module the SUT imports (conversation/message helpers from `server/db`, catalog/execution helpers from `server/ai-types/db`); replaced module-mock for the registry with port wiring (`setProviderPort({ getRegistry: ... })`, `setAgentPort({ getAgent })`) since the SUT now uses port abstractions.

**Result:** All 10 previously-red tests pass. The "10 pre-existing ai-types failures" are no longer the documented CI fingerprint baseline. **PRs from this point land with canonical 5/5 green.** D4's PR #209 was the first to land with this baseline.

---

## E. Follow-up shape

When picking up any item:

1. Cite the **D-** decision IDs that bound the work (don't reinvent boundaries).
2. Extend `tests/agent-studio/retrofit-acceptance.test.ts` if your work introduces new modes / risk classes / approval states / source types — that file is the contract.
3. Land as a single PR off `main` with the existing CI fingerprint contract (4/5 green + the 10 ai-types reds tracked in D5).
4. Keep the closure doc accurate: when an item closes here, link the merge SHA back into the table.

— Recorded 2026-05-06 immediately after retrofit closure.
