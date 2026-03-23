# STRICT CROSS-DOMAIN ALIGNMENT AUDIT REPORT

**Date:** 2026-03-21
**Scope:** LLMs, Providers, Models, Bots, Agents (+ cross-domain)
**Repository:** `RachEma-ux/MyNewAp1Claude`
**Role:** Reviewer + Governance Agent (per AGENTS.md)
**Mode:** Read-only audit — zero file modifications

---

## 1. SUMMARY

**Overall Alignment: NOT ALIGNED**

The five domains have significant structural, governance, and behavioral inconsistencies. LLMs are the only domain that passes all governance checks (policy engine, blocking audit, catalog authority, promotion workflow). The remaining four domains have critical gaps. Two separate model routers exist simultaneously with conflicting governance levels.

---

## 2. PER-DOMAIN ANALYSIS

### Domain 1: LLMs — ALIGNED

| Check | Status | Detail |
|---|---|---|
| Routes | PARTIAL | Uses `/llm/control-plane` while all others use `control-panel` |
| Lifecycle | PASS | sandbox → governed → production with promotion gates |
| Catalog boundary | PASS | `onboardVersionToCatalog`, `resolveCatalogLLMRuntimeAuthority` |
| Callable semantics | PASS | Internal eligibility flag, NOT runtime authority (documented) |
| Provider reference | WARN | `provider: z.string().optional()` in config schema (line 67) — string, not typed providerId |
| Policy engine | PASS | `LLMPolicyEngine.evaluate()` called in `createVersion` |
| Audit enforcement | PASS | 6 mutations with **blocking** `await getAuditLogger().log()` |
| Version management | PASS | `llm_versions` table with full versioning |
| Promotion workflow | PASS | `executePromotion` with guard + duplicate safety check |

### Domain 2: Providers — PARTIALLY ALIGNED

| Check | Status | Detail |
|---|---|---|
| Routes | PARTIAL | Has `/providers/control-panel` but `/providers/dashboard` and `/providers/wizard` → ComingSoon page component (routes exist, pages have real content in ComingSoon file) |
| Lifecycle | NEW | `updateLifecycleStatus` added, but no stage progression enforcement |
| Catalog boundary | FAIL | Providers use standalone `providers` table — NOT catalog-first |
| Callable semantics | N/A | No callable flag on providers |
| Policy engine | FAIL | No policy evaluation on create or lifecycle transitions |
| Audit enforcement | PARTIAL | `updateLifecycleStatus` has audit logging; `create`/`update`/`delete` do not |
| Version management | FAIL | No versioning on provider configurations |
| Promotion workflow | FAIL | No promotion gates; lifecycle status is a direct setter |

### Domain 3: Models — NOT ALIGNED

| Check | Status | Detail |
|---|---|---|
| Routes | FAIL | `/models/dashboard`, `/models/control-panel`, `/models/wizard` all route to same `ModelsComingSoonPage` |
| Lifecycle | PARTIAL | New `governedModels` router uses catalog `draft` status, but old `models` router (line 234 of routers.ts) still exists with zero governance |
| Catalog boundary | SPLIT | `governedModels` is catalog-first; `models` (inline) writes directly to `models` table bypassing catalog entirely |
| Callable semantics | FAIL | No callable flag, no eligibility checks |
| Provider reference | WARN | `providerName: z.string().optional()` — string name, not foreign key |
| Policy engine | FAIL | No policy evaluation on register or updateStatus |
| Audit enforcement | FAIL | `getAuditLogger().log()` present but **NOT awaited** (fire-and-forget, lines 79, 105) |
| Version management | FAIL | No versioning — flat catalog entry |
| Promotion workflow | FAIL | Only `updateStatus` with no gate enforcement |
| **CRITICAL** | **DUAL ROUTER** | Two `models` routers coexist — `appRouter.models` (ungoverned) and `appRouter.governedModels` (governed). Client could call either. |

### Domain 4: Bots — PARTIALLY ALIGNED

