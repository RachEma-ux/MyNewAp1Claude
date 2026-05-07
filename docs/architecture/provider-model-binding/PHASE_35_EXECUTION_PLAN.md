# Phase 35 — Execution Plan

**Captured:** 2026-05-07 against `main@707cb7b` (post-Phase-34 closure).
**Branch (this doc):** `docs/pmb-phase-35-0-execution-plan`.
**Owner:** Planner role per AGENTS.md; full autonomous-execution authority granted by the 2026-05-07 standing instruction (continuous phase execution after each closure).

---

## 1. Why Phase 35 exists

Phase 34's closure report carried forward an explicit deferral: **"gateway publish migration is a separate concern"** — the §34.1 sandbox-wf migration replaced `createCatalogEntry` with `gatewayCall("aiTypes.catalog.register", ...)` but kept Step C's `createPublishBundle` call as a direct intra-platform write. That asymmetry was acceptable for Phase 34's scope (carry-forward cleanup of the Phase 32 importToCatalog migration) but leaves the publish surface with the same shape Phase 32 closed for register: high-risk receipt-required canonical action exists (`aiTypes.catalog.publish`), but direct callers bypass it.

Phase 35 closes this. The migration shape mirrors Phase 32's: replace `createPublishBundle` with `gatewayCall("aiTypes.catalog.publish", ...)`, preserve idempotency where it exists, drop dead direct-write code paths.

Phase 35 is **NOT** a D1-violation closure phase. The boundary lint stays in strict mode; no exceptions added; no surfaces changed beyond the publish callers.

---

## 2. Pre-flight audit findings

### Direct callers of `createPublishBundle`

```
server/routers/catalog-manage.ts:1182  — user-facing tRPC publish procedure
server/sandbox-wf/seed-orchestrator.ts:252  — Phase 34 Step C (deferred)
Agents/seed-orchestrator.ts:227  — orphan (see §2.4)
server/ai-types/publishing.ts:85  — INTERNAL (canonical action body, not a caller)
```

**3 real direct callers.** The fourth is the canonical action implementation itself.

### Canonical action input shape

`aiTypes.catalog.publish` (Phase 30, manifest-registered, high-risk + receipt-required) input:

```ts
export interface PublishCatalogEntryInput {
  catalogEntryId: number;
  publishedBy: number;
  versionLabel?: string;
  policyDecision?: string;
}
```

**Snapshot is built internally** from the catalog entry's fields. **Audit event is emitted internally**. **`aiTypes.catalog.published` event is published internally** (Direction B B2b, Phase 27).

### catalog-manage.ts input-shape gap

`catalog-manage.ts:1182` passes a `policyViolations` array along with `policyDecision`:

```ts
const bundle = await createPublishBundle({
  catalogEntryId: input.catalogEntryId,
  versionLabel: input.versionLabel,
  snapshot,
  snapshotHash,
  publishedBy: 1,                       // ← hardcoded; should be ctx.user.id
  policyDecision: bundlePolicyDecision, // ← "pass" | "fail"
  policyViolations: bundlePolicyViolations, // ← array | null
});
```

The canonical action's `PublishCatalogEntryInput` does NOT accept `policyViolations`. Two options:

- **(a)** Extend `PublishCatalogEntryInput` with optional `policyViolations` field, threaded through to `createPublishBundle`. Behavior-preservation when caller doesn't pass it (sandbox-wf path).
- **(b)** Drop the field at migration time. Behavior-affecting — would lose policy-violation persistence for failed publishes.

**Decision: (a).** The canonical action's input contract is "everything a publish needs"; `policyViolations` is part of that contract for failure paths.

Also: `publishedBy: 1` in `catalog-manage.ts:1182` is a hardcoded stale value. The procedure has `ctx.user.id` available; the migration should thread it through. **Tagged as a behavior-fix incidental to the migration**, not a behavior-preserve issue.

### sandbox-wf seed Step C

`sandbox-wf/seed-orchestrator.ts:252` builds its own snapshot:

```ts
const snapshot = {
  entryId: entry.id,
  name: entry.name,
  // ... 12 fields
  versionLabel: "v1.0.0",
};
const snapshotHash = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
await createPublishBundle({
  catalogEntryId: entry.id,
  versionLabel: "v1.0.0",
  snapshot,
  snapshotHash,
  publishedBy: 1,
  policyDecision: "approved",
});
```

The canonical action builds its own snapshot from the catalog entry. **Field overlap check:**

- canonical includes: `id`, `name`, `displayName`, `description`, `entryType`, `sourceType`, `sourceId`, `category`, `subCategory`, `capabilities`, `scope`, `origin`, `providerId`, `config`, `tags`, `publishedAt`
- sandbox-wf includes: `entryId` (= canonical `id`), `name`, `displayName`, `description`, `entryType`, `scope`, `providerId`, `config`, `tags`, `publishedAt`, `versionLabel`

The canonical snapshot **strictly covers** sandbox-wf's fields except `versionLabel` (which lives in the bundle row's `versionLabel` column, not in the snapshot — so it survives the migration without snapshot inclusion). Snapshot **hash will differ** post-migration because the canonical snapshot has more fields, but downstream consumers don't pin a specific hash; the hash is content-derived for tamper-detection.

