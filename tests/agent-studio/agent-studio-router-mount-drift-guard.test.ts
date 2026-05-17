/**
 * Comprehensive mount-drift guard for Agent Studio service routers.
 *
 * Closes the failure mode behind PRs #1434 (graphChangeProposals) +
 * #1435 (vault — entire vault subsystem unreachable). Per
 * `reference_tsconfig_excludes_hide_trpc_mount_drift`, `client/src/**`
 * is excluded from typecheck, so client `trpc.<module>.<sub>.<proc>`
 * calls compile against unmounted sub-routers without complaint —
 * only manifesting as runtime 404. Per-router
 * `*-router-mounted.test.ts` files catch one router at a time, but
 * future authors might forget to add the test when they add a new
 * router file.
 *
 * This test scans the entire `server/agent-studio/services/**` tree
 * for `export const \w+Router = router(...)` declarations and
 * asserts each one is **both** imported AND mounted as a key in the
 * top-level `agentStudioRouter` composition.
 *
 * **When this test fails**, the fix is one of:
 *
 *   1. Add the missing import + mount key in
 *      `server/agent-studio/api/router.ts` — typically what's needed.
 *      The mount key should match what the client uses
 *      (`trpc.agentStudio.<key>.*`).
 *   2. If the router is genuinely unused (orphan, leftover from a
 *      refactor), delete the file. Don't suppress the test.
 *   3. If the router is mounted via a different path (e.g. nested
 *      under another router as a sub-key, or mounted via the module
 *      manifest composer), document that in this test's
 *      KNOWN_NON_DIRECT_MOUNTS list with a justifying comment.
 *
 * Audit one-liner equivalent (per `feedback_mount_drift_audit_pattern`):
 *
 *   find server/agent-studio/services -name "*router.ts" -type f | while read f; do
 *     name=$(grep -oE "export const \w+Router" "$f" | head -1 | awk '{print $3}')
 *     [ -z "$name" ] && continue
 *     mounted=$(grep -c "$name" server/agent-studio/api/router.ts)
 *     echo "$mounted $name $f"
 *   done | awk '$1==0'
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const SERVICES_ROOT = join(REPO_ROOT, "server/agent-studio/services");
const API_ROUTER_PATH = join(REPO_ROOT, "server/agent-studio/api/router.ts");

/**
 * Routers that intentionally don't appear in `api/router.ts` and have
 * a documented alternate mount path. Each entry MUST have a comment
 * justifying the exception — otherwise it's just a mount-drift bug
 * pretending to be intentional. Keep this list as short as possible.
 */
const KNOWN_NON_DIRECT_MOUNTS: ReadonlyArray<{
  readonly routerName: string;
  readonly reason: string;
}> = [
  // (empty as of 2026-05-17 — every services/** router is directly
  // mounted in api/router.ts after PRs #1434 + #1435 closed the
  // graphChangeProposals + vault drift)
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
      out.push(...walkRouterFiles(full));
    } else if (entry.endsWith(".ts") && /router/i.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function extractRouterExportName(filePath: string): string | null {
  let src: string;
  try {
    src = readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
  const m = src.match(/export const (\w+Router)\s*=\s*router\(/);
  return m ? m[1]! : null;
}

describe("Agent Studio router mount-drift guard (comprehensive)", () => {
  it("every router export under services/** is imported AND mounted in api/router.ts", () => {
    const routerFiles = walkRouterFiles(SERVICES_ROOT);
    expect(routerFiles.length).toBeGreaterThan(0); // sanity: services exist
    const apiRouterSrc = readFileSync(API_ROUTER_PATH, "utf-8");

    const exempt = new Set(
      KNOWN_NON_DIRECT_MOUNTS.map((e) => e.routerName),
    );
    const orphans: ReadonlyArray<{
      routerName: string;
      filePath: string;
      missingImport: boolean;
      missingMountKey: boolean;
    }> = routerFiles
      .map((filePath) => {
        const routerName = extractRouterExportName(filePath);
        if (!routerName) return null;
        if (exempt.has(routerName)) return null;
        // Import line check: any line like
        // `import { fooRouter } from "../services/.../router";`
        const importPattern = new RegExp(
          `import\\s+\\{[^}]*\\b${routerName}\\b[^}]*\\}`,
        );
        // Mount key check: `<key>: <routerName>,`
        const mountPattern = new RegExp(`:\\s*${routerName}\\s*,`);
        return {
          routerName,
          filePath: relative(REPO_ROOT, filePath),
          missingImport: !importPattern.test(apiRouterSrc),
          missingMountKey: !mountPattern.test(apiRouterSrc),
        };
      })
      .filter(
        (
          x,
        ): x is {
          routerName: string;
          filePath: string;
          missingImport: boolean;
          missingMountKey: boolean;
        } => x !== null && (x.missingImport || x.missingMountKey),
      );

    if (orphans.length > 0) {
      const lines = orphans
        .map(
          (o) =>
            `  - ${o.routerName} (${o.filePath}) — missing: ${[
              o.missingImport ? "import" : null,
              o.missingMountKey ? "mount-key" : null,
            ]
              .filter(Boolean)
              .join(", ")}`,
        )
        .join("\n");
      throw new Error(
        `Found ${orphans.length} orphan router(s) without a corresponding ` +
          `import + mount key in server/agent-studio/api/router.ts:\n${lines}\n\n` +
          `Per reference_tsconfig_excludes_hide_trpc_mount_drift, unmounted ` +
          `routers compile against client trpc.<module>.<sub>.<proc> calls ` +
          `without a type error — but every such call would 404 at runtime. ` +
          `Either add the mount in api/router.ts, delete the orphan router ` +
          `file, or add an entry to KNOWN_NON_DIRECT_MOUNTS with a comment ` +
          `justifying the exception.`,
      );
    }

    // Sanity: with no exemptions today, every detected router should
    // map to a mount. Bumping this assertion if KNOWN_NON_DIRECT_MOUNTS
    // ever needs an entry signals the architecture changed.
    expect(orphans.length).toBe(0);
  });
});
