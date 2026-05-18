/**
 * Track A — A7 — Vault FS-sync settings UI source-scan.
 *
 * Locks the structural invariants of the new VaultFsSyncPanel and
 * its mount inside VaultExplorer. Behavioral coverage of the tRPC
 * surface lives in vault-fs-sync-trpc.test.ts + vault-fs-sync-
 * integration.test.ts; this test ensures the component composes the
 * three procedures (getFsSyncStatus / setFsSyncPath /
 * triggerInitialBackfill) and surfaces the three UI states.
 *
 * ADR: docs/architecture/agent-studio-vault-fs-sync.md
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const PANEL = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/graph-workspace/VaultFsSyncPanel.tsx",
);
const EXPLORER = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/graph-workspace/VaultExplorer.tsx",
);
const BARREL = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/graph-workspace/index.ts",
);

function read(p: string): string {
  return readFileSync(p, "utf8");
}

describe("A7 — VaultFsSyncPanel", () => {
  const src = read(PANEL);

  it("consumes all three FS-sync tRPC procedures (reuse-first)", () => {
    expect(src).toMatch(/agentStudio\.vault\.getFsSyncStatus\.useQuery/);
    expect(src).toMatch(/agentStudio\.vault\.setFsSyncPath\.useMutation/);
    expect(src).toMatch(
      /agentStudio\.vault\.triggerInitialBackfill\.useMutation/,
    );
  });

  it("renders the three discrete data-state values (disabled / enabled / stopped)", () => {
    expect(src).toMatch(/data-state=\{[\s\S]*?"disabled"[\s\S]*?\}/);
    expect(src).toMatch(/"enabled"/);
    expect(src).toMatch(/"stopped"/);
  });

  it("surfaces the stopped-watcher banner separate from the badge", () => {
    expect(src).toContain("vault-fs-sync-stopped-banner");
  });

  it("exposes the four core interaction testids (enable, disable, backfill, error)", () => {
    expect(src).toContain("vault-fs-sync-enable");
    expect(src).toContain("vault-fs-sync-disable");
    expect(src).toContain("vault-fs-sync-backfill");
    expect(src).toContain("vault-fs-sync-error");
  });

  it("calls utils.invalidate on the status query after every successful mutation", () => {
    // Both enable and disable invalidate getFsSyncStatus so the UI
    // reflects the new state immediately.
    const matches = src.match(
      /utils\.agentStudio\.vault\.getFsSyncStatus\.invalidate/g,
    );
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("StatusBadge renders three distinct status states", () => {
    expect(src).toMatch(/data-status="disabled"/);
    expect(src).toMatch(/data-status="stopped"/);
    expect(src).toMatch(/data-status="enabled"/);
  });
});

describe("A7 — VaultExplorer mount", () => {
  const src = read(EXPLORER);

  it("imports VaultFsSyncPanel", () => {
    expect(src).toMatch(/import VaultFsSyncPanel from\s+["']\.\/VaultFsSyncPanel["']/);
  });

  it("renders FsSyncSettingsAffordance for the selected vault", () => {
    expect(src).toContain("FsSyncSettingsAffordance");
    expect(src).toContain("vault-explorer-fs-sync-toggle");
  });

  it("FsSyncSettingsAffordance is collapsible (default-closed)", () => {
    // The toggle button text flips between `▾` and `▸` based on
    // `open` state — locks the collapsible behavior.
    expect(src).toMatch(/▾ FS sync settings/);
    expect(src).toMatch(/▸ FS sync settings/);
  });
});

describe("A7 — barrel", () => {
  it("re-exports VaultFsSyncPanel for downstream consumers", () => {
    const src = read(BARREL);
    expect(src).toMatch(
      /export \{ default as VaultFsSyncPanel \} from "\.\/VaultFsSyncPanel"/,
    );
  });
});
