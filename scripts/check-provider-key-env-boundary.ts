#!/usr/bin/env tsx
/**
 * check:provider-key-env-boundary
 *
 * Plan v3 Phase 5 — enforces Decision D1 (DECISION_RECORD.md):
 *
 *   The runtime never reads provider API keys from `process.env`.
 *   `.env` keys are an input to a one-shot, boot-time seed/import
 *   path that creates encrypted Provider Connection rows. Anything
 *   else that wants a provider credential must use Provider
 *   Connections through the OpenRouter Model Access facade.
 *
 * What this script flags
 *
 *   1. Literal reads of `process.env.X` or `process.env["X"]` where
 *      `X` ends in `_API_KEY` and is not a documented non-provider
 *      service token (NON_PROVIDER_KEYS).
 *   2. Writes/mutations: `process.env.X = …` where `X` ends in
 *      `_API_KEY`.
 *   3. Dynamic `process.env[<expr>]` reads inside Agent Studio
 *      runtime adapters — the exact path PR #100's incident
 *      exploited. The variable name cannot be validated statically,
 *      so we forbid the indirection itself.
 *
 * Allowlist
 *
 *   - The explicit boot-time seed script at
 *     `scripts/provider-connections/seed-from-env.ts` (created in
 *     this phase, may be empty until Phase 9–10).
 *   - Documented legacy exceptions LR-01 … LR-06 from
 *     `LEGACY_EXCEPTION_REGISTER.md`. Each entry must list its
 *     register ID and deadline phase so a future architecture run
 *     can detect when a deadline has passed.
 *
 * Why baseline-allowlist legacy exceptions
 *
 *   The Plan v3 rule must land before every legacy reader migrates.
 *   Listing each exception here mirrors the register and forces a
 *   PR-time re-decision when the file is touched (the violation
 *   site is grep-able, not just hidden behind a folder rule).
 */

import { join, relative, sep } from "path";
import {
  REPO_ROOT,
  listSourceFiles,
  readFile,
  type Violation,
} from "./lib/module-graph";

/**
 * Env-var names that MATCH the `*_API_KEY` shape but are NOT provider
 * API keys. These are domain-specific service tokens and remain
 * permitted.
 */
const NON_PROVIDER_KEYS: ReadonlySet<string> = new Set([
  // Forge service authentication token, not an LLM provider key.
  "BUILT_IN_FORGE_API_KEY",
  // OmniRAG domain service token (LR-05). Decision D1 covers
  // provider keys; OmniRAG is its own service.
  "OMNIRAG_API_KEY",
]);

interface AllowedOccurrence {
  /** Repo-relative path with `/` separators. */
  file: string;
  /**
   * Exact env-var name allowed at this site, OR the literal sentinel
   * `"<dynamic>"` for the dynamic-index Agent Studio adapter case.
   */
  envKey: string;
  /** Cross-reference into LEGACY_EXCEPTION_REGISTER.md. */
  registerId: string;
  /** Phase by which this exception must migrate. */
  deadlinePhase: string;
  /** One-line justification for this row. */
  reason: string;
}