| Check | Status | Detail |
|---|---|---|
| Routes | PARTIAL | Has `/bots/dashboard`, `/bots/control-panel`, `/bots/wizard` — but NO `/bots` list route |
| Lifecycle | PASS | 6-state lifecycle: draft/bound/reviewed/approved/active/suspended |
| Catalog boundary | PASS | Catalog-first: all bots stored as `catalog_entries` with `entryType="bot"` |
| Callable semantics | FAIL | No callable flag on bots |
| Reference integrity | FAIL | `agentId` and `llmId` in config are optional numbers with NO FK validation — can reference non-existent entities |
| Policy engine | FAIL | No policy evaluation on create, activate, or status transitions |
| Audit enforcement | FAIL | `getAuditLogger().log()` present but **NOT awaited** (fire-and-forget, lines 83, 122) |
| Version management | FAIL | No versioning |
| Promotion workflow | PARTIAL | `activate` requires `reviewState === "approved"` — good. But no full promotion pipeline. |

### Domain 5: Agents — PARTIALLY ALIGNED

| Check | Status | Detail |
|---|---|---|
| Routes | PASS | Full set: `/agents`, `/agents/dashboard`, `/agents/control-panel`, `/agents/wizard`, `/agents/:id` |
| Lifecycle | PASS | Uses `shared/agent-lifecycle.ts` with `canTransitionAgentStatus()` |
| Catalog boundary | PARTIAL | Has `importToCatalog` mutation with `isCatalogImportEligible()`, but agents are stored in own `agents` table — catalog is opt-in, not default |
| Callable semantics | PASS | `callable: isCatalogImportEligible(status) && !catalogEntryId` computed in list |
| Policy engine | PARTIAL | Uses `evaluateAgentCompliance` (separate engine from `LLMPolicyEngine`) |
| Audit enforcement | **CRITICAL FAIL** | **ZERO audit logging** — `getAuditLogger` is not imported, not called on ANY mutation (create, update, delete, deployTemplate, promote, importToCatalog) |
| Version management | FAIL | No versioning on agent configurations |
| Promotion workflow | PARTIAL | Has `promote` mutation but limited gate enforcement |

---

## 3. CRITICAL VIOLATIONS

| # | Severity | Domain | Violation |
|---|---|---|---|
| **V1** | CRITICAL | Models | **Dual router conflict** — `appRouter.models` (ungoverned, direct DB) and `appRouter.governedModels` (governed, catalog-backed) coexist. Client can bypass all governance by calling `trpc.models.*` instead of `trpc.governedModels.*` |
| **V2** | CRITICAL | Agents | **Zero audit trail** — No `getAuditLogger` usage anywhere in agents router. All mutations (create, update, delete, promote, deployTemplate, importToCatalog) are invisible to the audit system |
| **V3** | HIGH | Models, Bots | **Non-blocking audit** — `getAuditLogger().log()` called without `await`. Audit records may be silently dropped if the process exits or errors occur before the async write completes |
| **V4** | HIGH | Chat | **Catalog bypass** — `chat.sendMessage` takes raw `providerId: z.number()` and resolves directly from provider registry. No catalog authority check. Any provider ID works regardless of catalog/governance status |
| **V5** | HIGH | Models, Bots, Providers | **No policy engine** — Only LLMs use `LLMPolicyEngine.evaluate()`. The other three governed domains have zero policy evaluation on create or state transitions |
| **V6** | MEDIUM | Bots | **No reference integrity** — `agentId` and `llmId` in bot config are stored as plain numbers. No validation that referenced agents or LLMs exist |
| **V7** | MEDIUM | LLMs, Models | **String provider references** — LLM config uses `provider: z.string()`, Models use `providerName: z.string()`. Neither uses typed `providerId: z.number()` FK |
| **V8** | MEDIUM | LLMs | **Route naming divergence** — LLMs use `/llm/control-plane`, all other domains use `/<domain>/control-panel` |
| **V9** | LOW | Bots | **Missing list route** — No `/bots` top-level list route exists (only dashboard/control-panel/wizard) |

---

## 4. INCONSISTENCY MATRIX

| Capability | LLMs | Providers | Models | Bots | Agents |
|---|---|---|---|---|---|
| **Storage** | Own tables (`llms`, `llm_versions`) | Own table (`providers`) | SPLIT: own table + catalog | Catalog-first | Own table (`agents`) |
| **Governed procedures** | All mutations | All mutations | `governedModels` yes, `models` NO | All mutations | All mutations |
| **Policy engine** | `LLMPolicyEngine` | None | None | None | `evaluateAgentCompliance` |
| **Audit logging** | Blocking (`await`) | Partial (lifecycle only) | Fire-and-forget | Fire-and-forget | **None** |
| **Catalog integration** | Full (onboard + authority) | None | `governedModels` only | Full | Opt-in import |
| **Callable semantics** | Yes (documented) | N/A | No | No | Yes |
| **Version management** | Yes (`llm_versions`) | No | No | No | No |
| **Promotion workflow** | Full (sandbox→governed→prod) | No | No | No | Partial |
| **FK validation** | No (string provider) | N/A | No (string provider) | No (agentId/llmId) | No (`modelId: "gpt-4"` hardcoded string) |
| **Route structure** | `/llm/control-plane` | `/providers/control-panel` | `/models/control-panel` | `/bots/control-panel` | `/agents/control-panel` |
| **List route** | `/list/llms` | ComingSoon | ComingSoon | Missing | `/agents` |

