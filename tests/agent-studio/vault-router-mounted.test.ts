/**
 * Native Graph Workspace MVP 1 — vault tRPC mount integrity.
 *
 * Closes a CRITICAL mount-drift bug: the `vaultRouter` was defined
 * under `services/vault/router.ts` with hundreds of procedures (notes,
 * vault membership, search, templates, attachments, saved views,
 * template instantiations) and is heavily consumed by the client
 * (BasesPanel + AttachmentListPanel + SavedViewVersionHistoryPanel +
 * AttachmentQuotaPanel + many more) via `trpc.agentStudio.vault.*`.
 *
 * Despite this, no `api/router.ts` mount existed — every
 * `trpc.agentStudio.vault.*` call would 404 at runtime. The router
 * file's own doc-block specified the expected mount key but no file
 * actually performed the assignment until now. Hidden by the
 * `reference_tsconfig_excludes_hide_trpc_mount_drift` pattern:
 * `client/src/**` is excluded from typecheck so client `.useQuery() /
 * .useMutation()` calls compile against an unmounted sub-router
 * without complaint.
 *
 * Pattern: source-scan integrity guard so future refactors that move
 * the import / rename the mount key fail loudly. Same shape as the
 * existing `*-router-mounted.test.ts` suite (graphChangeProposals,
 * promotion, etc.).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import { vaultRouter } from "../../server/agent-studio/services/vault/router";

describe("vault router shape", () => {
  it("exports vaultRouter", () => {
    expect(vaultRouter).toBeDefined();
    expect(
      (vaultRouter as unknown as { _def?: { procedures?: unknown } })._def,
    ).toBeDefined();
  });

  it("exposes core MVP 1 procedures expected by client surfaces", () => {
    const procedures = (vaultRouter as unknown as {
      _def: { procedures: Record<string, unknown> };
    })._def.procedures;
    const keys = Object.keys(procedures);
    // Spot-check the procedures heavy client surfaces depend on; this
    // is NOT exhaustive (the router has many more) but catches the
    // case where a future refactor accidentally splits the router.
    expect(keys).toContain("listMyVaults"); // BasesPanel.tsx:76
    expect(keys).toContain("createSavedView"); // BasesPanel.tsx:212
    expect(keys).toContain("updateSavedView"); // BasesPanel.tsx:221
    expect(keys).toContain("createNote");
    expect(keys).toContain("updateNote");
    expect(keys).toContain("search");
  });
});

describe("source-scan — vaultRouter is mounted in agentStudioRouter", () => {
  it("api/router.ts imports vaultRouter and mounts it at `vault`", () => {
    const file = readFileSync(
      resolve(__dirname, "../../server/agent-studio/api/router.ts"),
      "utf-8",
    );
    expect(file).toContain(
      'import { vaultRouter } from "../services/vault/router"',
    );
    // Mount key MUST be `vault` to match the client's
    // `trpc.agentStudio.vault.*` invocation path. Future refactors
    // that rename the key would silently break every vault feature
    // (BasesPanel, AttachmentListPanel, etc.) at runtime.
    expect(file).toMatch(/\bvault:\s*vaultRouter,/);
  });
});