const ALLOWED_OCCURRENCES: ReadonlyArray<AllowedOccurrence> = [
  // LR-06: CLOSED in Phase 28.2 (`f0fa131`-onwards). The
  // `autoProvisionProviders` boot block was extracted to
  // `scripts/provider-connections/seed-from-env.ts`. The script is
  // allowed to read provider env vars (it's the one legitimate path
  // per Plan v3 D1) and is allowlisted by file-name match below.
  // The boot file no longer reads provider env keys; if you see this
  // entry restored, something has regressed and the lint should fail.
  // LR-01: CLOSED in Phase 29.0a. The simulation engine's live-runtime
  // branch was migrated onto `openRouter.modelAccess.execute` +
  // `runViaOpenllmBridge` (Phase 28.6b primitive). The
  // `openllm-runtime-adapter.ts` and `openai-direct-adapter.ts` files
  // were deleted entirely (no more `resolveProviderApiKey` /
  // `runViaOpenAIDirect` / `runViaOpenllmAgent` / `resolveOpenllmEndpoint`
  // in the codebase). If you see this entry restored, the adapter has
  // returned and the lint should fail.
  // LR-02 + LR-03: CLOSED in Phase 29.4b. Both `server/embeddings/service.ts`
  // and `server/documents/processor.ts` were migrated onto the workspace-
  // default-binding lookup (`resolveWorkspaceDefaultBinding`, role='embedding')
  // + `gatewayCall(openRouter.modelAccess.embed)` with `intent="system-internal"`
  // (the new infrastructure-call lane added in Phase 29.4a). The
  // `process.env.OPENAI_API_KEY` reads at lines 54/59 of service.ts and
  // line 339 of processor.ts are gone. The legacy `agents/executor.ts`
  // RAG caller threads `options.workspaceId` into `searchSimilarChunks`.
  // If you see these entries restored, something has regressed and the
  // lint should fail.
  // LR-04: CLOSED in Phase 29.5. `server/operators/provider-hub.ts` was
  // migrated onto the workspace-default-binding lookup
  // (`resolveWorkspaceDefaultBinding`, role='classifier') +
  // `gatewayCall(openRouter.modelAccess.execute)` with
  // `intent="system-internal"` (the infrastructure-call lane from Phase
  // 29.4a). The local `getOpenAIClient`/`getOllamaClient` provider chain
  // was removed; provider selection now lives at the workspace level.
  // The per-operator `OPERATOR_MODEL_CONSTRAINTS` (max tokens, max
  // temperature) governance guardrails are preserved; the `allowedModels`
  // list was dropped because the workspace admin owns model selection
  // via the binding. If this entry is restored, the local provider
  // chain has returned and the lint should fail.
  // The Phase 5 seed script itself — once created, it is the ONE
  // legitimate reader of provider env vars by design.
  {
    file: "scripts/provider-connections/seed-from-env.ts",
    envKey: "<seed-script>",
    registerId: "PMB-D1-EXEMPT",
    deadlinePhase: "permanent",
    reason:
      "Explicit boot-time seed. Reads provider env vars once and writes encrypted Provider Connection rows.",
  },
];

const PROVIDER_KEY_SUFFIX = "_API_KEY";

/**
 * Match `process.env.IDENT` and `process.env["IDENT"]` reads.
 * Group 1 = dot form, Group 2 = string-index form.
 */