**Decision: migrate sandbox-wf Step C to gateway publish.** No behavior change beyond hash content.

### Agents/seed-orchestrator.ts orphan

`Agents/seed-orchestrator.ts` (capital A, repo root) imports `from "../db/catalog"`. That path resolves to `db/catalog` at repo root — does not exist. `server/db/catalog.ts` was deleted in Phase 31.4. Repository-wide search:

```
$ grep -rn "Agents/seed-orchestrator" --include="*.ts" --include="*.json" --include="*.yaml" --include="*.md"
(zero matches)
```

**Zero references.** Pre-modular-refactor experimental seed file. The same WF-Orchestrator logic lives in `server/sandbox-wf/seed-orchestrator.ts` (Phase 34 migrated). Decision: **delete the orphan** as part of Phase 35.

---

## 3. Sub-phase decomposition

### 35.0 — Plan freeze (this PR)

- [ ] Land `PHASE_35_EXECUTION_PLAN.md` (this doc).
- [ ] Memory: create `project_phase_35_authority.md`; `MEMORY.md` index update.
- [ ] **Acceptance:** doc lands; CI 5/5 green.

### 35.1 — Extend canonical action input + migrate catalog-manage.ts

Single PR. Two coupled changes:

- [ ] **Extend `PublishCatalogEntryInput`** with optional `policyViolations` field (`Array<{name: string; details: string | null}> | null | undefined`). Thread through to `createPublishBundle` call inside `publishing.ts`. Default behavior unchanged when undefined.
- [ ] **Migrate `catalog-manage.ts:1182`** publish procedure body to `gatewayCall<PublishCatalogEntryInput, PublishCatalogEntryResult>({...})`:
  ```ts
  const result = await gatewayCall<PublishCatalogEntryInput, PublishCatalogEntryResult>({
    ctx: {
      sourceModule: "catalog-manage",
      targetModule: "aiTypes",
      actionKey: "aiTypes.catalog.publish",
      governanceReceiptId: `catalog-manage-publish-${input.catalogEntryId}-${ctx.user.id}-${Date.now()}`,
      actorId: ctx.user.id,
    },
    input: {
      catalogEntryId: input.catalogEntryId,
      publishedBy: ctx.user.id,
      versionLabel: input.versionLabel,
      policyDecision: bundlePolicyDecision,
      policyViolations: bundlePolicyViolations,
    },
  });
  ```
- [ ] **Drop the procedure-side snapshot building + `createCatalogAuditEvent` calls** — the canonical action handles both. Verify the procedure-side `audit("catalog.bundle.published", ...)` call: if it's a different audit channel from `createCatalogAuditEvent`, keep it; if it duplicates, drop.
- [ ] **Drop the procedure-side `updateCatalogEntry({status: "active"})` revert-on-failure block** if the canonical action handles failure semantics correctly. If not, keep the revert as defensive caller-side code.
- [ ] **Behavior-fix:** `publishedBy: 1` hardcoded → `ctx.user.id`. Tag in PR body.
- [ ] **Acceptance:** `catalog-manage.ts` no longer calls `createPublishBundle` directly; `tsc --noEmit` clean; existing tests pass; CI 5/5 green.
- [ ] **Estimate:** 1 PR, ~80 LOC removed, ~30 LOC added (~50 LOC net removal).
- [ ] **Pause if:** the procedure-side revert/audit logic doesn't fold cleanly into canonical-action semantics — surface and decide.

### 35.2 — Migrate sandbox-wf Step C + delete Agents/ orphan

Single PR; two unrelated cleanups bundled because both touch the publish surface:

- [ ] **Migrate `sandbox-wf/seed-orchestrator.ts` Step C** to `gatewayCall("aiTypes.catalog.publish", ...)`:
  ```ts
  await gatewayCall<PublishCatalogEntryInput, PublishCatalogEntryResult>({
    ctx: {
      sourceModule: "sandbox-wf",
      targetModule: "aiTypes",
      actionKey: "aiTypes.catalog.publish",
      governanceReceiptId: `sandbox-wf-publish-${entry.name}-${Date.now()}`,
      actorId: 1,
    },
    input: {
      catalogEntryId: entry.id,
      publishedBy: 1,
      versionLabel: "v1.0.0",
      policyDecision: "approved",
    },
  });
  ```
- [ ] **Drop the procedure-side snapshot + snapshotHash building.** Canonical action handles both.
- [ ] **Delete `Agents/seed-orchestrator.ts`** (orphaned pre-modular-refactor file; broken imports; zero references).
- [ ] **Delete `Agents/wf-orchestrator-agents.{csv,json,yaml}`** if also orphaned (verify zero references first; if tooling reads them, keep).
- [ ] **Acceptance:** sandbox-wf no longer calls `createPublishBundle` directly; `Agents/seed-orchestrator.ts` removed; `tsc --noEmit` clean; CI 5/5 green.
- [ ] **Estimate:** 1 PR, ~150 LOC removed (orphan + sandbox-wf snapshot building), ~30 LOC added.
- [ ] **Pause if:** any of the `Agents/*.{csv,json,yaml}` files turn out to be in tooling use — keep them, narrow the cleanup to the .ts file only.

