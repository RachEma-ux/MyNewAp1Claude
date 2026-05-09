/**
 * H1-c6 (cycle-6 audit `/sdcard/Download/RUNTIME_GATE_AUDIT_2026-05-09.md`
 * §H1-c6) — legacy decide path removed.
 *
 * Pre-cycle-6 `repo.decidePendingPermissionRequest` was the second
 * decide path on `agsPendingPermissionRequests`. It updated the row
 * but did NOT write the canonical audit row in
 * `agsRuntimePolicyEvents` (D-APP-EXT-6). The 2 callers
 * (`api/router.ts:permissions.decide` + `services/simulation.ts`
 * system-timeout flip) silently bypassed the audit ledger. Mirrors
 * cycle-4 C1-c4 — different operator surface (legacy permissions
 * router vs publish-workflow), same gap shape.
 *
 * Post-cycle-6 (this PR):
 *   - Both callers migrated to
 *     `services/approval/approval-gate.ts → decideApprovalRequest`,
 *     which writes the audit row + emits the resume bus event +
 *     handles the M5-c4 concurrent-decide forensic case.
 *   - The legacy fn `decidePendingPermissionRequest` was DELETED
 *     from `repository.ts`. tsc would catch any new caller; this
 *     lockstep is belt-and-braces (catches a future PR that
 *     re-adds the function via copy-paste before tsc runs).
 *
 * This test:
 *   1. Asserts the symbol is gone from `repository.ts`.
 *   2. Asserts no caller of `decidePendingPermissionRequest` exists
 *      anywhere in `server/`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const REPO_ROOT = process.cwd();
const REPOSITORY_PATH = join(
  REPO_ROOT,
  "server/agent-studio/repository.ts",
);
const SERVER_DIR = join(REPO_ROOT, "server");

function walkTsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git" || entry === "dist") continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      // Skip broken symlinks / unreadable entries (e.g. dev-only
      // server/_core/public symlink that may not exist on every
      // checkout). The lockstep is about source-tree contents, not
      // build artifacts.
      continue;
    }
    if (st.isDirectory()) {
      walkTsFiles(full, acc);
    } else if (
      (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
      !entry.endsWith(".d.ts")
    ) {
      acc.push(full);
    }
  }
  return acc;
}

describe("H1-c6 — legacy decidePendingPermissionRequest is removed", () => {
  it("repository.ts no longer exports `decidePendingPermissionRequest`", () => {
    const src = readFileSync(REPOSITORY_PATH, "utf8");
    expect(
      src,
      "H1-c6 violated: `repository.ts` re-introduced " +
        "`decidePendingPermissionRequest`. The legacy fn was a " +
        "second decide path that bypassed the canonical audit " +
        "ledger. All deciders must go through " +
        "`services/approval/approval-gate.ts → decideApprovalRequest` " +
        "so the agsRuntimePolicyEvents state-transition row is written.",
    ).not.toMatch(/export\s+(?:async\s+)?function\s+decidePendingPermissionRequest\b/);
  });

  it("no file under server/ calls decidePendingPermissionRequest", () => {
    const callers: string[] = [];
    for (const file of walkTsFiles(SERVER_DIR)) {
      // Allow the closure-doc comment in repository.ts itself.
      if (file === REPOSITORY_PATH) continue;
      const src = readFileSync(file, "utf8");
      // Strip block + line comments so doc-mentions don't false-positive.
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      if (/\bdecidePendingPermissionRequest\s*\(/.test(stripped)) {
        callers.push(relative(REPO_ROOT, file));
      }
    }
    expect(
      callers,
      "H1-c6 violated: at least one file under server/ still calls " +
        "the deleted `decidePendingPermissionRequest`. Migrate the " +
        "caller to `decideApprovalRequest` from " +
        "`services/approval/approval-gate.ts`. Found in:\n" +
        callers.map((p) => `  - ${p}`).join("\n"),
    ).toEqual([]);
  });
});
