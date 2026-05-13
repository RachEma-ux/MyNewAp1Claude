// agentStudio client → server mount-parity audit.
//
// Origin: PR #710 fixed a silent latent bug — promotionRouter was
// imported and consumed by the client at trpc.agentStudio.promotion.*
// but never mounted on agentStudioRouter. The gap survived ~5 months
// because tsconfig.json excludes services/** + client/src/** from
// typecheck, so the unmounted call typechecked against the AppRouter
// shape but failed at runtime with PROCEDURE_NOT_FOUND.
//
// This test enforces the parity invariant repo-wide:
//
//   FOR EVERY `trpc.agentStudio.<sub>.*` reference in client/src,
//   THERE MUST BE a `<sub>: <something>Router` line inside the
//   agentStudioRouter composition.
//
// Catches future drift in either direction:
//
//   - A client adds `trpc.agentStudio.foo.bar.useQuery(...)` and
//     nobody mounts `foo: fooRouter` → this test fires.
//   - A mount is removed but a client still calls into it → this
//     test fires.
//
// Method is a regex scan over the client tree + a regex scan over
// the composition block — no runtime tRPC tree load. Fast.
//
// If this test fires for a NEW reference, the fix is one of:
//
//   1. Add the missing mount line on agentStudioRouter.
//   2. Delete the orphan client reference if the surface was retired.
//   3. Add a per-key allowance below if the reference is a deliberate
//      type-string fallback (very rare; the tsconfig excludes mean
//      this can compile but not work).
//
// Mirrors the cycle-3 governed-procedure-coverage.test.ts pattern:
// an inventory + repo-scan + lockstep assertion.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it, expect } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..");
const CLIENT_SRC = join(REPO_ROOT, "client", "src");
const ROUTER_PATH = join(
  REPO_ROOT,
  "server",
  "agent-studio",
  "api",
  "router.ts",
);

const TRPC_AGENT_STUDIO_RE = /\btrpc\.agentStudio\.([a-zA-Z]+)\./g;

// Keys that intentionally do NOT need a sub-router mount. Empty for
// now — every observed reference today should resolve. If you add a
// key here, leave a comment naming the deliberate orphan + the PR
// that recorded the decision.
const ALLOWED_ORPHANS: ReadonlySet<string> = new Set();

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

function collectClientReferences(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const files = walk(CLIENT_SRC);
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    let m: RegExpExecArray | null;
    TRPC_AGENT_STUDIO_RE.lastIndex = 0;
    while ((m = TRPC_AGENT_STUDIO_RE.exec(src)) !== null) {
      const sub = m[1];
      const rel = relative(REPO_ROOT, file);
      if (!out.has(sub)) out.set(sub, []);
      const arr = out.get(sub)!;
      if (!arr.includes(rel)) arr.push(rel);
    }
  }
  return out;
}

function collectMountedSubrouters(): Set<string> {
  const src = readFileSync(ROUTER_PATH, "utf8");
  // The agentStudioRouter is the last `router({...})` block in the
  // file. Find it via brace-balanced walk and scan only its body.
  const composeStart = src.lastIndexOf("router({");
  expect(composeStart).toBeGreaterThanOrEqual(0);
  const openBraceIdx = src.indexOf("{", composeStart);
  let depth = 0;
  let composeEnd = -1;
  for (let i = openBraceIdx; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        composeEnd = i;
        break;
      }
    }
  }
  expect(composeEnd).toBeGreaterThan(composeStart);
  const composeBody = src.slice(composeStart, composeEnd + 1);
  const out = new Set<string>();
  // Capture `<key>: <Identifier>Router` lines inside the composition.
  // Matches "  foo: fooRouter," and "  foo: fooRouter\n".
  const mountRe = /^\s*([a-zA-Z][a-zA-Z0-9]*)\s*:\s*[a-zA-Z][a-zA-Z0-9]*Router\b/gm;
  let m: RegExpExecArray | null;
  while ((m = mountRe.exec(composeBody)) !== null) {
    out.add(m[1]);
  }
  return out;
}

describe("agentStudio — client → server mount parity", () => {
  const clientRefs = collectClientReferences();
  const mounted = collectMountedSubrouters();

  it("scans at least 15 distinct sub-router references in client/src", () => {
    // Sanity guard against the regex silently going to zero. The
    // observed count at PR #710 was 47.
    expect(clientRefs.size).toBeGreaterThanOrEqual(15);
  });

  it("scans at least 30 mounted sub-routers in agentStudioRouter", () => {
    expect(mounted.size).toBeGreaterThanOrEqual(30);
  });

  it("every client `trpc.agentStudio.X.*` reference has a matching mount on agentStudioRouter", () => {
    const orphans: string[] = [];
    for (const [sub, files] of clientRefs) {
      if (mounted.has(sub)) continue;
      if (ALLOWED_ORPHANS.has(sub)) continue;
      orphans.push(
        `  agentStudio.${sub} — referenced by ${files.length} file(s): ${files
          .slice(0, 3)
          .join(", ")}${files.length > 3 ? ", …" : ""}`,
      );
    }
    expect(
      orphans,
      orphans.length === 0
        ? ""
        : "Client references to unmounted agentStudio sub-routers:\n" +
            orphans.join("\n") +
            "\n\nFix one of:\n" +
            "  1. Add `<key>: <Router>` to the agentStudioRouter composition in server/agent-studio/api/router.ts\n" +
            "  2. Remove the orphan client reference if the surface was retired\n" +
            "  3. Add the key to ALLOWED_ORPHANS in this test file with a comment naming the deliberate orphan + the PR that recorded the decision",
    ).toEqual([]);
  });
});
