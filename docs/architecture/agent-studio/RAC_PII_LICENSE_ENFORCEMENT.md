# ADR — RAC PII / License Policy Enforcement (U5-b)

**Owner:** Agent Studio module + Governance
**Status:** Plan freeze 2026-05-08 (sub-phase U5-b.0 — doc only). Implementation phases U5-b.1..4 land conditionally on this ADR's design holding.
**Authority:** Closes the implementation half of U5 from the 2026-05-08 RAC audit. Builds on U5-a (PR #304) which admitted the gap in the existing comments + JSDoc.

---

## 1. Context

`ags_rac_policies.{piiPolicy, licensePolicy}` accept `"warn" | "block" | "none"` and have been operator-configurable since Phase 4. Until now, **enforcement was not implemented**:

- `services/rac/retrieval-filter.ts:149-163` emits a trace warning when either policy is `"block"` but never rejects chunks.
- The P8 evaluation scorers do not detect PII or license signals.
- P10 readiness does not consume these columns.

Setting `piiPolicy = "block"` on a profile is currently a no-op aside from the warning string. U5-a admitted this in code; U5-b closes the gap.

This ADR is the design freeze. Implementation lands in 4 follow-up PRs (U5-b.1..4).

---

## 2. Goals

- **G1.** When `piiPolicy === "block"` on a profile, retrieval excludes chunks whose parent unit carries a PII finding.
- **G2.** When `licensePolicy === "block"` on a profile, retrieval excludes chunks whose parent unit carries a license matching the profile's blocklist.
- **G3.** Detection happens at **ingestion** time (per unit, persisted), not retrieval time. Retrieval-time cost stays O(filter pass).
- **G4.** Operators can audit which units carry PII findings or license tags, and override per-unit if a false-positive blocks legitimate content.
- **G5.** The MVP regex set is documented + extensible — operators can register additional rules without forking.

## 2a. Non-goals (this phase)

- ML-based PII detection. Regex MVP only; ML is a future iteration that fits the same `registerValidationRule()` shape.
- Name / address detection. False-positive rate is too high without context.
- License inference from content. License is **declared** (operator-set or extracted from explicit metadata), not inferred.
- Redaction. The action is "exclude from retrieval," not "rewrite contentText." Redaction would need separate D-NKU revisions.
- Per-chunk granularity for license. Units are the right grain.
- Provider-side PII gating. The existing `pii_safe` policy tag in `server/policies/provider-policy-engine.ts` is a different concern (which providers can be used) and stays untouched.

---

## 3. Design

### 3.1 PII detector — regex-based, registered as ingestion rule

**Decision (DD1):** Implement `server/agent-studio/services/ingestion/pii-detector.ts` exporting a `detectPii(text: string): PiiFinding[]` pure function. Register it as a custom `ValidationRule` via the existing `data-validation-service.ts` `registerValidationRule()` registry.

**Detector entities (MVP):**

| Entity | Pattern shape | Notes |
|---|---|---|
| `email` | `\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b` (case-insensitive) | RFC 5322 simplified |
| `phone_us_ca` | `\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b` | US/Canada NANP format |
| `ssn_us` | `\b\d{3}-\d{2}-\d{4}\b` | US SSN format only |
| `credit_card` | 13-19 digit number sequences with **Luhn check** | reduces false positives massively |
| `ipv4` | `\b(?:\d{1,3}\.){3}\d{1,3}\b` (with octet range validation) | flags both private + public — operators can disable via custom rule |
| `iban` | 2-letter country + 2 check digits + up to 30 alphanumeric | basic shape; no full mod-97 validation in MVP |
| `api_key_stripe` | `sk_(test|live)_[A-Za-z0-9]{24,}` | |
| `api_key_github_classic` | `ghp_[A-Za-z0-9]{36}` | |
| `api_key_github_fine_grained` | `github_pat_[A-Za-z0-9_]{82}` | |
| `api_key_aws_access` | `AKIA[A-Z0-9]{16}` | |
| `api_key_openai` | `sk-[A-Za-z0-9]{32,}` (no `proj-` prefix carve-out in MVP) | |

**Output shape:**

```ts
interface PiiFinding {
  entity: PiiEntity;       // string enum from above
  match: string;           // the matched substring (for audit; never returned to model)
  start: number;           // contentText offset
  end: number;
  severity: "warn" | "block";  // operator-tunable per entity in future iteration
}
```

The detector returns ALL findings; the policy decides what to do with them. MVP severity defaults are: `email`/`phone_us_ca`/`ipv4` → `"warn"`; `ssn_us`/`credit_card`/`iban`/`api_key_*` → `"block"`. Operators can override via custom rule.

**Registered rule shape (data-validation-service):**

```ts
registerValidationRule((input) => {
  const findings = detectPii(input.contentText);
  return findings.map(f => ({
    rule: `pii_${f.entity}`,
    severity: f.severity,
    message: `PII detected: ${f.entity}`,
    detail: { entity: f.entity, start: f.start, end: f.end },  // never include match in detail
  }));
});
```

The `match` value lives in detector output for unit-test asserts but is **never persisted** in the validation finding (D-NKU-3 says contentText is the canonical text; a PII match in the detail field would create a parallel raw store).

### 3.2 License signal — per-unit, operator-set or extracted

**Decision (DD2):** Add `license` column to `ags_knowledge_units`:

```sql
ALTER TABLE ags_knowledge_units
  ADD COLUMN license VARCHAR(64);  -- nullable; SPDX-or-free-form
```

Vocabulary: SPDX identifiers (`MIT`, `Apache-2.0`, `CC-BY-4.0`, `CC-BY-SA-4.0`, `GPL-3.0-or-later`, `proprietary`, `unknown`). Free-form text — no enum constraint — so operators can use site-specific labels.

**Population sources:**

1. **Ingestion-time extraction** (best-effort, parser-specific):
   - HTML parser: read `<link rel="license" href="...">` or `<meta name="license" content="...">`.
   - JSON parser: top-level `license` key.
   - Code parser: SPDX comment in first 20 lines (`SPDX-License-Identifier: MIT`).
   - Other parsers (text, markdown, pdf, csv, xlsx, ocr, audio, video): no extraction; leave NULL.
2. **Operator override** via new tRPC `agentStudio.kb.setLicense({unitId, license | null})` mutation (kb-router).

`license = NULL` means "unknown." When `licensePolicy === "block"`, NULL units are **kept** (the policy targets explicitly-blocklisted licenses; unknown stays neutral). Operators who want stricter behavior can blocklist `unknown` explicitly.

### 3.3 License blocklist — per-policy

**Decision (DD3):** Add `licenseBlocklist` column to `ags_rac_policies`:

```sql
ALTER TABLE ags_rac_policies
  ADD COLUMN license_blocklist JSONB;  -- nullable; string[] when set
```

When `licensePolicy === "block"` AND `license_blocklist` is non-empty AND a chunk's parent unit's `license` is in the blocklist → reject.

**Rationale:** A single global blocklist would force all profiles to share a license stance. Per-policy is the right grain (e.g., "internal docs profile blocks GPL; public docs profile blocks proprietary").

**Default:** NULL (no blocking). `licensePolicy === "block"` with empty blocklist is a no-op + warning, same shape as today (operator misconfiguration warning).

### 3.4 PII findings persistence

**Decision (DD4):** Persist findings on `ags_knowledge_units`:

```sql
ALTER TABLE ags_knowledge_units
  ADD COLUMN pii_findings JSONB;  -- nullable; PiiFinding[] (without `match`) when set
```

The validation pipeline already writes to `ags_data_validation_results` (D-UI-4); that table holds *all* findings including the PII ones the new rule emits. **Why duplicate them onto `ags_knowledge_units`?**

- Retrieval-time filter needs O(1) check on the unit row, not a JOIN to validation results.
- The validation table holds the audit trail; the unit row holds the projection used by the filter hot path.
- The trade is: small denormalization for filter performance vs. clean two-table model.

Open question for review: is the denormalization worth it, or should the filter accept the JOIN cost? **Default decision: denormalize**, because retrieval is the hot path and chunks are filtered N-at-a-time (N up to maxChunks=8 by default; small).

### 3.5 Chunk rejection point

**Decision (DD5):** Insert two filter steps in `services/rac/retrieval-filter.ts` between `citationRequired` and `minScore`:

```
1. citationRequired                            (existing)
2. piiPolicy === "block" → drop chunks whose unit has a `block`-severity PII finding   (NEW)
3. licensePolicy === "block" → drop chunks whose unit's license is in policy.licenseBlocklist   (NEW)
4. minScore                                    (existing)
5. freshnessMaxAgeDays                         (existing)
6. dedupeBy                                    (existing)
7. sort                                        (existing)
8. maxChunks                                   (existing)
```

**Why early:** Cheaper than computing dedupe hashes on chunks we'll discard. Same shape as `citationRequired`.

**Why this exact order:** PII before license — PII is a higher-stakes signal (data leak) than license (compliance). If a chunk fails both, the trace warning lists PII first.

### 3.6 Chunk metadata projection

**Decision (DD6):** Adapters (`knowledge-unit-adapter.ts`, etc.) project the unit's `pii_findings` and `license` into `RacRetrievalChunk.metadata`:

```ts
chunk.metadata = {
  ...chunk.metadata,
  unitPiiBlockSeverityCount: 0 | number,  // count of `block`-severity findings
  unitLicense: string | null,
};
```

Filter reads the metadata; doesn't query the unit table. Reuses existing chunk-metadata flow.

### 3.7 Trace + observability

**Decision (DD7):**

- Extend `FilterRejectionCounts` with `piiBlocked: number; licenseBlocked: number`.
- Emit one structured warning per rejected chunk: `pii_blocked: chunkId=X` / `license_blocked: chunkId=X license=Y`.
- Add `pii_blocked_count` + `license_blocked_count` columns to `ags_rac_runtime_traces` (parallel to `chunks_filtered`).
- **No `agsRuntimePolicyEvents` row per rejection.** Chunk filtering is high-frequency; one row per state transition makes sense for approval gates but not for retrieval filtering.

If finer-grained audit is later needed, a `agsRacChunkRejections` sibling table is the natural extension; not in this phase.

### 3.8 Operator surface

**Decision (DD8):**

- `agentStudio.racSources.policy.upsert` extended with `licenseBlocklist?: string[]`.
- `agentStudio.kb.setLicense({unitId, license | null})` mutation added to kb-router (governed; D-CAG-RECON-7 governance shape).
- `agentStudio.kb.clearPiiFindings({unitId})` mutation added to kb-router for false-positive overrides (governed).
- Read APIs (`agentStudio.kb.listUnits` / `getUnit`) extended to return `license` + `piiFindings` (already returning unit fields; just add the columns).

UI surface (RetrofitPage's "Knowledge Units" tab) gains license + PII columns and a "clear findings" action. Operators see exactly what's blocked and why.

---

## 4. Implementation phases

| Phase | Title | Branch | Estimated size |
|---|---|---|---|
| U5-b.0 | This ADR + plan freeze | (this PR) | ~350 LOC docs |
| U5-b.1 | Schema retrofit — `license` + `pii_findings` on `ags_knowledge_units`; `license_blocklist` on `ags_rac_policies` (Drizzle types + manual migration script) | `feat/u5b1-schema` | ~150 LOC |
| U5-b.2 | PII detector + license extraction at ingestion (regex set + 4 parser hooks + custom-rule wiring + unit tests) | `feat/u5b2-detector` | ~600 LOC |
| U5-b.3 | Retrieval-time enforcement (filter steps + chunk metadata projection + adapter changes + trace counts + retrofit-acceptance suite assertions) | `feat/u5b3-filter` | ~500 LOC |
| U5-b.4 | Operator UI surface (RetrofitPage extension + kb-router mutations) | `feat/u5b4-ui` | ~400 LOC |

Cumulative: ~2000 LOC. Each sub-phase is a single PR with its own CI green gate.

---

## 5. Stop conditions / pause-and-surface triggers

Per the §34 pattern from the PMB cleanup arc, the implementer halts and surfaces if any of these trigger during U5-b.1..4:

- **Detector design conflict.** A regex from §3.1 yields >5% false positive rate on a representative sample (e.g., the existing CAG validator test corpus). Pause; either tune the regex or remove the entity from MVP.
- **Schema migration conflict.** Adding `license` or `pii_findings` columns to `ags_knowledge_units` would require backfill of >1M rows on a production env. Pause; design backfill strategy explicitly.
- **License blocklist semantics conflict.** A profile's blocklist would block 100% of its target source's units (the operator-config equivalent of bricking retrieval). Pause; decide whether to refuse the upsert or warn.
- **Validation-table consistency conflict.** Denormalized `pii_findings` on the unit row drifts from `ags_data_validation_results`. Pause; pick canonical-source-of-truth.

The trip wires from U5-a still apply: future readers should see the U5-b sub-phases as the closure work.

---

## 6. Test plan

### Unit (added in each sub-phase)

- **U5-b.2:** `tests/agent-studio/pii-detector.test.ts` — 11 entities × happy-path + edge cases (Luhn negatives, IPv4 octet range, IBAN length).
- **U5-b.2:** `tests/agent-studio/license-extraction.test.ts` — HTML/JSON/code parser hooks each emit license when present, NULL otherwise.
- **U5-b.3:** Extend `tests/agent-studio/rac-retrieval.test.ts` with PII-blocked + license-blocked scenarios.

### Acceptance suite (pinned in retrofit-acceptance.test.ts)

Add an assertion block:

```ts
describe("RETROFIT U5-b — PII / license enforcement (post-2026-05-08)", () => {
  it("piiPolicy=block drops chunks with block-severity PII findings", ...);
  it("licensePolicy=block drops chunks whose license is in licenseBlocklist", ...);
  it("piiPolicy=warn keeps chunks but emits trace warning", ...);
  it("licensePolicy=block with empty blocklist is no-op + warning", ...);
});
```

Layer 6 already runs the acceptance suite as a CI gate.

### Integration (deferred or skipIf hasDb)

`tests/integration/agent-studio/u5b-policy-enforcement.integration.test.ts` exercising the full ingestion → unit flag → retrieval reject loop against live ASDB. Conditional on `DATABASE_URL_ASDB`.

---

## 7. What does NOT change

- The existing `services/policies/provider-policy-engine.ts` `pii_safe` provider tag stays untouched. That's a separate concern (provider-level routing).
- The existing `licensePolicy === "warn"` and `piiPolicy === "warn"` shapes still emit only the warning string. Block-mode is the new behavior; warn-mode is unchanged.
- `ags_data_validation_results` semantics unchanged. PII findings appear there alongside other validation findings; the new `pii_findings` column on `ags_knowledge_units` is a denormalized projection for filter performance.
- The retrofit MUST-NOT boundaries from the 2026-03 retrofit hold: no parallel CAG composer, no `vector(N)` columns, no bypass of MCP dispatcher.

---

## 8. Open questions for review (before U5-b.1 starts)

1. **§3.4 denormalization** — is the per-unit `pii_findings` JSONB column worth the dual-source maintenance? Alternative: filter does a JOIN to `ags_data_validation_results`. Default: denormalize.
2. **§3.2 license vocabulary** — free-form VARCHAR(64) vs. SPDX enum. Default: free-form to allow site labels.
3. **§3.1 detector severity defaults** — proposed mapping (email/phone/IP → warn, SSN/CC/IBAN/API-keys → block). Confirm or override.
4. **§3.6 chunk metadata size** — projecting `pii_findings` array into chunk metadata could bloat trace context blocks. Default: project only the **count** of block-severity findings + license string, not the full findings array.
5. **§3.8 governed-procedure choice** — `setLicense` and `clearPiiFindings` default to `governedProcedure`. Confirm or downgrade to `protectedProcedure` (workspace-scoped only).

If you have answers to any of these before U5-b.1 starts, the implementation phase will be tighter. Otherwise, the defaults stand.

---

## 9. Audit closure tracking

| Audit ID | This phase's role |
|---|---|
| U5 (audit) | Phase implements actual enforcement; U5-a (PR #304) admitted the gap. |
| U5-b.0 | This ADR. Plan freeze. |
| U5-b.1..4 | Implementation. Each sub-phase a single PR; cumulative closes U5 enforcement gap. |

After U5-b.4 merges, the closure summary at `/sdcard/Download/RAC_AUDIT_CLOSURE_2026-05-08.md` §4.1 should be updated to mark U5-b complete.