const envLiteralReadRegex =
  /process\.env(?:\.([A-Z0-9_]+)|\[\s*["']([A-Z0-9_]+)["']\s*\])/g;

/**
 * Match writes: `process.env.X = …` or `process.env["X"] = …`.
 */
const envWriteRegex =
  /process\.env(?:\.([A-Z0-9_]+)|\[\s*["']([A-Z0-9_]+)["']\s*\])\s*=(?!=)/g;

/**
 * Match dynamic `process.env[<expr>]` reads where the index is NOT a
 * string literal. The negative lookahead skips `["..."]` and `['...']`.
 * We only enforce this in Agent Studio runtime paths (LR-01 zone).
 */
const envDynamicReadRegex =
  /process\.env\[\s*(?!["'])[^\]]+\]/g;

/**
 * Dynamic-index `process.env[<expr>]` is forbidden in these
 * sub-trees because they are the actual provider-credential
 * resolution paths. We deliberately do NOT include
 * `services/`/`api/` — those contain generic env-var passthroughs
 * for sandboxed hook execution (PATH only) and unrelated indirection.
 */
const AGENT_STUDIO_DYNAMIC_ZONE_PREFIXES = [
  "server/agent-studio/adapters/",
  "server/agent-studio/runtime/",
];

function fileRelOf(path: string): string {
  return relative(REPO_ROOT, path).split(sep).join("/");
}

function computeLine(src: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx; i++) if (src[i] === "\n") line++;
  return line;
}

function isAllowed(fileRel: string, envKey: string): AllowedOccurrence | null {
  for (const a of ALLOWED_OCCURRENCES) {
    if (a.file !== fileRel) continue;
    if (a.envKey === envKey) return a;
    // The dynamic sentinel allows ANY env access at the listed file.
    if (a.envKey === "<dynamic>") return a;
    // The seed-script sentinel allows any provider key at that path.
    if (a.envKey === "<seed-script>") return a;
  }
  return null;
}

function inAgentStudioDynamicZone(fileRel: string): boolean {
  return AGENT_STUDIO_DYNAMIC_ZONE_PREFIXES.some((p) => fileRel.startsWith(p));
}

function isProviderKey(name: string): boolean {
  if (!name.endsWith(PROVIDER_KEY_SUFFIX)) return false;
  if (NON_PROVIDER_KEYS.has(name)) return false;
  return true;
}

function main(): void {
  const violations: Violation[] = [];

  const serverFiles = listSourceFiles(join(REPO_ROOT, "server"));
  const scriptFiles = listSourceFiles(join(REPO_ROOT, "scripts"));
  const allFiles = [...serverFiles, ...scriptFiles];

  for (const file of allFiles) {
    const fileRel = fileRelOf(file);

    // The boundary script and its tests describe the rule — they
    // mention env-key names in string form, not as live process.env
    // reads. Skip them.
    if (fileRel === "scripts/check-provider-key-env-boundary.ts") continue;
    if (
      fileRel ===
      "tests/check-provider-key-env-boundary.test.ts"
    ) {
      continue;
    }

    const src = readFile(file);

    // Rule 1 — literal reads.
    envLiteralReadRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = envLiteralReadRegex.exec(src)) !== null) {
      const key = match[1] ?? match[2];
      if (!key) continue;
      if (!isProviderKey(key)) continue;
      // Skip if this is actually the start of an assignment — the
      // write rule will handle it (avoid double-flagging).
      const tail = src.slice(match.index + match[0].length);
      if (/^\s*=(?!=)/.test(tail)) continue;
      const allowed = isAllowed(fileRel, key);
      if (allowed) continue;
      const line = computeLine(src, match.index);
      violations.push({
        rule: "provider-key-env-boundary",
        file: fileRel,
        line,
        severity: "error",
        message: `Reads provider API key from process.env (${key}). Per Plan v3 Decision D1, runtime code must obtain provider credentials through OpenRouter Model Access (withProviderCredential). Use the seed script (scripts/provider-connections/seed-from-env.ts) to import .env keys at boot, then read encrypted Provider Connections at runtime.`,
      });
    }

    // Rule 2 — writes/mutations.
    envWriteRegex.lastIndex = 0;
    while ((match = envWriteRegex.exec(src)) !== null) {
      const key = match[1] ?? match[2];
      if (!key) continue;
      if (!isProviderKey(key)) continue;
      const allowed = isAllowed(fileRel, key);
      if (allowed) continue;
      const line = computeLine(src, match.index);
      violations.push({
        rule: "provider-key-env-boundary",
        file: fileRel,
        line,
        severity: "error",
        message: `Writes to process.env (${key}). Per Plan v3 Decision D1, the runtime must not mutate provider env vars. PR #100 fixed exactly this pollution path; do not reintroduce it.`,
      });
    }

    // Rule 3 — dynamic `process.env[<expr>]` reads in the Agent
    // Studio runtime zone. The variable name cannot be validated
    // statically, so the indirection itself is forbidden in this
    // zone. Allowlisted files (LR-01) opt out by listing
    // `envKey: "<dynamic>"` above.
    if (inAgentStudioDynamicZone(fileRel)) {
      envDynamicReadRegex.lastIndex = 0;
      while ((match = envDynamicReadRegex.exec(src)) !== null) {
        // Skip if this dynamic read is inside an allowlisted file.
        const allowed = isAllowed(fileRel, "<dynamic>");
        if (allowed) break; // whole-file pass — stop scanning rule 3
        const line = computeLine(src, match.index);
        violations.push({
          rule: "provider-key-env-boundary",
          file: fileRel,
          line,
          severity: "error",
          message: `Dynamic process.env[<expr>] read in an Agent Studio runtime path. Per Plan v3 Decision D1, the runtime must not resolve provider credentials via env-var indirection. Use Provider Connections through Model Access.`,
        });
      }
    }
  }

  for (const v of violations) {
    console.error(
      `[ERROR] ${v.rule} :: ${v.file}:${v.line}\n        ${v.message}`,
    );
  }

  if (violations.length > 0) {
    console.error(
      `\n${violations.length} provider-key-env boundary violation(s).`,
    );
    process.exit(1);
  }

  console.log("OK — provider-key-env boundary check passed (D1).");
  process.exit(0);
}

main();
