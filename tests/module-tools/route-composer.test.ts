import { describe, expect, it } from "vitest";
import { partitionRoutes, compareBaseRoute } from "../../client/src/platform/modules/route-composer";
import type { ClientModuleManifest } from "../../client/src/platform/modules/types";

function legacyManifest(over: Partial<ClientModuleManifest>): ClientModuleManifest {
  return {
    key: "x",
    name: "X",
    routes: [],
    ...over,
  };
}

const Capsule = () => null;

describe("partitionRoutes", () => {
  it("treats manifests with baseRoute + capsuleEntrypoint as capsules", () => {
    const { capsules, legacy } = partitionRoutes([
      legacyManifest({
        key: "communication",
        baseRoute: "/communication",
        capsuleEntrypoint: Capsule,
      }),
    ]);
    expect(capsules).toHaveLength(1);
    expect(capsules[0].baseRoute).toBe("/communication");
    expect(legacy).toHaveLength(0);
  });

  it("treats manifests with only routes[] as legacy", () => {
    const { capsules, legacy } = partitionRoutes([
      legacyManifest({
        key: "agentStudio",
        routes: [
          { path: "/agent-studio", component: Capsule },
          { path: "/agent-studio/templates", component: Capsule },
        ],
      }),
    ]);
    expect(capsules).toHaveLength(0);
    expect(legacy).toHaveLength(2);
  });

  it("sorts capsules longest-baseRoute first, lexical tiebreak for equal length", () => {
    // /communication and /data-analysis are equal-length (14); lexical wins.
    const { capsules } = partitionRoutes([
      legacyManifest({ key: "a", baseRoute: "/data-analysis", capsuleEntrypoint: Capsule }),
      legacyManifest({
        key: "b",
        baseRoute: "/data-analysis/data-acquisition",
        capsuleEntrypoint: Capsule,
      }),
      legacyManifest({ key: "c", baseRoute: "/communication", capsuleEntrypoint: Capsule }),
    ]);
    expect(capsules.map((c) => c.baseRoute)).toEqual([
      "/data-analysis/data-acquisition",
      "/communication",
      "/data-analysis",
    ]);
  });

  it("ignores legacy routes[] on a capsule manifest", () => {
    const { capsules, legacy } = partitionRoutes([
      legacyManifest({
        key: "communication",
        baseRoute: "/communication",
        capsuleEntrypoint: Capsule,
        routes: [{ path: "/communication/chat", component: Capsule }],
      }),
    ]);
    expect(capsules).toHaveLength(1);
    // App.tsx still owns the legacy mounts during migration; the
    // composer doesn't double-render them.
    expect(legacy).toHaveLength(0);
  });
});

describe("compareBaseRoute", () => {
  it("longer first", () => {
    expect(compareBaseRoute("/data-analysis", "/data-analysis/data-acquisition")).toBeGreaterThan(0);
    expect(compareBaseRoute("/data-analysis/data-acquisition", "/data-analysis")).toBeLessThan(0);
  });
  it("lexical tiebreak", () => {
    expect(compareBaseRoute("/aaa", "/bbb")).toBeLessThan(0);
  });
});
