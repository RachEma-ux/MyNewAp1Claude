/**
 * Top-level router mount-drift guard.
 *
 * Analog of `tests/agent-studio/agent-studio-router-mount-drift-guard.test.ts`
 * (PR #1437) but for **top-level** routers — `server/<module>/router.ts`,
 * `server/<module>/<name>-router.ts`, etc. — that mount into
 * `server/routers.ts` (direct app-router composition) or
 * `server/platform/modules/module-routers.ts` (manifest-composer
 * dynamic mounts) or `server/agent-studio/api/router.ts` (nested
 * sub-mount under agentStudio for cross-cutting helpers).
 *
 * Closes the "what if someone adds a new top-level router file but
 * forgets to mount it" failure mode. The existing
 * `all-modules-client-mount-parity.test.ts` (#714) catches orphans
 * **from the client side** — but only when a client actually tries
 * to call them. An orphan with no clients (yet) sneaks through and
 * accumulates dead code; if a client later starts calling it, the
 * call 404s at runtime per the
 * `reference_tsconfig_excludes_hide_trpc_mount_drift` pattern.
 *
 * The guard scans `server/**` for files matching `*router*.ts`,
 * extracts `export const \w+Router = router(...)` declarations,
 * and asserts each is referenced by at least one of the three
 * canonical mount paths above.
 *
 * Excludes:
 *
 *   - `server/agent-studio/services/**` — covered by PR #1437
 *     comprehensive guard at finer-grained scope (asserts the
 *     specific mount key in api/router.ts, not just existence of
 *     the import).
 *   - `*.test.ts` / `*.spec.ts` — test files frequently define
 *     local test routers that aren't meant to be mounted.
 *   - Adapter/wiring files matching `*-router-adapter.ts` or
 *     `*router-types.ts` — type-only declarations don't have a
 *     `router(...)` call.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../..");
const SERVER_ROOT = join(REPO_ROOT, "server");

const MOUNT_FILES = [
  join(REPO_ROOT, "server/routers.ts"),
  join(REPO_ROOT, "server/platform/modules/module-routers.ts"),
  join(REPO_ROOT, "server/agent-studio/api/router.ts"),
] as const;

/**
 * Subdirectories where the per-router-files mount-drift class is
 * covered by a more specific guard. The agent-studio guard (#1437)
 * is finer-grained (asserts the mount key); skipping that subtree
 * here avoids duplicate coverage.
 */
const COVERED_BY_OTHER_GUARDS = [
  join(REPO_ROOT, "server/agent-studio/services"),
] as const;

/**
 * Routers that intentionally don't appear in any of the three
 * canonical mount paths. Each entry must have a comment naming the
 * justifying reason. Keep this list as short as possible.
 */
const KNOWN_NON_DIRECT_MOUNTS: ReadonlyArray<{
  readonly routerName: string;
  readonly reason: string;
}> = [
  // (empty as of 2026-05-17 — Python audit during the autonomous
  // burst found 0 orphans across server/ after the agent-studio
  // mount-drift fixes #1434 + #1435)
];

function walkRouterFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (entry === "node_modules") continue;
      if (COVERED_BY_OTHER_GUARDS.some((p) => full === p || full.startsWith(p + "/"))) continue;
      out.push(...walkRouterFiles(full));
    } else if (entry.endsWith(".ts") && /router/i.test(entry)) {
      if (entry.endsWith(".test.ts") || entry.endsWith(".spec.ts")) continue;
      out.push(full);
    }
  }
  return out;
}

function extractRouterExportNames(filePath: string): string[] {
  let src: string;
  try {
    src = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }
  const names: string[] = [];
  const re = /export const (\w+Router)\s*=\s*router\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    names.push(m[1]!);
  }
  return names;
}

function readAllMountSources(): string {
  return MOUNT_FILES.map((p) => {
    try {
      return readFileSync(p, "utf-8");
    } catch {
      return "";
    }
  }).join("\n\n");
}

describe("top-level router mount-drift guard", () => {
  it("every router export under server/** (excl. agent-studio/services) is imported by at least one canonical mount file", () => {
    const routerFiles = walkRouterFiles(SERVER_ROOT);
    expect(routerFiles.length).toBeGreaterThan(0);

    const exempt = new Set(KNOWN_NON_DIRECT_MOUNTS.map((e) => e.routerName));
    const mountSrc = readAllMountSources();

    const orphans: ReadonlyArray<{
      routerName: string;
      filePath: string;
    }> = routerFiles
      .flatMap((filePath) =>
        extractRouterExportNames(filePath).map((routerName) => ({
          routerName,
          filePath: relative(REPO_ROOT, filePath),
        })),
      )
      .filter(({ routerName }) => !exempt.has(routerName))
      .filter(({ routerName }) => {
        // Reference check: name appears in at least one mount file.
        const pattern = new RegExp(`\\b${routerName}\\b`);
        return !pattern.test(mountSrc);
      });

    if (orphans.length > 0) {
      const lines = orphans
        .map((o) => `  - ${o.routerName} (${o.filePath})`)
        .join("\n");
      throw new Error(
        `Found ${orphans.length} top-level router(s) not referenced by any canonical mount file:\n` +
          `${lines}\n\n` +
          `Canonical mount paths checked:\n` +
          MOUNT_FILES.map((p) => `  - ${relative(REPO_ROOT, p)}`).join("\n") +
          `\n\nFix one of:\n` +
          `  1. Add the missing import + mount key in the appropriate canonical file\n` +
          `  2. Delete the orphan router file (if genuinely unused)\n` +
          `  3. Add an entry to KNOWN_NON_DIRECT_MOUNTS with a justifying comment`,
      );
    }

    expect(orphans.length).toBe(0);
  });
});
