/**
 * Region routing bridge tests — V2 Phase MR-1 Phase-2 third slice
 * (shim cutover). PR-V1-150.
 *
 * Covers:
 *   - Shim default (no router installed) falls back to getAsDb.
 *   - Shim with router installed but cold cache falls back to getAsDb.
 *   - Shim with router + warm cache + pinned workspace returns the
 *     region-routed pool from getDbForRegion.
 *   - Shim with router + warm cache + unpinned workspace falls back
 *     to getAsDb (primary region resolves via cache; tested via
 *     null-resolve closure separately).
 *   - configureRegionRouter(null) uninstalls the router.
 *   - workspaceId=null/undefined falls back to getAsDb (no resolve call).
 *   - Source-scan: no env reads / credential-resolver / dispatcher /
 *     neo4j-driver imports in bridge file.
 *   - configureRegionRouter is exported from db/connection.ts so the
 *     bridge can wire late.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../server/agent-studio/db/connection.js", async () => {
  let router: { resolve: (id: number) => unknown } | null = null;
  const fakeBootstrap = { __tag: "bootstrap" } as const;
  return {
    getAsDb: () => fakeBootstrap,
    resetAsDb: () => {},
    configureRegionRouter: (r: typeof router) => {
      router = r;
    },
    getAsDbForWorkspace: (workspaceId: number | null | undefined) => {
      if (workspaceId == null) return fakeBootstrap;
      if (!router) return fakeBootstrap;
      const routed = router.resolve(workspaceId);
      if (routed) return routed;
      return fakeBootstrap;
    },
    // Test seam exposure
    __fakeBootstrap: fakeBootstrap,
  };
});

vi.mock(
  "../../server/agent-studio/services/region/connection-helper.js",
  () => ({
    getDbForRegion: vi.fn(),
  }),
);

vi.mock(
  "../../server/agent-studio/services/region/workspace-region-cache.js",
  () => ({
    getCachedRegionForWorkspace: vi.fn(),
  }),
);

import { getDbForRegion } from "../../server/agent-studio/services/region/connection-helper.js";
import { getCachedRegionForWorkspace } from "../../server/agent-studio/services/region/workspace-region-cache.js";
import {
  getAsDbForWorkspace,
  // @ts-expect-error — test seam exposed via the mock
  __fakeBootstrap,
} from "../../server/agent-studio/db/connection.js";
import {
  installRegionRouter,
  uninstallRegionRouter,
} from "../../server/agent-studio/services/region/region-routing-bridge.js";

const mockedGetDbForRegion = vi.mocked(getDbForRegion);
const mockedGetCachedRegionForWorkspace = vi.mocked(
  getCachedRegionForWorkspace,
);

describe("MR-1 Phase-2 — shim cutover bridge", () => {
  beforeEach(() => {
    uninstallRegionRouter();
    mockedGetDbForRegion.mockReset();
    mockedGetCachedRegionForWorkspace.mockReset();
  });

  afterEach(() => {
    uninstallRegionRouter();
  });

  it("no router installed: shim falls back to getAsDb (Phase-1 behavior)", () => {
    const result = getAsDbForWorkspace(42);
    expect(result).toBe(__fakeBootstrap);
  });

  it("router installed + cold cache: shim falls back to getAsDb", () => {
    mockedGetCachedRegionForWorkspace.mockReturnValue(null);
    installRegionRouter();
    const result = getAsDbForWorkspace(42);
    expect(result).toBe(__fakeBootstrap);
    expect(mockedGetCachedRegionForWorkspace).toHaveBeenCalledWith(42);
    expect(mockedGetDbForRegion).not.toHaveBeenCalled();
  });

  it("router installed + warm cache + pinned workspace: returns routed pool", () => {
    const fakeRoutedDb = { __tag: "routed-us-west-1" } as const;
    const fakeRegion = {
      id: 2,
      regionKey: "us-west-1",
      name: "US West",
      postgresUri: "postgresql://us-west:5432/asdb",
      neo4jUri: null,
      credentialBindingId: null,
      isPrimary: false,
      isActive: true,
      settings: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockedGetCachedRegionForWorkspace.mockReturnValue(fakeRegion);
    mockedGetDbForRegion.mockReturnValue(fakeRoutedDb as never);
    installRegionRouter();
    const result = getAsDbForWorkspace(42);
    expect(result).toBe(fakeRoutedDb);
    expect(mockedGetDbForRegion).toHaveBeenCalledWith(fakeRegion);
  });

  it("router installed + getDbForRegion returns null (pool init failure): falls back to getAsDb", () => {
    const fakeRegion = {
      id: 2,
      regionKey: "us-west-1",
      name: "US West",
      postgresUri: "postgresql://us-west:5432/asdb",
      neo4jUri: null,
      credentialBindingId: null,
      isPrimary: false,
      isActive: true,
      settings: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockedGetCachedRegionForWorkspace.mockReturnValue(fakeRegion);
    mockedGetDbForRegion.mockReturnValue(null);
    installRegionRouter();
    const result = getAsDbForWorkspace(42);
    expect(result).toBe(__fakeBootstrap);
  });

  it("uninstallRegionRouter: shim reverts to Phase-1 behavior", () => {
    installRegionRouter();
    uninstallRegionRouter();
    const result = getAsDbForWorkspace(42);
    expect(result).toBe(__fakeBootstrap);
    expect(mockedGetCachedRegionForWorkspace).not.toHaveBeenCalled();
  });

  it("workspaceId=null falls back to getAsDb without consulting the router", () => {
    installRegionRouter();
    expect(getAsDbForWorkspace(null)).toBe(__fakeBootstrap);
    expect(getAsDbForWorkspace(undefined)).toBe(__fakeBootstrap);
    expect(mockedGetCachedRegionForWorkspace).not.toHaveBeenCalled();
  });

  it("source-scan: hard-rule compliance + db/connection.ts exports configureRegionRouter", () => {
    const bridgeFile = resolve(
      __dirname,
      "../../server/agent-studio/services/region/region-routing-bridge.ts",
    );
    const connectionFile = resolve(
      __dirname,
      "../../server/agent-studio/db/connection.ts",
    );
    const bridgeSrc = readFileSync(bridgeFile, "utf8");
    const connSrc = readFileSync(connectionFile, "utf8");
    expect(/process\.env\.[A-Z0-9_]+_API_KEY/.test(bridgeSrc)).toBe(false);
    expect(/credential-resolver/.test(bridgeSrc)).toBe(false);
    expect(/dispatchMcpToolCall/.test(bridgeSrc)).toBe(false);
    expect(/neo4j-driver/.test(bridgeSrc)).toBe(false);
    expect(/export\s+function\s+configureRegionRouter/.test(connSrc)).toBe(
      true,
    );
    expect(/let\s+_regionRouter\s*:/.test(connSrc)).toBe(true);
  });
});