### 35.3 — Closure report

- [ ] Author `docs/evidence/provider-model-binding/PHASE_35_CLOSURE_REPORT.md`.
- [ ] Update memory: `project_phase_35_authority.md` → CLOSED; `project_pmb_phase_35_complete.md` created with PR ledger + carry-forward lessons; `MEMORY.md` index update; RAC-progress head SHA bump.
- [ ] **Acceptance:** all 4 PRs merged; CI fingerprint stable.
- [ ] **Estimate:** 1 PR, ~150 LOC docs.

---

## 4. Decision matrix

Cap: **zero new TEMPORARY_EXCEPTION_WITH_DEADLINE entries.**

| # | Item | Decision | Sub-phase | Risk |
|---|---|---|---|---|
| 1 | Extend `PublishCatalogEntryInput` with `policyViolations` | **Extend** — preserves catalog-manage failure-path persistence | 35.1 | Low |
| 2 | catalog-manage.ts `publishedBy: 1` → `ctx.user.id` | **Behavior-fix** — incidental to migration; tag in PR | 35.1 | Low (was wrong before) |
| 3 | catalog-manage.ts revert-on-failure block | **Drop if canonical handles it** — verify in §35.1 audit | 35.1 | Low |
| 4 | catalog-manage.ts `audit("catalog.bundle.published")` call | **Keep if separate channel; drop if duplicates canonical** | 35.1 | Low |
| 5 | Sandbox-wf snapshot building | **Drop** — canonical builds equivalent snapshot | 35.2 | Low |
| 6 | `Agents/seed-orchestrator.ts` | **Delete** — orphan with broken imports | 35.2 | Zero (already broken) |
| 7 | `Agents/wf-orchestrator-agents.{csv,json,yaml}` | **Conditional delete** — only if zero references | 35.2 | Low |
| 8 | Receipt sourcing (system actor in sandbox-wf) | **Pattern from §34.1** — `<source>-publish-<resource>-${Date.now()}` | 35.2 | Low |
| 9 | Receipt sourcing (user actor in catalog-manage.ts) | **Pattern from §32** — `catalog-manage-publish-<entryId>-<userId>-${Date.now()}` | 35.1 | Low |

---

## 5. Test strategy

### Per sub-phase

- **35.0 (this):** docs only.
- **35.1 (canonical extension + catalog-manage migration):** `tsc --noEmit`; existing publishing tests cover the canonical action's snapshot-build + event-emit path; existing catalog-manage tests cover the procedure surface.
- **35.2 (sandbox-wf migration + orphan delete):** `tsc --noEmit`; sandbox-wf seed-orchestrator has no direct unit tests but is exercised by fixture-load integration; orphan delete is mechanical.
- **35.3 (closure):** docs only.

### Cross-cutting

- **CI fingerprint:** Phase 35 baseline is **5/5 green** at `707cb7b`. No matrix-shape changes.

---

## 6. Sizing

| Sub-phase | PRs | LOC code | LOC docs |
|---|---|---|---|
| 35.0 (this) | 1 | — | ~250 |
| 35.1 (canonical + catalog-manage) | 1 | -50 net | ~10 |
| 35.2 (sandbox-wf + orphan) | 1 | -120 net | ~10 |
| 35.3 (closure) | 1 | — | ~150 |
| **Total** | **4** | **-170 net** | **~420** |

Larger LOC reduction than Phase 34 (-25 net) and Phase 32 (-53 net) due to the orphan delete.

---

## 7. CI fingerprint expectation

Phase 35 baseline is **5/5 green** as of `707cb7b` (post-Phase-34 close-out). No changes expected.

---

## 8. Authority and pause conditions

**Authority:** full autonomous commit/push/merge for any PR scoped inside this plan. Phase 35 is the second phase under the **continuous-execution standing instruction** (memory: `feedback_continuous_phase_execution.md`) — picked autonomously after Phase 34 closed at `707cb7b`. Surface of my reasoning: Phase 34's freshest carry-forward was the `createPublishBundle` deferral; PMT identity mismatch is the larger carry-forward but explicitly framed in the §34 closure as needing its own ADR (Plan v3 architectural change).

**Pause and surface for sign-off if:**

1. The canonical-action input extension surfaces a deeper contract issue (e.g., `policyViolations` shape doesn't match what `agsCatalogPublishBundles` column expects).
2. catalog-manage.ts revert-on-failure logic doesn't fold cleanly — keep procedure-side revert and document the asymmetry.
3. `Agents/*.{csv,json,yaml}` data files turn out to have tooling consumers — keep them, narrow §35.2.
4. Pre-existing red CI on a sub-phase PR not on the known-flaky-shard list.
5. Any PMT-identity-mismatch-shape architectural mismatch surfaces (low likelihood; publish surface is symmetric for all three callers).

---
