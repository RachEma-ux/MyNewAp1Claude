/**
 * H1-c5 (cycle-5 audit `/sdcard/Download/MCP_DISPATCHER_AUDIT_2026-05-09.md`
 * §H1-c5) — lockstep that `bootAgentStudio()` installs the MCP auto-sync
 * subscriber.
 *
 * Pre-cycle-5: `auto-sync.ts:installAutoSync` was defined but never
 * called at boot. The `agsMcpToolKnowledge` mirror stayed empty
 * indefinitely. H1-c5 wires the call at `boot.ts` step 3b. This test
 * locks the wire-up so a future PR cannot silently remove it.
 *
 * The wire-up + the resolver shape are both source-scanned (rather than
 * actually invoking `bootAgentStudio()` which has DB side effects) — the
 * test runs without any database setup.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const BOOT_PATH = join(process.cwd(), "server/agent-studio/boot.ts");
const RESOLVER_PATH = join(
  process.cwd(),
  "server/agent-studio/services/mcp/auto-sync-resolver.ts",
);

describe("H1-c5 — boot wires MCP auto-sync subscriber", () => {
  it("boot.ts dynamically imports installAutoSync and calls it", () => {
    const src = readFileSync(BOOT_PATH, "utf8");
    expect(
      src,
      "boot.ts must dynamically import installAutoSync (H1-c5 wire-up)",
    ).toMatch(
      /import\(\s*["']\.\/services\/mcp\/auto-sync["']\s*\)/,
    );
    expect(
      src,
      "boot.ts must call installAutoSync at boot (H1-c5)",
    ).toMatch(/installAutoSync\s*\(/);
  });

  it("boot.ts wires the auto-sync resolver via getAutoSyncResolver()", () => {
    const src = readFileSync(BOOT_PATH, "utf8");
    expect(
      src,
      "boot.ts must use the resolver injection point (auto-sync-resolver.ts)",
    ).toMatch(
      /import\(\s*["']\.\/services\/mcp\/auto-sync-resolver["']\s*\)/,
    );
    expect(
      src,
      "boot.ts must call getAutoSyncResolver() so operator-injected resolvers are honored",
    ).toMatch(/getAutoSyncResolver\s*\(/);
  });

  it("auto-sync-resolver.ts exposes the env-flag fallback (single-workspace deployments)", () => {
    const src = readFileSync(RESOLVER_PATH, "utf8");
    expect(
      src,
      "AGENT_STUDIO_AUTO_SYNC_WORKSPACE_ID env flag is the operator's enable switch (mirrors R6-c3 GOVERNANCE_ENFORCE_APPROVALS pattern)",
    ).toMatch(/AGENT_STUDIO_AUTO_SYNC_WORKSPACE_ID/);
    expect(
      src,
      "setAutoSyncResolver() is the multi-workspace operator escape hatch",
    ).toMatch(/export function setAutoSyncResolver/);
  });

  it("default resolver returns null when env flag is unset (preserves baseline behavior)", async () => {
    // Save + restore env to avoid cross-test bleed.
    const original = process.env.AGENT_STUDIO_AUTO_SYNC_WORKSPACE_ID;
    delete process.env.AGENT_STUDIO_AUTO_SYNC_WORKSPACE_ID;
    try {
      const { defaultAutoSyncResolver, setAutoSyncResolver } = await import(
        "../../server/agent-studio/services/mcp/auto-sync-resolver"
      );
      setAutoSyncResolver(null); // ensure default
      const result = await Promise.resolve(defaultAutoSyncResolver(123));
      expect(
        result,
        "Without the env flag, the resolver must return null so today's no-op behavior is preserved (auto-sync subscription EXISTS but does nothing until operator opts in).",
      ).toBeNull();
    } finally {
      if (original !== undefined) {
        process.env.AGENT_STUDIO_AUTO_SYNC_WORKSPACE_ID = original;
      }
    }
  });

  it("setAutoSyncResolver() injects a custom resolver that getAutoSyncResolver() returns", async () => {
    const { setAutoSyncResolver, getAutoSyncResolver } = await import(
      "../../server/agent-studio/services/mcp/auto-sync-resolver"
    );
    try {
      const fakeResolver = (serverId: number) => ({
        workspaceId: 999,
        mcpServerId: `fake-${serverId}`,
        knowledgeSourceId: 42,
        actorId: 0,
      });
      setAutoSyncResolver(fakeResolver);
      const resolved = getAutoSyncResolver();
      expect(resolved).toBe(fakeResolver);
      const ctx = await Promise.resolve(resolved(7));
      expect(ctx).toEqual({
        workspaceId: 999,
        mcpServerId: "fake-7",
        knowledgeSourceId: 42,
        actorId: 0,
      });
    } finally {
      setAutoSyncResolver(null); // restore default
    }
  });
});
