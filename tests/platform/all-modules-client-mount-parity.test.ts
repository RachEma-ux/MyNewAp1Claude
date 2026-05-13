// All-modules client → server mount-parity audit.
//
// Generalization of agent-studio-client-mount-parity.test.ts (#711 +
// #712) to all 15 module routers in MODULE_ROUTERS. Same invariant —
// every client `trpc.<module>.<sub>.*` reference must resolve to a
// top-level key on the corresponding module router — applied to the
// entire tRPC surface, not just agentStudio.
//
// Why this scope: PR #710 fixed a 5-month-old latent bug where
// promotionRouter was defined but never mounted on agentStudioRouter,
// surviving because tsconfig.json excludes `services/**` and
// `client/src/**` from the typecheck. The same drift class could
// recur on any of the other 14 modules; this test scans them all in
// one pass.
//
// Method is source-scan only (no DB / no governance loader / no
// runtime tRPC tree boot). For each module:
//
//   1. Walk client/src for `trpc.<module>.<sub>.*` references.
//   2. Read the module's top-level router file; locate
//      `export const <module>Router = router({...})` via brace-balanced
//      walk.
//   3. Inside the composition body, depth-aware-scan for top-level keys
//      with one of three legitimate value shapes: sub-router mount
//      (`<key>: <X>Router`), inline router (`<key>: router({...})`),
//      or direct procedure (`<key>: protectedProcedure` /
//      `<key>: governedProcedure` etc.).
//   4. Diff the two sets; the diff must be empty.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it, expect } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..");
const CLIENT_SRC = join(REPO_ROOT, "client", "src");

/**
 * Maps each module key (matches the key in MODULE_ROUTERS) to the
 * file that declares its top-level router. Drift here = one entry
 * update + a re-run.
 */
const MODULE_ROUTER_PATHS: Readonly<Record<string, string>> = {
  prm: "server/prm/prm.router.ts",
  psm: "server/psm/psm.router.ts",
  codeStudio: "server/code-studio/api/router.ts",
  agentStudio: "server/agent-studio/api/router.ts",
  sandboxWf: "server/sandbox-wf/router.ts",
  openRouter: "server/openrouter/router.ts",
  ps: "server/ps/ps.router.ts",
  hr: "server/hr/router.ts",
  organizationManagement: "server/organization-management/router.ts",
  cultureValues: "server/culture-values/router.ts",
  aiTypes: "server/ai-types/router.ts",
  kgraAgent: "server/kgra-agent/router.ts",
  communication: "server/communication/router.ts",
  pmCentral: "server/pm-central/router.ts",
  dataAnalysis: "server/data-analysis/router.ts",
};

const MODULES = Object.keys(MODULE_ROUTER_PATHS);

// Per-module allowlist for deliberate orphans. Empty today; entries
// must carry a comment naming the PR that recorded the orphan.
const ALLOWED_ORPHANS: Readonly<Record<string, ReadonlySet<string>>> = {};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (
      entry.endsWith(".tsx") ||
      entry.endsWith(".ts") ||
      entry.endsWith(".jsx") ||
      entry.endsWith(".js")
    ) {
      out.push(p);
    }
  }
  return out;
}

function collectClientReferencesForModule(
  module: string,
  clientFiles: string[],
): Map<string, string[]> {
  const re = new RegExp(`\\btrpc\\.${module}\\.([a-zA-Z]+)\\.`, "g");
  const out = new Map<string, string[]>();
  for (const file of clientFiles) {
    const src = readFileSync(file, "utf8");
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(src)) !== null) {
      const sub = m[1];
      const rel = relative(REPO_ROOT, file);
      if (!out.has(sub)) out.set(sub, []);
      const arr = out.get(sub)!;
      if (!arr.includes(rel)) arr.push(rel);
    }
  }
  return out;
}

function routerVarName(module: string): string {
  // `module` is already in the canonical camelCase form (e.g. `agentStudio`,
  // `codeStudio`). The router variable convention is `<module>Router`.
  return `${module}Router`;
}

function collectMountedKeys(module: string): Set<string> | null {
  const path = join(REPO_ROOT, MODULE_ROUTER_PATHS[module]);
  const src = readFileSync(path, "utf8");
  const varName = routerVarName(module);
  const declRe = new RegExp(
    `export\\s+const\\s+${varName}\\s*=\\s*router\\s*\\(\\s*\\{`,
  );
  const m = declRe.exec(src);
  if (!m) return null;
  const openBraceIdx = src.indexOf("{", m.index);
  let depth = 0;
  let endIdx = -1;
  for (let i = openBraceIdx; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx < 0) return null;
  const body = src.slice(openBraceIdx, endIdx + 1);
  const out = new Set<string>();

  // Walk line-by-line tracking depth so only outer-composition keys
  // are collected (depth === 1 means inside the outer braces, not a
  // nested inline router).
  const lines = body.split("\n");
  let depth2 = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (depth2 === 1) {
      const km = trimmed.match(
        /^([a-zA-Z][a-zA-Z0-9]*)\s*:\s*(?:[a-zA-Z][a-zA-Z0-9]*Router\b|router\s*\(|(?:public|protected|admin|governed)Procedure\b)/,
      );
      if (km) out.add(km[1]);
    }
    for (const ch of line) {
      if (ch === "{") depth2++;
      else if (ch === "}") depth2--;
    }
  }
  return out;
}

describe("module routers — client → server mount parity across all 15 modules", () => {
  const clientFiles = walk(CLIENT_SRC);

  it("scans 15 modules", () => {
    // Lockstep with server/platform/modules/module-routers.ts. If a
    // new module lands, add it to MODULE_ROUTER_PATHS above.
    expect(MODULES).toHaveLength(15);
  });

  for (const module of MODULES) {
    describe(`module: ${module}`, () => {
      const clientRefs = collectClientReferencesForModule(module, clientFiles);
      const mounted = collectMountedKeys(module);

      it("router declaration is locatable", () => {
        expect(
          mounted,
          `Could not find \`export const ${routerVarName(module)} = router({...})\` ` +
            `at ${MODULE_ROUTER_PATHS[module]}. If the router was moved/renamed, ` +
            `update MODULE_ROUTER_PATHS in this test.`,
        ).not.toBeNull();
      });

      it("every client reference has a matching top-level key", () => {
        if (!mounted) return; // covered by previous assertion
        const orphans: string[] = [];
        const allowed = ALLOWED_ORPHANS[module] ?? new Set<string>();
        for (const [sub, files] of clientRefs) {
          if (mounted.has(sub)) continue;
          if (allowed.has(sub)) continue;
          orphans.push(
            `  trpc.${module}.${sub} — referenced by ${files.length} file(s): ${files
              .slice(0, 3)
              .join(", ")}${files.length > 3 ? ", …" : ""}`,
          );
        }
        expect(
          orphans,
          orphans.length === 0
            ? ""
            : `Client references to unmounted ${module} keys:\n${orphans.join("\n")}\n\nFix one of:\n` +
                `  1. Add the missing key+value pair to the ${module}Router composition (sub-router mount, inline router, or direct procedure)\n` +
                `  2. Remove the orphan client reference if the surface was retired\n` +
                `  3. Add an entry to ALLOWED_ORPHANS for this module with a comment naming the PR that decided the orphan is intentional`,
        ).toEqual([]);
      });
    });
  }
});
