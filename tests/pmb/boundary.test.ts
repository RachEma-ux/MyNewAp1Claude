/**
 * Plan v3 Phase 42 — Provider/Model Binding boundary invariants.
 *
 * Static codebase scans that lock in the seven module-isolation rules
 * the EXECUTION_CHECKLIST calls out. These run as ordinary Vitest tests
 * (no DB, no network) — failures here mean a regression has crossed a
 * Plan v3 boundary that previous PRs deliberately closed.
 *
 * The seven invariants:
 *
 *   1. Agent Studio does not store provider keys (no key/secret/credential
 *      columns in `ags_*` schema; no `apiKey`/`secret` insert payloads in
 *      AS repository).
 *   2. Agent Studio does not write `catalog_entries`. The only path to a
 *      catalog write is through `aiTypes.catalog.register` via the
 *      gateway. No direct `createCatalogEntry`/`updateCatalogEntry` from
 *      `server/agent-studio/`. Receipt: this is enforced at runtime by
 *      `publish-no-catalog-write.test.ts` already; Phase 42 adds a
 *      static-import scan covering all AS source files, not just the
 *      publish path.
 *   3. AI Types does not import Agent Studio internals. Allowed imports
 *      from AS into AI Types: `agent-studio/shared/*` (typed contracts).
 *      Forbidden: repository, db, services, internal manifest internals.
 *   4. AI Types does not query ASDB. No `getAsDb` import, no `ags_` table
 *      references in raw SQL.
 *   5. OpenRouter Model Access does not read `process.env.<X>_API_KEY`.
 *      The runtime credential resolver (`provider-connections/internal`)
 *      is the only legitimate reader. This is also enforced by
 *      `scripts/check-provider-key-env-boundary.ts`; Phase 42 adds a
 *      direct content scan for redundancy.
 *   6. Provider Connections public API returns no secrets. The exported
 *      `ProviderConnectionRef` and related shapes do not contain
 *      apiKey/secret/credential fields.
 *   7. Cross-module frontend boundary: there are no client-side imports
 *      from another module's backend internals (verified by the
 *      existing `check:cross-module-links` script — Phase 42 asserts
 *      the script's enforcement is wired in package.json).
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.cwd();

function read(p: string): string {
  try {
    return readFileSync(join(REPO_ROOT, p), "utf8");
  } catch {
    return "";
  }
}

function walkTs(dir: string, options: { skipTests?: boolean } = {}): string[] {
  const out: string[] = [];
  function walk(d: string) {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const e of entries) {
      if (e === "node_modules" || e === ".git" || e === "dist") continue;
      const full = join(d, e);
      let s;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        walk(full);
      } else if (s.isFile()) {
        if (!e.endsWith(".ts") && !e.endsWith(".tsx")) continue;
        if (e.endsWith(".d.ts")) continue;
        if (options.skipTests && /\.(test|spec)\.tsx?$/.test(e)) continue;
        out.push(full);
      }
    }
  }
  walk(join(REPO_ROOT, dir));
  return out;
}

function relPath(abs: string): string {
  return abs.startsWith(REPO_ROOT) ? abs.slice(REPO_ROOT.length + 1) : abs;
}

// ────────────────────────────────────────────────────────────────────
// Invariant 1 — Agent Studio does not store provider keys
// ────────────────────────────────────────────────────────────────────

describe("Phase 42 invariant 1 — Agent Studio does not store provider keys", () => {
  it("ags_* schema has no apiKey / secret / password columns", () => {
    const src = read("drizzle/tables/agent-studio.ts");
    expect(src.length).toBeGreaterThan(0);
    // Check column NAME literals like `varchar("api_key", ...)`.
    // Note: AS *runtime* code can hold an apiKey in memory while talking
    // to a provider SDK — that's a legal in-flight use under D2's
    // `withProviderCredential`. The invariant is about *storage*: column
    // names in the AS schema, plus drizzle insert/update value objects
    // (covered below).
    const forbiddenColumnNames = [
      /["']api_key["']/i,
      /["']password["']/i,
      /["']client_secret["']/i,
      /["']bearer_token["']/i,
      /["']refresh_token["']/i,
    ];
    for (const re of forbiddenColumnNames) {
      expect(src, `forbidden column literal: ${re}`).not.toMatch(re);
    }
  });

  it("Agent Studio repository.ts does not pass secret-shaped fields into drizzle insert/update payloads", () => {
    // Repository is the single place where AS writes to ASDB. If a
    // secret-shaped field were being persisted, it would land here in
    // an `.insert(table).values({...})` or `.update(table).set({...})`
    // call. Runtime adapters and chat services hold keys in memory but
    // don't write to ASDB — they're excluded.
    const src = read("server/agent-studio/repository.ts");
    expect(src.length).toBeGreaterThan(0);

    // Match drizzle write entry-points and capture the trailing arg
    // object's first ~400 chars. We approximate the call shape because
    // a perfect AST parse is overkill for a one-off assertion.
    const writeEntryRe =
      /\.(?:values|set)\s*\(\s*\{([^}]{0,800})\}/g;
    const offenders: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = writeEntryRe.exec(src))) {
      const body = m[1];
      // Forbidden shorthand or assignment of secret-named fields.
      const forbiddenRe =
        /(?:^|[\s,{])(apiKey|secret|clientSecret|bearerToken|refreshToken|password)\s*[:,}]/;
      if (forbiddenRe.test(body)) {
        offenders.push(body.trim().slice(0, 80) + "...");
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────
// Invariant 2 — Agent Studio does not write catalog_entries
// ────────────────────────────────────────────────────────────────────

describe("Phase 42 invariant 2 — Agent Studio does not write catalog_entries", () => {
  it("no AS source file imports createCatalogEntry / updateCatalogEntry", () => {
    const files = walkTs("server/agent-studio", { skipTests: true });
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // Detect imports of the catalog write helpers.
      if (
        /from\s+["'][^"']*ai-types\/db["']/.test(src) &&
        /\b(createCatalogEntry|updateCatalogEntry)\b/.test(src)
      ) {
        offenders.push(relPath(f));
      }
      if (/\bcatalogEntries\b/.test(src) && /from\s+["'][^"']*drizzle\//.test(src)) {
        offenders.push(`${relPath(f)} (imports catalogEntries table)`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("no AS source file contains raw SQL writing to catalog_entries", () => {
    const files = walkTs("server/agent-studio", { skipTests: true });
    const offenders: string[] = [];
    const re = /(INSERT\s+INTO|UPDATE)\s+catalog_entries/i;
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (re.test(src)) offenders.push(relPath(f));
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────
// Invariant 3 — AI Types does not import Agent Studio internals
// ────────────────────────────────────────────────────────────────────

describe("Phase 42 invariant 3 — AI Types does not import AS internals", () => {
  it("no ai-types source imports from agent-studio's private paths", () => {
    const files = walkTs("server/ai-types", { skipTests: true });
    const offenders: string[] = [];
    // Allowed: `agent-studio/shared/*` (the typed contracts).
    // Forbidden: repository, db, services, manifest, boot, router.
    const importRe = /from\s+["']([^"']+)["']/g;
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      let m: RegExpExecArray | null;
      while ((m = importRe.exec(src))) {
        const spec = m[1];
        if (!spec.includes("agent-studio")) continue;
        // Allow shared/ subpath imports.
        if (/agent-studio\/shared(\/|$)/.test(spec)) continue;
        offenders.push(`${relPath(f)} → ${spec}`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────
// Invariant 4 — AI Types does not query ASDB
// ────────────────────────────────────────────────────────────────────

describe("Phase 42 invariant 4 — AI Types does not query ASDB", () => {
  it("no ai-types source imports getAsDb or references the asdb connection", () => {
    const files = walkTs("server/ai-types", { skipTests: true });
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (/\bgetAsDb\b/.test(src)) offenders.push(`${relPath(f)} (getAsDb)`);
      if (/agent-studio\/db\/connection/.test(src)) {
        offenders.push(`${relPath(f)} (agent-studio/db/connection)`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("no ai-types source contains raw SQL referencing ags_ tables", () => {
    const files = walkTs("server/ai-types", { skipTests: true });
    const offenders: string[] = [];
    // Skip JSDoc/block comments by stripping them, then scan for ags_<name>
    // where the surrounding context looks like SQL.
    const re = /\bFROM\s+ags_[a-z_]+|\bJOIN\s+ags_[a-z_]+|\bINTO\s+ags_[a-z_]+/i;
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const stripped = src
        .replace(/\/\/[^\n]*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");
      if (re.test(stripped)) offenders.push(relPath(f));
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────
// Invariant 5 — Model Access does not read process.env provider keys
// ────────────────────────────────────────────────────────────────────

describe("Phase 42 invariant 5 — Model Access does not read process.env provider keys", () => {
  it("no openrouter/model-access source reads process.env.<X>_API_KEY", () => {
    const files = walkTs("server/openrouter/model-access", { skipTests: true });
    expect(files.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    // Detect `process.env.OPENAI_API_KEY` and `process.env["OPENAI_API_KEY"]`
    // patterns (uppercase env-var-name shape ending in _API_KEY).
    const re =
      /process\.env(?:\.([A-Z0-9_]+)|\[\s*["']([A-Z0-9_]+)["']\s*\])/g;
    const NON_PROVIDER_KEYS = new Set([
      "BUILT_IN_FORGE_API_KEY",
      "OMNIRAG_API_KEY",
    ]);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const key = m[1] ?? m[2];
        if (!key) continue;
        if (!key.endsWith("_API_KEY")) continue;
        if (NON_PROVIDER_KEYS.has(key)) continue;
        offenders.push(`${relPath(f)} (process.env.${key})`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────
// Invariant 5b — Phase 27.7 broader Agent Studio scan
// ────────────────────────────────────────────────────────────────────
//
// After Phase 27.3 (chat-stream → Model Access) and 27.5 (services/chat.ts
// fallback removal) and Phase 29.0a (LR-01 simulation migration onto
// Model Access primitives + adapter dead-code purge), there is NO
// remaining LR-01 surface inside Agent Studio. The allowlist is empty
// by design: any Agent Studio file that reads `process.env.<X>_API_KEY`
// or instantiates `new OpenAI({...})` is now a regression and must
// fail CI.

describe("Phase 27.7 + 29.0a invariant 5b — Agent Studio raw provider-key surface is fully closed", () => {
  // Phase 29.0a deleted `openllm-runtime-adapter.ts` and
  // `openai-direct-adapter.ts` outright; simulation now resolves
  // credentials via Model Access. No allowlist entries remain.
  const ALLOWED_AS_PATHS = new Set<string>([]);

  const NON_PROVIDER_KEYS = new Set(["BUILT_IN_FORGE_API_KEY", "OMNIRAG_API_KEY"]);

  it("no Agent Studio source outside the simulation allowlist reads process.env.<X>_API_KEY", () => {
    const files = walkTs("server/agent-studio", { skipTests: true });
    expect(files.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    const re =
      /process\.env(?:\.([A-Z0-9_]+)|\[\s*["']([A-Z0-9_]+)["']\s*\])/g;
    for (const f of files) {
      const rel = relPath(f);
      if (ALLOWED_AS_PATHS.has(rel)) continue;
      const src = readFileSync(f, "utf8");
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const key = m[1] ?? m[2];
        if (!key) continue;
        if (!key.endsWith("_API_KEY")) continue;
        if (NON_PROVIDER_KEYS.has(key)) continue;
        offenders.push(`${rel} (process.env.${key})`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("no Agent Studio source outside the simulation allowlist instantiates `new OpenAI(`", () => {
    const files = walkTs("server/agent-studio", { skipTests: true });
    const offenders: string[] = [];
    // Match `new OpenAI(` — the SDK class instantiation that takes an
    // apiKey. Comments and imports never match this exact form.
    const re = /\bnew\s+OpenAI\s*\(/;
    for (const f of files) {
      const rel = relPath(f);
      if (ALLOWED_AS_PATHS.has(rel)) continue;
      const src = readFileSync(f, "utf8");
      // Strip comments first so docstrings mentioning "new OpenAI(" don't trigger.
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      if (re.test(stripped)) {
        offenders.push(rel);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("no Agent Studio source imports `resolveProviderApiKey` (function deleted in Phase 29.0a)", () => {
    const files = walkTs("server/agent-studio", { skipTests: true });
    const offenders: string[] = [];
    for (const f of files) {
      const rel = relPath(f);
      if (ALLOWED_AS_PATHS.has(rel)) continue;
      const src = readFileSync(f, "utf8");
      // Match a real import of resolveProviderApiKey (not a doc/comment).
      // The function was deleted entirely in Phase 29.0a; any restored
      // import is a regression of the LR-01 closure.
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      if (/\bimport\b[^;]*\bresolveProviderApiKey\b/.test(stripped)) {
        offenders.push(rel);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("no source defines `resolveProviderApiKey` / `runViaOpenllmAgent` / `runViaOpenAIDirect` / `resolveOpenllmEndpoint` (deleted in Phase 29.0a)", () => {
    const files = [
      ...walkTs("server/agent-studio", { skipTests: true }),
      ...walkTs("server/openrouter", { skipTests: true }),
    ];
    const offenders: string[] = [];
    const deleted = [
      "resolveProviderApiKey",
      "runViaOpenllmAgent",
      "runViaOpenAIDirect",
      "resolveOpenllmEndpoint",
    ];
    for (const f of files) {
      const rel = relPath(f);
      const src = readFileSync(f, "utf8");
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      for (const name of deleted) {
        // Match a real definition (export function / function / const X =).
        const re = new RegExp(`\\b(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\b|\\bconst\\s+${name}\\s*=`);
        if (re.test(stripped)) {
          offenders.push(`${rel} (defines ${name})`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────
// Invariant 6 — Provider Connections public API returns no secrets
// ────────────────────────────────────────────────────────────────────

describe("Phase 42 invariant 6 — Provider Connections public API returns no secrets", () => {
  it("ProviderConnectionRef has no apiKey/secret/credential field", () => {
    const rawSrc = read("server/provider-connections/public-api.ts");
    expect(rawSrc.length).toBeGreaterThan(0);
    // Strip JSDoc + line comments before scanning — docstrings legitimately
    // mention "secret" and "missing-secret rows" while documenting the
    // no-secret contract. We're checking *field names* only.
    const src = rawSrc
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    const m = src.match(
      /export\s+interface\s+ProviderConnectionRef\s*\{([\s\S]*?)\n\}/m,
    );
    expect(m, "ProviderConnectionRef interface not found").not.toBeNull();
    const body = m![1];
    // Reject any field whose name suggests secret material.
    const forbiddenNames = [
      /\bapiKey\b/,
      /\bsecret\b/,
      /\bcredentials?\b/,
      /\bbearerToken\b/,
      /\bclientSecret\b/,
      /\bpassword\b/,
    ];
    for (const re of forbiddenNames) {
      expect(body, `forbidden field in ProviderConnectionRef: ${re}`).not.toMatch(
        re,
      );
    }
  });

  it("all exported types in public-api.ts are free of secret-shaped field names", () => {
    const src = read("server/provider-connections/public-api.ts");
    // Strip JSDoc comments so docstrings mentioning "secret" don't trigger.
    const stripped = src
      .replace(/\/\*\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    // Pull every `export interface ... { ... }` block and check field names.
    const interfaceRe = /export\s+interface\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
    let im: RegExpExecArray | null;
    const offenders: string[] = [];
    while ((im = interfaceRe.exec(stripped))) {
      const name = im[1];
      const body = im[2];
      // Field names: lines like `  fieldName: type` (allow `?:`).
      const fieldRe = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\??:/gm;
      let fm: RegExpExecArray | null;
      while ((fm = fieldRe.exec(body))) {
        const f = fm[1];
        if (
          /^(apiKey|secret|credentials?|bearerToken|clientSecret|password)$/.test(
            f,
          )
        ) {
          offenders.push(`${name}.${f}`);
        }
      }
    }
    expect(offenders, offenders.join(", ")).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────
// Invariant 7 — Frontend cross-module boundary
// ────────────────────────────────────────────────────────────────────

describe("Phase 42 invariant 7 — frontend cross-module boundary is enforced", () => {
  it("package.json wires `check:cross-module-links` into validation", () => {
    const pkg = JSON.parse(read("package.json"));
    const scripts = pkg.scripts ?? {};
    // Either as its own script or composed into check:frontend-modularity.
    const front = scripts["check:frontend-modularity"] ?? "";
    const cml = scripts["check:cross-module-links"] ?? "";
    const wired =
      cml.length > 0 ||
      front.includes("check-cross-module-links") ||
      front.includes("cross-module-links");
    expect(
      wired,
      `expected check:cross-module-links to be wired into package.json scripts`,
    ).toBe(true);
  });

  it("the cross-module-links script exists at the wired location", () => {
    const src = read("scripts/check-cross-module-links.ts");
    expect(src.length).toBeGreaterThan(0);
  });
});
