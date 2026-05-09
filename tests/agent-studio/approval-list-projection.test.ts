/**
 * H2-c6 (cycle-6 audit `/sdcard/Download/RUNTIME_GATE_AUDIT_2026-05-09.md`
 * §H2-c6) — safe-projection lockstep for approval list endpoints.
 *
 * Pre-cycle-6 the API endpoints `toolApprovals.list`,
 * `toolApprovals.listByDraft`, and `toolApprovals.getByHash` used
 * bare `.select()` on `agsPendingPermissionRequests`, returning
 * every column — including `rawPayload` (full request payload) and
 * `proposedToolCallJson` (full Phase 8 envelope). Both fields can
 * contain unredacted credentials/secrets the LLM emitted as tool
 * arguments. Same gap shape as the legacy `permissions.listPending`
 * → `repo.listPendingPermissionRequests`.
 *
 * Post-cycle-6: the API router defines `PUBLIC_APPROVAL_COLUMNS` and
 * uses it in `.select(PUBLIC_APPROVAL_COLUMNS)`. The repository layer
 * mirrors the projection so `getPendingPermissionRequestById` and
 * `listPendingPermissionRequests` are also safe by default.
 *
 * This test pins:
 *   1. The router file defines the projection map (and never uses
 *      bare `.select()` against agsPendingPermissionRequests).
 *   2. The repository functions feeding the legacy permissions API
 *      (getPendingPermissionRequestById + listPendingPermissionRequests)
 *      use the same projection shape — no bare `.select()` against
 *      agsPendingPermissionRequests in their bodies.
 *   3. The projection includes the safe columns the operator UI
 *      consumes; it does NOT include `rawPayload` or
 *      `proposedToolCallJson`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROUTER_PATH = join(
  process.cwd(),
  "server/agent-studio/api/tool-approvals-router.ts",
);
const REPO_PATH = join(
  process.cwd(),
  "server/agent-studio/repository.ts",
);

function strip(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("H2-c6 — approval list endpoints project safe columns only", () => {
  const routerSrc = readFileSync(ROUTER_PATH, "utf8");
  const routerStripped = strip(routerSrc);
  const repoSrc = readFileSync(REPO_PATH, "utf8");
  const repoStripped = strip(repoSrc);

  it("router file carries the H2-c6 closure marker", () => {
    expect(
      routerSrc,
      "H2-c6 violated: tool-approvals-router.ts must carry the " +
        "`H2-c6` closure marker so a future audit can trace the " +
        "projection back to its origin item.",
    ).toMatch(/H2-c6\b/);
  });

  it("router defines PUBLIC_APPROVAL_COLUMNS projection map", () => {
    expect(
      routerSrc,
      "H2-c6 violated: tool-approvals-router.ts must define a " +
        "`PUBLIC_APPROVAL_COLUMNS` projection map. Without it, future " +
        "endpoints have no canonical safe-projection to use and may " +
        "drift back to bare `.select()`.",
    ).toMatch(/PUBLIC_APPROVAL_COLUMNS/);
  });

  it("PUBLIC_APPROVAL_COLUMNS does NOT include rawPayload or proposedToolCallJson", () => {
    // Find the PUBLIC_APPROVAL_COLUMNS block (router); assert the
    // unsafe columns aren't keys.
    const blockMatch = routerStripped.match(
      /const\s+PUBLIC_APPROVAL_COLUMNS\s*=\s*\{([\s\S]+?)\}\s*as\s+const/,
    );
    expect(
      blockMatch,
      "H2-c6 violated: could not locate PUBLIC_APPROVAL_COLUMNS block",
    ).not.toBeNull();
    const block = blockMatch![1];
    expect(
      block,
      "H2-c6 violated: PUBLIC_APPROVAL_COLUMNS includes `rawPayload`. " +
        "rawPayload carries unredacted tool arguments (potentially " +
        "secrets) and must NEVER be exposed via API list endpoints.",
    ).not.toMatch(/\brawPayload\b/);
    expect(
      block,
      "H2-c6 violated: PUBLIC_APPROVAL_COLUMNS includes " +
        "`proposedToolCallJson`. The Phase 8 envelope contains the " +
        "model's raw arguments and must NEVER be exposed via API " +
        "list endpoints.",
    ).not.toMatch(/proposedToolCallJson/);
  });

  it("PUBLIC_APPROVAL_COLUMNS includes the columns the UI consumes", () => {
    // RetrofitPage's ApprovalRow consumes id, toolName, description,
    // proposedToolCallHash, createdAt. The hash is safe (just a SHA-256).
    const blockMatch = routerStripped.match(
      /const\s+PUBLIC_APPROVAL_COLUMNS\s*=\s*\{([\s\S]+?)\}\s*as\s+const/,
    );
    const block = blockMatch![1];
    for (const col of [
      "id",
      "toolName",
      "description",
      "proposedToolCallHash",
      "createdAt",
      "status",
    ]) {
      expect(
        block,
        `H2-c6 violated: PUBLIC_APPROVAL_COLUMNS missing \`${col}\`. ` +
          `RetrofitPage and the operator UI rely on this column.`,
      ).toMatch(new RegExp(`\\b${col}\\b\\s*:`));
    }
  });

  it("router has NO bare `.select().from(agsPendingPermissionRequests)`", () => {
    // Catches a future endpoint that re-introduces the leaky pattern.
    expect(
      routerStripped,
      "H2-c6 violated: tool-approvals-router.ts contains a bare " +
        "`.select().from(agsPendingPermissionRequests)` — re-introduces " +
        "the leaky pattern. Use `.select(PUBLIC_APPROVAL_COLUMNS)` " +
        "instead.",
    ).not.toMatch(/\.select\s*\(\s*\)\s*\.from\s*\(\s*agsPendingPermissionRequests/);
  });

  it("repository.ts has NO bare `.select().from(agsPendingPermissionRequests)`", () => {
    // The legacy permissions.listPending path goes through
    // repo.listPendingPermissionRequests; both that and
    // getPendingPermissionRequestById must use safe projection.
    expect(
      repoStripped,
      "H2-c6 violated: repository.ts contains a bare " +
        "`.select().from(agsPendingPermissionRequests)`. The legacy " +
        "permissions API path also needs safe projection — bare " +
        "select leaks rawPayload + proposedToolCallJson.",
    ).not.toMatch(/\.select\s*\(\s*\)\s*\.from\s*\(\s*agsPendingPermissionRequests/);
  });

  it("repository.ts defines its own PUBLIC_APPROVAL_COLUMNS map (mirrors router)", () => {
    // Two separate definitions (not a shared import) is intentional —
    // repo can't depend on api/. The lockstep enforces both stay in
    // sync via the no-bare-select assertion above + this test pin.
    expect(
      repoSrc,
      "H2-c6 violated: repository.ts must define its own " +
        "`PUBLIC_APPROVAL_COLUMNS` map (mirrors the router definition). " +
        "Without it, the projection drifts and an unsafe column could " +
        "re-enter via the legacy permissions API.",
    ).toMatch(/PUBLIC_APPROVAL_COLUMNS/);
  });
});
