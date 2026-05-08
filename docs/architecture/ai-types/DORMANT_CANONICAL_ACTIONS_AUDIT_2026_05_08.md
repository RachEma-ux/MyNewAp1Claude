# Dormant Canonical Actions Audit — 2026-05-08

**Phase:** 40.1 (proactive contract audit; companion to §39's reactive direct-caller decision tree).
**Scope:** Manifest-registered gateway actions in `server/ai-types/manifest.ts` + `server/agent-studio/boot.ts` with **zero production gateway-call sites** as of `main@0347384`.
**Audit method:** read each handler; identify inputs/side-effects/contract assumptions; tag surprise factor (`clean` / `has-questions` / `known-needs-validation`).

**Non-goal:** changing code. Per §38 lesson #3 + §40 plan §2, audit-only. Any contract change identified becomes its own future phase per the §36 ADR-at-plan-freeze convention.

---

## TL;DR

7 dormant actions audited. **All 7 land at `clean` surprise factor.** No publish-flip-to-published-style hidden auto-behavior found. The dormancy is product-roadmap dormancy (the surfaces are wired; the UI / tooling that calls them isn't built yet) rather than contract dormancy (handlers waiting on a contract decision).

| Action | Surprise factor | Recommendation |
|---|---|---|
| `agentStudio.run.execute` | clean | None — wakes up cleanly when first caller arrives |
| `agentStudio.providerBindings.validate` | clean | None |
| `agentStudio.providerBindings.resolveForRun` | clean | None |
| `agentStudio.workspaceDefaultBindings.upsert` | clean | None |
| `agentStudio.workspaceDefaultBindings.delete` | clean | None |
| `agentStudio.exportCatalog.markImported` | clean | None |
| `agentStudio.exportCatalog.reconcileImports` | clean | None |

The publish-flip-to-published bug from §35.1/§36 was an outlier. The agentStudio dormant surface is well-designed — handlers thin-wrap underlying business logic without baking opinionated side effects into the canonical action layer.

---

## Audit shape

For each dormant action:

- **Handler** — file:line of the `registerPublicApi` block.
- **Inputs** — typed shape the handler validates.
- **Side effects** — DB writes / events / audit rows.
- **Contract assumptions** — what the handler assumes about its inputs and the post-call state.
- **Surprise factor** — clean (no opinionated auto-behavior) / has-questions (a future caller might be confused) / known-needs-validation (the §36 publish-flip-to-published shape).
- **Recommendation** — defer / fold / no action.

---

## Per-action audit

### `agentStudio.run.execute`

**Handler:** `server/agent-studio/boot.ts:130-159`.

**Inputs:**
```ts
{
  agentId: number;        // required
  versionId?: number;
  environment?: string;   // defaults "production"
  inputPayload?: Record<string, unknown>;
  triggeredBy?: number;
}
```

**Side effects:** inserts a row into `ags_runtime_runs` via `repo.appendRuntimeRun`. Receipt required at the gateway layer.

**Contract assumptions:**
- New runs always start at `status: "queued"` (handler hardcodes).
- `triggerType: "gateway"` is hardcoded — distinguishes gateway-triggered from UI-triggered or scheduler-triggered runs.
- `inputPayload` defaults to `{}` if omitted.
- `environment` defaults to `"production"` — caller must explicitly opt into staging/dev.

**Surprise factor:** **clean.** Hardcoded `status` and `triggerType` are correct invariants for the canonical's name (`run.execute` from gateway means "create a queued run"). The `environment` default to `"production"` is the only mildly opinionated choice — a future caller that wants staging must remember to pass it. Worth a JSDoc note when a real caller arrives, not a contract change.

**Recommendation:** None. Handler wakes up cleanly when first caller arrives.

---

### `agentStudio.providerBindings.validate`

**Handler:** `server/agent-studio/boot.ts:237-253`.

**Inputs:**
```ts
{ draftId: number; role?: string }
```

**Side effects:** read-only — calls `validateBindingPolicy(draftId, role)` from `./bindings`. No DB writes, no events, no audit. Receipt NOT required (low risk).

**Contract assumptions:**
- Reference/policy validation only — no upstream HTTP probe (per descriptor).
- `role` is optional; when omitted, validates all roles bound to the draft.

**Surprise factor:** **clean.** Pure read; thin wrapper around module-internal logic. No state-change side effects to surprise a caller.

**Recommendation:** None.

---

### `agentStudio.providerBindings.resolveForRun`

**Handler:** `server/agent-studio/boot.ts:255-270`.

**Inputs:** `Parameters<typeof resolveForRun>[0]` — passes through to `./bindings`.

**Side effects:** read-only resolution; **returns refs only, no credentials** (per descriptor — operationally important).

**Contract assumptions:**
- Caller receives reference IDs (provider/model/credential IDs) but never the underlying credential material.
- "ForRun" suggests caller is about to dispatch a run; resolution may apply per-run policy filters.

**Surprise factor:** **clean.** The "no credentials returned" contract is documented at the descriptor and enforced by the underlying `resolveForRun` (verified separately in §29.4 work). Future callers should NOT need to handle credential material from this action — that's the design.

**Recommendation:** None.

---

### `agentStudio.workspaceDefaultBindings.upsert`

**Handler:** `server/agent-studio/boot.ts:296-315`.

**Inputs:** `Parameters<typeof upsertWorkspaceDefaultBinding>[0]`.

**Side effects:** writes/updates a workspace-default-binding row; calls Phase 8 eligibility gate (per descriptor); receipt required.

**Contract assumptions:**
- Gate-call shape: any caller migration must produce a valid receipt at the gateway layer.
- The Phase 8 eligibility gate may reject the upsert; callers must handle the rejection (the wrapper passes the rejection through).

**Surprise factor:** **clean.** The Phase 8 eligibility gate is invoked inside `upsertWorkspaceDefaultBinding`, not the canonical handler — meaning the gate runs regardless of how the function is called (UI / gateway / direct module call). The canonical surface is a faithful gateway projection of the underlying primitive.

**Recommendation:** None.

---

### `agentStudio.workspaceDefaultBindings.delete`

**Handler:** `server/agent-studio/boot.ts:317-337`.

**Inputs:** `Parameters<typeof deleteWorkspaceDefaultBinding>[0]`.

**Side effects:** deletes the workspace-default-binding row for `(workspaceId, role)`; receipt required; idempotent per descriptor (no error on missing row).

**Contract assumptions:**
- Returns `{ workspaceId, role, removed }` where `removed` is a boolean indicating whether a row was actually deleted (vs. no-op if already absent).
- Idempotent: repeated calls don't error.

**Surprise factor:** **clean.** Idempotent contract is documented; the `removed` flag in the response gives callers visibility into whether the call had effect.

**Recommendation:** None.

---

### `agentStudio.exportCatalog.markImported`

**Handler:** `server/agent-studio/boot.ts:431-452`.

**Inputs:**
```ts
{ agentId: number; catalogEntryId: number }
```

**Side effects:** "advisory marker" per descriptor — writes a sync log row indicating successful import. Risk low; receipt NOT required.

**Contract assumptions:**
- "Advisory marker" — the action records that an import happened, but isn't a primary data write. Failure to mark doesn't roll back the import.
- Both `agentId` and `catalogEntryId` are validated upfront (defensive coding).

**Surprise factor:** **clean.** The "advisory marker" semantic is explicit in the descriptor; future callers should expect this to be a fire-and-forget bookkeeping call rather than a primary write.

**Recommendation:** None.

---

### `agentStudio.exportCatalog.reconcileImports`

**Handler:** `server/agent-studio/boot.ts:454-489`.

**Inputs:**
```ts
{
  agentId: number;
  catalogEntryId: number;
  sourceVersionId: number;
  reconciledBy: number;
}
```

**Side effects:** admin override — flips a `legacy_imported_unresolved` catalog row to `manually_reconciled` and pins `active_source_version_id` (per descriptor). High risk; receipt required.

**Contract assumptions:**
- All four input fields are required (handler validates upfront and throws on missing).
- Admin override semantic — refuses to operate on rows that aren't `legacy_imported_unresolved` (verified in `reconcileCandidateImports` per §24 work).
- `reconciledBy` is recorded for audit trail.

**Surprise factor:** **clean.** Defensive input validation; admin-override-only state transition; explicit refusal on rows in non-unresolved states. This is the most "load-bearing" of the dormant actions — it's the path that resolves Phase 24's `legacy_imported_unresolved` rows — but the contract is solid.

**Recommendation:** None.

---

## Findings summary

- **All 7 dormant actions: `clean` surprise factor.** No publish-flip-to-published-style hidden auto-behavior found.
- The dormancy is **product-roadmap dormancy** (surfaces wired; UI/tooling not yet using them), not **contract dormancy** (handlers waiting on a contract decision).
- The agentStudio canonical surface is well-designed: handlers thin-wrap underlying business logic; opinionated invariants (e.g., `agentStudio.run.execute`'s hardcoded `status: "queued"`) are correct for the canonical's name and don't surprise.

## Why publish-flip-to-published was an outlier

`aiTypes.catalog.publish` (the §35/§36 case) had a hardcoded post-publish entry-status flip. This was opinionated state-change side effect that conflicted with both production-shape callers' expectations.

By contrast, the agentStudio dormant surfaces:
- Either don't write state (`validate`, `resolveForRun`).
- Or write state that's correctly determined by the action's name (`run.execute` queues a run; `markImported` records an import event; `reconcileImports` flips a known-state row to a known-state row).
- Or thin-wrap a primitive whose semantics are validated independently (`upsert`, `delete` for workspace defaults).

The canonical-layer auto-behavior pattern that bit publish doesn't appear in the agentStudio surface.

## Convention reinforced

When designing a NEW canonical action handler, **avoid baking opinionated state-change side effects into the canonical layer** that aren't directly implied by the action's name. If a state change is truly invariant (e.g., new runs always start `queued`), document it explicitly in the descriptor + JSDoc. If a state change is conditional/situational (e.g., flip status to "published" only when not already), put it in the underlying primitive where callers can opt in/out — don't hide it in the canonical handler.

Future canonical-action ADRs (e.g., a future "PMB Phase X — extend register for admin imports" if catalog-import's permanent-exception status is ever revisited) should run through this audit lens at design time, not after a real caller surfaces a conflict.

---

## Cross-references

- `docs/architecture/provider-model-binding/PHASE_40_EXECUTION_PLAN.md` — implementation plan
- `docs/architecture/ai-types/PUBLISH_CANONICAL_CONTRACT_REDESIGN.md` — §36 ADR (the outlier this audit checked against)
- `docs/architecture/ai-types/CATALOG_IMPORT_BULK_ADMIN_WRITE_EXCEPTION.md` — §39 ADR (companion direct-caller audit decision tree)
- `server/agent-studio/boot.ts` — handler registrations audited above
- `server/agent-studio/bindings.ts` + `server/agent-studio/workspace-default-bindings.ts` + `server/agent-studio/services/export-catalog.ts` — underlying primitives the canonical handlers wrap