---

## 5. ROOT CAUSES

1. **No shared governance contract.** Each domain was built independently. There is no shared interface or base pattern that enforces "a governed domain MUST have: blocking audit, policy evaluation, catalog integration, version management, and promotion workflow." The LLM domain achieved this organically; others didn't inherit the pattern.

2. **Dual storage strategy.** The codebase has two data strategies: domain-owned tables (`llms`, `agents`, `providers`) and catalog-first (`catalog_entries` with discriminator). Models got both simultaneously (the old inline router was never removed). There's no documented decision on which strategy is canonical.

3. **Audit logger is fire-and-forget by default.** `getAuditLogger().log()` returns a Promise but callers in Models and Bots don't `await` it. The LLM router is the exception (it `await`s). The API doesn't enforce blocking usage.

4. **Policy engine is LLM-specific.** `LLMPolicyEngine` is hard-coded with LLM-specific rules (naming, roles, model allowlist, inference parameters). It cannot be reused by Models, Bots, or Providers without a generic policy evaluation interface.

5. **Provider references are untyped.** Multiple domains accept provider as a string name rather than a validated foreign key to the `providers` table. This makes cross-domain integrity impossible to enforce.

6. **Route naming was not standardized before implementation.** LLMs used "control-plane" (correct for infrastructure semantics) while the team template used "control-panel". No alignment pass was done.

---

## 6. FIX STRATEGY (NOT implementation)

### Priority 1 — Eliminate dual router conflict (V1)
- Remove the inline `models` router from `server/routers.ts` (lines 234-331)
- Rename `governedModels` to `models` in the appRouter
- Update all client calls from `trpc.models.*` and `trpc.governedModels.*` to the single governed router

### Priority 2 — Add audit logging to Agents (V2)
- Add `getAuditLogger` import and blocking `await getAuditLogger().log()` calls to all 6+ mutations in `server/routers/agents.ts`
- Match the LLM router pattern exactly (action type, target type, metadata shape)

### Priority 3 — Make audit calls blocking (V3)
- Add `await` to all `getAuditLogger().log()` calls in `server/routers/models.ts` (lines 79, 105) and `server/routers/bots.ts` (lines 83, 122)
- Consider a linting rule or wrapper that enforces `await` on audit calls

### Priority 4 — Add catalog authority check to chat runtime (V4)
- Before `registry.getProvider(input.providerId)`, resolve the provider's catalog entry and verify it has published+active+approved status using the same authority pattern as `resolveCatalogLLMRuntimeAuthority`

### Priority 5 — Create generic policy evaluation interface (V5)
- Abstract `LLMPolicyEngine` into a `DomainPolicyEngine<T>` interface with pluggable rule sets
- Implement `ModelPolicyEngine`, `BotPolicyEngine`, `ProviderPolicyEngine` with domain-specific rules
- Wire into respective `create`/`register` mutations

### Priority 6 — Normalize route naming (V8, V9)
- Rename `/llm/control-plane` to `/llm/control-panel` (or vice versa — pick one convention)
- Add missing `/bots` list route
- Ensure all 5 domains have: `/<domain>`, `/<domain>/dashboard`, `/<domain>/control-panel`, `/<domain>/wizard`

### Priority 7 — Type provider references (V7)
- Replace `provider: z.string()` with `providerId: z.number().int().positive()` in LLM config schema
- Replace `providerName: z.string()` with `providerId: z.number()` in Models register schema
- Add FK validation in Bots for `agentId` and `llmId`

### Priority 8 — Standardize storage strategy
- Document a decision: catalog-first vs domain-table. Recommend catalog-first for new domains (Models, Bots) and migration path for legacy domains (Agents, Providers)

---

**END OF AUDIT REPORT**

*No files were modified. No features were implemented. No refactoring was performed.*
