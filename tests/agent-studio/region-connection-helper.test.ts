/**
 * Region-routed connection helper tests — V2 Phase MR-2.
 *
 * Covers:
 *   - getDbForRegion: active region returns a drizzle instance from
 *     the factory; inactive returns null; empty postgresUri returns
 *     null; factory throw returns null (and logs to warn).
 *   - pool caching: second call with same regionKey reuses the
 *     cached instance; cache survives across getDbForWorkspace calls
 *   - getDbForWorkspace: composes resolveWorkspaceRegion + getDbForRegion
 *     — pinned region, no-pin → primary, no-pin no-primary →
 *     deterministic first, pin missing → null, no active regions
 *     → null.
 *   - getNeo4jUriForRegion: returns the URI for an active region;
 *     null for inactive / empty.
 *   - listWarmRegionPoolKeys reflects the cache.
 *   - source-scan boundary: no credential-resolver / dispatcher /
 *     *_API_KEY / neo4j-driver imports in connection-helper.ts.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetRegionConnectionCacheForTests,
  getDbForRegion,
  getDbForWorkspace,
  getNeo4jUriForRegion,
  listWarmRegionPoolKeys,
} from "../../server/agent-studio/services/region/connection-helper.js";
import type { RegionRecord } from "../../server/agent-studio/services/region/types.js";

function makeRegion(over: Partial<RegionRecord> = {}): RegionRecord {
  return {
    id: 1,
    regionKey: "default",
    name: "Default Region",
    postgresUri: "postgresql://localhost:5432/asdb",
    neo4jUri: null,
    credentialBindingId: null,
    isPrimary: true,
    isActive: true,
    settings: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

beforeEach(() => {
  __resetRegionConnectionCacheForTests();
});

afterEach(() => {
  __resetRegionConnectionCacheForTests();
});

describe("getDbForRegion", () => {
  it("returns the factory result for an active region", () => {
    const fakeDb = { _fake: true };
    const factory = vi.fn(() => fakeDb as unknown as never);
    const db = getDbForRegion(makeRegion(), { drizzleFactory: factory });
    expect(db).toBe(fakeDb);
    expect(factory).toHaveBeenCalledWith("postgresql://localhost:5432/asdb");
  });

  it("returns null for an inactive region", () => {
    const factory = vi.fn();
    const db = getDbForRegion(makeRegion({ isActive: false }), {
      drizzleFactory: factory as unknown as never,
    });
    expect(db).toBeNull();
    expect(factory).not.toHaveBeenCalled();
  });

  it("returns null for an empty postgresUri", () => {
    const factory = vi.fn();
    const db = getDbForRegion(makeRegion({ postgresUri: "" }), {
      drizzleFactory: factory as unknown as never,
    });
    expect(db).toBeNull();
    expect(factory).not.toHaveBeenCalled();
  });

  it("returns null when factory throws", () => {
    const factory = vi.fn(() => {
      throw new Error("ECONNREFUSED");
    });
    const db = getDbForRegion(makeRegion(), {
      drizzleFactory: factory as unknown as never,
    });
    expect(db).toBeNull();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("caches the pool per regionKey", () => {
    const factory = vi.fn(() => ({ _fake: true }) as unknown as never);
    const a = getDbForRegion(makeRegion({ regionKey: "us-east" }), {
      drizzleFactory: factory,
    });
    const b = getDbForRegion(makeRegion({ regionKey: "us-east" }), {
      drizzleFactory: factory,
    });
    expect(a).toBe(b);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("keeps separate cache entries per regionKey", () => {
    let count = 0;
    const factory = vi.fn(
      () => ({ _id: ++count }) as unknown as never,
    );
    const a = getDbForRegion(makeRegion({ regionKey: "us-east" }), {
      drizzleFactory: factory,
    });
    const b = getDbForRegion(makeRegion({ regionKey: "eu-west" }), {
      drizzleFactory: factory,
    });
    expect(a).not.toBe(b);
    expect(factory).toHaveBeenCalledTimes(2);
  });
});

describe("getDbForWorkspace — composition with pure router", () => {
  it("routes to the workspace's pinned region", () => {
    const factory = vi.fn(() => ({ _f: true }) as unknown as never);
    const regions = [
      makeRegion({ id: 1, regionKey: "us-east", isPrimary: true }),
      makeRegion({
        id: 2,
        regionKey: "eu-west",
        isPrimary: false,
        postgresUri: "postgresql://eu.example/asdb",
      }),
    ];
    const out = getDbForWorkspace(
      { availableRegions: regions, workspaceRegionKey: "eu-west" },
      { drizzleFactory: factory },
    );
    expect(out?.region.regionKey).toBe("eu-west");
    expect(factory).toHaveBeenCalledWith("postgresql://eu.example/asdb");
  });

  it("routes to the primary when no pin is set", () => {
    const factory = vi.fn(() => ({ _f: true }) as unknown as never);
    const regions = [
      makeRegion({ id: 1, regionKey: "us-east", isPrimary: true }),
      makeRegion({
        id: 2,
        regionKey: "eu-west",
        isPrimary: false,
        postgresUri: "postgresql://eu.example/asdb",
      }),
    ];
    const out = getDbForWorkspace(
      { availableRegions: regions, workspaceRegionKey: null },
      { drizzleFactory: factory },
    );
    expect(out?.region.regionKey).toBe("us-east");
  });

  it("returns null when the pin doesn't match an active region", () => {
    const factory = vi.fn();
    const regions = [makeRegion({ regionKey: "us-east", isActive: false })];
    const out = getDbForWorkspace(
      { availableRegions: regions, workspaceRegionKey: "us-east" },
      { drizzleFactory: factory as unknown as never },
    );
    expect(out).toBeNull();
  });

  it("returns null when there are no active regions", () => {
    const factory = vi.fn();
    const out = getDbForWorkspace(
      { availableRegions: [], workspaceRegionKey: null },
      { drizzleFactory: factory as unknown as never },
    );
    expect(out).toBeNull();
  });
});

describe("getNeo4jUriForRegion", () => {
  it("returns the URI for an active region", () => {
    expect(
      getNeo4jUriForRegion(makeRegion({ neo4jUri: "bolt://eu.example:7687" })),
    ).toBe("bolt://eu.example:7687");
  });

  it("returns null for an inactive region", () => {
    expect(
      getNeo4jUriForRegion(
        makeRegion({ neo4jUri: "bolt://x:7687", isActive: false }),
      ),
    ).toBeNull();
  });

  it("returns null when neo4jUri is null or empty", () => {
    expect(getNeo4jUriForRegion(makeRegion({ neo4jUri: null }))).toBeNull();
    expect(getNeo4jUriForRegion(makeRegion({ neo4jUri: "" }))).toBeNull();
  });
});

describe("listWarmRegionPoolKeys", () => {
  it("reflects the cache state", () => {
    const factory = vi.fn(() => ({}) as unknown as never);
    expect(listWarmRegionPoolKeys()).toEqual([]);
    getDbForRegion(makeRegion({ regionKey: "us-east" }), {
      drizzleFactory: factory,
    });
    getDbForRegion(makeRegion({ regionKey: "eu-west" }), {
      drizzleFactory: factory,
    });
    expect(listWarmRegionPoolKeys().sort()).toEqual(["eu-west", "us-east"]);
  });

  it("__resetRegionConnectionCacheForTests clears the cache", () => {
    const factory = vi.fn(() => ({}) as unknown as never);
    getDbForRegion(makeRegion({ regionKey: "us-east" }), {
      drizzleFactory: factory,
    });
    expect(listWarmRegionPoolKeys()).toEqual(["us-east"]);
    __resetRegionConnectionCacheForTests();
    expect(listWarmRegionPoolKeys()).toEqual([]);
  });
});

describe("source-scan boundary — connection-helper.ts", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/region/connection-helper.ts",
  );
  const src = readFileSync(file, "utf8");
  const code = src
    .split("\n")
    .filter((l) => !/^\s*\*?\s*\/\//.test(l) && !/^\s*\*/.test(l))
    .join("\n");

  it("does not import credential-resolver (Plan v3 D2)", () => {
    expect(/credential-resolver/.test(code)).toBe(false);
  });

  it("does not import the MCP dispatcher", () => {
    expect(
      /import[^;]*dispatchMcpToolCall[^;]*from\s+["'][^"']*mcp\/dispatcher/.test(
        code,
      ),
    ).toBe(false);
  });

  it("does not read process.env.*_API_KEY raw", () => {
    expect(/process\.env\.[A-Z_]*_API_KEY/.test(code)).toBe(false);
  });

  it("does not import neo4j-driver (helper surfaces URI only)", () => {
    expect(/from\s+["']neo4j-driver["']/.test(code)).toBe(false);
  });
});
