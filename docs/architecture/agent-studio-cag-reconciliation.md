# Agent Studio CAG Reconciliation — ADR

**Owner:** Agent Studio module
**Phase:** 1 (Retrofit ADRs)
**Status:** Adopted — drives Phase 5
**Authority:** Reconciliation contract between the existing CAG Capability Pack system and the retrofit's Cache-Augmented Generation requirements.

---

## 1. Problem statement

The retrofit prompt uses "CAG" to mean *Cache-Augmented Generation* — a pre-computed, hashed, governance-validated context block that is loaded into the prompt without per-request retrieval. The existing repo uses "CAG" to mean *Capability-Augmented Generation* — the capability pack (`agsCagCapabilityPacks`) that summarizes an agent's tools, skills, and sources for the system prompt (RAC P1A–P1E).

The two senses are compatible — both describe a stable, pre-computed prompt block that doesn't change per request. But the retrofit asks for additional metadata (compile hash, content hash, token-budget snapshot, compile result, governance validation result, runtime trace event) that the existing capability-pack table doesn't yet carry.

This ADR locks the reconciliation: **one CAG system, the existing capability pack, with the missing metadata added in Phase 5**.

---

## 2. Decisions

### D-CAG-RECON-1 — Naming: "CAG Capability Pack" stays; the C is overloaded

The existing tables (`agsCagCapabilityPacks`, `agsCagPackEvents`) and the existing service path (`server/agent-studio/services/cag/`) are NOT renamed. The "C" formally means "Capability" in the table name, "Cache" in the retrofit prompt's framing. Both are consistent with the runtime behaviour:

- Built once per draft revision.
- Hash-keyed for cache reuse across runs.
- Loaded into the prompt verbatim per the composer's D-PRM-1 6-section order.
- Invalidated when a tool, skill, or source manifest hash changes.

Renaming would be churn for no semantic gain. The ADR locks the dual reading.

### D-CAG-RECON-2 — Add compile + governance metadata to the existing pack row

Phase 5 extends `agsCagCapabilityPacks` with:

```ts
// Compile metadata
compiledHash: string;             // SHA-256 of the rendered prompt section text
contentHash: string;              // SHA-256 of contentJson (input to the renderer)
tokenBudgetEstimate: number;      // tokens the renderer projected
tokenBudgetActual: number | null; // tokens the runtime observed (post-render)

// Compile result
compileResult: "ok" | "warn" | "error";
compileWarnings: string[];        // collected during build/validate/render

// Governance
governanceVerdict: "cleared" | "warn" | "blocked";
governanceBlockers: string[];     // rule ids when blocked or warn

// Runtime trace
lastUsedAt: string | null;        // touched on every chat-stream that loads the pack
useCount: number;                 // monotonic
```

These fields are added to the existing row, not a sibling table. The existing `pack_version` + `content_json` + `created_at` continue unchanged. New fields default safely (NULL / 0) so existing packs don't need backfill.

### D-CAG-RECON-3 — `contentHash` keys cache reuse

When the builder produces a new pack with a `contentJson` whose SHA-256 matches the latest active pack's `contentHash`, the resolver reuses the existing pack — no new row, no new compile. Only `lastUsedAt` updates. This is the cache-augmented behaviour.

When `contentHash` changes, a new pack is built; the old pack is left in place (read-only history). The resolver always picks the highest-version active pack.

### D-CAG-RECON-4 — `compiledHash` is the prompt-text fingerprint

After the renderer produces the section text, the resolver computes `compiledHash = SHA-256(text)`. Two reasons:

1. **Composer cache key**: the prompt composer (D-PRM-1) hashes its full output for trace integrity; the pack's `compiledHash` flows into the composer's hash, so a downstream consumer can verify the pack didn't change post-compose.
2. **Trace linkage**: Phase 10's runtime trace records `compiledHash` so reviewers can prove which pack version was actually rendered into the prompt — even if the row was updated later.

### D-CAG-RECON-5 — Governance is computed at compile time, not runtime

The validator (`services/cag/validator.ts`) already runs build-time checks (no input-schema JSON, no example invocations, riskClass present, etc. — D-TOOL-3, D-PRM-4). Phase 5 widens the verdict surface to `cleared | warn | blocked`:

- `blocked` → resolver refuses to load the pack; the composer falls back to the legacy concat (mode=`safe_degraded`) or returns `cag_required` (mode=`strict`).
- `warn` → resolver loads the pack; trace records the warning.
- `cleared` → silent normal path.

Governance computed at compile time means: a pack with `governanceVerdict="blocked"` cannot enter the prompt. Runtime fallback paths see `verdict="blocked"` as a hard signal, not a per-request toggle.

### D-CAG-RECON-6 — Runtime trace event lands in `agsCagPackEvents` (existing)

Phase 5 extends `agsCagPackEvents` with event types `pack.loaded`, `pack.cache_hit`, `pack.cache_miss`, `pack.governance_blocked`. Each event row references the pack id, the runtime trace id (Phase 10), and the message id. This ties pack lifecycle into the runtime trace ledger.

The existing event types (`pack.built`, `pack.validated`, `pack.published`) stay; the additions are pure extensions.

### D-CAG-RECON-7 — CAG remains separate from KB / RAG / Memory

The existing boundary holds: CAG never stores raw corpora (D-PRM-2), never replaces Memory (D-PRM-7), never replaces RAG (D-PRM-3 retrieval-evidence section is a sibling, not a CAG block), and never overrides MCP schemas (D-TOOL-3). Phase 5's metadata additions do not change these boundaries.

---

## 3. Consequences

- **No parallel CAG system.** Phase 5 extends the existing tables and services; the retrofit's `Cache-Augmented` framing falls out of the existing capability-pack lifecycle.
- **Existing tests still pass.** The new metadata fields default safely; existing pack rows + tests continue unchanged.
- **Trace linkage is honest.** `compiledHash` flows into the prompt composer's hash + the runtime trace; reviewers can verify which pack actually rendered.
- **Governance is hard, not advisory.** `governanceVerdict="blocked"` keeps a pack out of the prompt. Phase 9's approval gate is the runtime equivalent for tool calls; the CAG governance gate is the build-time equivalent for prompt content.

---

## 4. Acceptance

- [x] One CAG system: existing capability pack, extended.
- [x] Compile + governance metadata fields locked (D-CAG-RECON-2).
- [x] `contentHash` keys cache reuse (D-CAG-RECON-3).
- [x] `compiledHash` is the prompt-text fingerprint (D-CAG-RECON-4).
- [x] Governance computed at compile time (D-CAG-RECON-5).
- [x] Runtime events extend the existing `agsCagPackEvents` (D-CAG-RECON-6).
- [x] Boundary with KB/RAG/Memory preserved (D-CAG-RECON-7).
- [ ] Schema delta lands in Phase 2.
- [ ] Resolver/builder/validator wired in Phase 5.
- [ ] Trace events emitted at chat-stream end-of-stream in Phase 10.
