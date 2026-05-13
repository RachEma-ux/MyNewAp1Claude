// Region router + service tests — V2 Phase MR-1 first slice.
//
// Covers:
//   - resolveWorkspaceRegion routing decisions (pinned, no-pin, no
//     active regions, pinned-but-inactive)
//   - assertSameRegion: throws on cross-region access, allows
//     replicated workspaces
//   - Region service ASDB-unavailable fall-through
//   - Source-scan boundary: no neo4j-driver, no GraphRepository,
//     no credential-resolver, no raw env reads, no dispatchMcpToolCall

import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/agent-studio/db/connection.js", () => ({
  getAsDb: () => null,
}));

import {
  AsdbUnavailableError,
  CrossRegionAccessDeniedError,
  assertSameRegion,
  getPrimaryRegion,
  getRegionByKey,
  listActiveRegions,
  registerRegion,
  resolveWorkspaceRegion,
  type RegionRecord,
} from "../../server/agent-studio/services/region/public-api.js";

function makeRegion(overrides: Partial<RegionRecord> = {}): RegionRecord {
  return {
    id: 1,
    regionKey: "us-east-1",
    name: "US East 1",
    postgresUri: "postgres://...",
    neo4jUri: null,
    credentialBindingId: null,
    isPrimary: false,
    isActive: true,
    settings: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("resolveWorkspaceRegion (pure router)", () => {
  it("returns the pinned region when active", () => {
    const regions = [
      makeRegion({ regionKey: "us-east-1" }),
      makeRegion({ id: 2, regionKey: "eu-west-1" }),
    ];
    const r = resolveWorkspaceRegion({
      availableRegions: regions,
      workspaceRegionKey: "eu-west-1",
    });
    expect(r?.regionKey).toBe("eu-west-1");
  });

  it("returns null when the pinned region is inactive", () => {
    const regions = [makeRegion({ regionKey: "eu-west-1", isActive: false })];
    const r = resolveWorkspaceRegion({
      availableRegions: regions,
      workspaceRegionKey: "eu-west-1",
    });
    expect(r).toBeNull();
  });

  it("falls back to the primary region when no pin is set", () => {
    const regions = [
      makeRegion({ regionKey: "us-east-1", isPrimary: false }),
      makeRegion({ id: 2, regionKey: "us-west-1", isPrimary: true }),
    ];
    const r = resolveWorkspaceRegion({
      availableRegions: regions,
      workspaceRegionKey: null,
    });
    expect(r?.regionKey).toBe("us-west-1");
  });

  it("falls back to the deterministic first active region when no pin AND no primary", () => {
    const regions = [
      makeRegion({ regionKey: "us-west-1" }),
      makeRegion({ id: 2, regionKey: "eu-west-1" }),
    ];
    const r = resolveWorkspaceRegion({
      availableRegions: regions,
      workspaceRegionKey: null,
    });
    // Sorted by regionKey: eu-west-1 < us-west-1.
    expect(r?.regionKey).toBe("eu-west-1");
  });

  it("returns null when no active regions exist", () => {
    expect(
      resolveWorkspaceRegion({
        availableRegions: [makeRegion({ isActive: false })],
        workspaceRegionKey: null,
      }),
    ).toBeNull();
  });
});

describe("assertSameRegion (pure guard)", () => {
  it("same region: no throw", () => {
    expect(() =>
      assertSameRegion({
        workspaceId: 1,
        workspaceRegionKey: "us-east-1",
        accessedRegionKey: "us-east-1",
      }),
    ).not.toThrow();
  });

  it("different region + not replicated: throws CrossRegionAccessDeniedError", () => {
    expect(() =>
      assertSameRegion({
        workspaceId: 42,
        workspaceRegionKey: "us-east-1",
        accessedRegionKey: "eu-west-1",
      }),
    ).toThrow(CrossRegionAccessDeniedError);
  });

  it("different region + replicated: no throw", () => {
    expect(() =>
      assertSameRegion({
        workspaceId: 42,
        workspaceRegionKey: "us-east-1",
        accessedRegionKey: "eu-west-1",
        isReplicated: true,
      }),
    ).not.toThrow();
  });

  it("the thrown error carries from/to/workspaceId for operator forensics", () => {
    try {
      assertSameRegion({
        workspaceId: 7,
        workspaceRegionKey: "us-east-1",
        accessedRegionKey: "eu-west-1",
      });
      throw new Error("did not throw");
    } catch (err) {
      expect(err).toBeInstanceOf(CrossRegionAccessDeniedError);
      const e = err as CrossRegionAccessDeniedError;
      expect(e.workspaceId).toBe(7);
      expect(e.fromRegion).toBe("us-east-1");
      expect(e.toRegion).toBe("eu-west-1");
    }
  });
});

describe("region service — ASDB unavailable fall-through", () => {
  it("getRegionByKey returns null", async () => {
    expect(await getRegionByKey("any")).toBeNull();
  });

  it("listActiveRegions returns []", async () => {
    expect(await listActiveRegions()).toEqual([]);
  });

  it("getPrimaryRegion returns null", async () => {
    expect(await getPrimaryRegion()).toBeNull();
  });

  it("registerRegion throws AsdbUnavailableError", async () => {
    await expect(
      registerRegion({
        regionKey: "x",
        name: "X",
        postgresUri: "postgres://...",
      }),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
  });
});

describe("region module — hard-rule boundary scan", () => {
  async function readFile(rel: string): Promise<string> {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    return readFileSync(join(__dirname, "..", "..", rel), "utf8");
  }

  const REGION_FILES = [
    "server/agent-studio/services/region/types.ts",
    "server/agent-studio/services/region/region-service.ts",
    "server/agent-studio/services/region/region-router.ts",
    "server/agent-studio/services/region/public-api.ts",
  ] as const;

  it("no region file imports neo4j-driver", async () => {
    for (const rel of REGION_FILES) {
      const src = await readFile(rel);
      expect(
        /from\s+["']neo4j-driver["']/.exec(src),
        `${rel} imports neo4j-driver`,
      ).toBeNull();
    }
  });

  it("no region file imports the GraphRepository (region routing is data-plane only)", async () => {
    for (const rel of REGION_FILES) {
      const src = await readFile(rel);
      expect(
        /services\/graph\/repository/.exec(src),
        `${rel} imports GraphRepository`,
      ).toBeNull();
    }
  });

  it("no region file imports the credential resolver (Plan v3 D2)", async () => {
    for (const rel of REGION_FILES) {
      const src = await readFile(rel);
      expect(
        /credential-resolver/.exec(src),
        `${rel} imports credential-resolver`,
      ).toBeNull();
    }
  });

  it("no region file imports dispatchMcpToolCall (region routing is not a tool path)", async () => {
    for (const rel of REGION_FILES) {
      const src = await readFile(rel);
      // Strip docblock + line-comments so a docstring mention of
      // "dispatchMcpToolCall" doesn't false-positive; the rule is
      // about actual imports.
      const code = src
        .split("\n")
        .filter((l) => !/^\s*\*?\s*\/\//.test(l) && !/^\s*\*/.test(l))
        .join("\n");
      expect(
        /import[^;]*dispatchMcpToolCall[^;]*from\s+["'][^"']*mcp\/dispatcher/.exec(
          code,
        ),
        `${rel} imports dispatchMcpToolCall`,
      ).toBeNull();
    }
  });

  it("no region file reads process.env.*_API_KEY", async () => {
    for (const rel of REGION_FILES) {
      const src = await readFile(rel);
      const code = src
        .split("\n")
        .filter((l) => !/^\s*\*?\s*\/\//.test(l) && !/^\s*\*/.test(l))
        .join("\n");
      expect(/process\.env\.[A-Z_]+_API_KEY/.exec(code)).toBeNull();
    }
  });

  it("multi-region failover runbook exists at the canonical path", async () => {
    const src = await readFile(
      "docs/runbooks/agent-studio-multi-region-failover-runbook.md",
    );
    expect(src).toMatch(/Multi-Region Failover/i);
    expect(src).toMatch(/Trigger conditions/i);
    expect(src).toMatch(/Rollback/i);
  });
});
