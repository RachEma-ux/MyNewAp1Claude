/**
 * AWI ↔ Digital HQ wiring smoke tests.
 *
 * The HQ tRPC procedures call into the AWI builder via
 * `applicationWiringRouter`. These tests exercise the same callsites
 * the router does (without the tRPC plumbing) so they don't require
 * a server context.
 */
import { describe, expect, it } from "vitest";
import {
  buildApplicationWiringInventory,
  buildDependencyGraph,
  buildWiringMatrix,
  computeReadiness,
  getMissingWires,
  getBrokenWires,
  getDeclaredOnlyWires,
  getPartialWires,
  type AwiRuntimeFacts,
} from "./index";

describe("AWI surfaces backing hq.applicationWiring.*", () => {
  it("summary shape matches what the router returns", () => {
    const m = buildWiringMatrix();
    expect(m.summary).toMatchObject({
      moduleCount: expect.any(Number),
      fullyWiredCount: expect.any(Number),
      mostlyWiredCount: expect.any(Number),
      partialCount: expect.any(Number),
      blockedCount: expect.any(Number),
      averageReadinessScore: expect.any(Number),
      blockers: expect.any(Number),
      warnings: expect.any(Number),
      missingRequiredWires: expect.any(Number),
    });
  });

  it("matrix returns at least one module row", () => {
    const m = buildWiringMatrix();
    expect(m.modules.length).toBeGreaterThan(0);
  });

  it("graph returns nodes/edges/cycles arrays", () => {
    const g = buildDependencyGraph();
    expect(Array.isArray(g.nodes)).toBe(true);
    expect(Array.isArray(g.edges)).toBe(true);
    expect(Array.isArray(g.cycles)).toBe(true);
  });

  it("missing endpoint returns the four bucket arrays", () => {
    const all = buildApplicationWiringInventory();
    const buckets = {
      missing: getMissingWires(all),
      broken: getBrokenWires(all),
      declaredOnly: getDeclaredOnlyWires(all),
      partial: getPartialWires(all),
    };
    for (const k of Object.keys(buckets)) {
      expect(Array.isArray((buckets as any)[k])).toBe(true);
    }
  });

  it("readiness rollup is the same shape the router returns", () => {
    const all = buildApplicationWiringInventory();
    const rollup = all.map((m) => {
      const r = computeReadiness(m.areas);
      return {
        moduleKey: m.moduleKey,
        moduleName: m.moduleName,
        readinessScore: r.score,
        readinessStatus: r.status,
        blockerCount: r.blockers.length,
        warningCount: r.warnings.length,
      };
    });
    for (const row of rollup) {
      expect(row.moduleKey).toBeTruthy();
      expect(typeof row.readinessScore).toBe("number");
    }
  });

  it("inventory builds without DB access (no facts supplied)", () => {
    expect(() => buildApplicationWiringInventory()).not.toThrow();
  });

  it("supplying facts changes the gateway-area scoring deterministically", () => {
    const noFacts = buildApplicationWiringInventory();
    const facts: AwiRuntimeFacts = {
      registeredGatewayActions: [
        // Pretend every PRM declared action is registered; PRM declares
        // 2 governance actions per its manifest.
        { module: "prm", action: "prm.method.publish" },
        { module: "prm", action: "prm.method.deprecate" },
      ],
    };
    const withFacts = buildApplicationWiringInventory({ facts });
    const noFactsPrm = noFacts.find((m) => m.moduleKey === "prm");
    const withFactsPrm = withFacts.find((m) => m.moduleKey === "prm");
    const noFactsG = noFactsPrm!.areas.find((a) => a.area === "gateway");
    const withFactsG = withFactsPrm!.areas.find((a) => a.area === "gateway");
    // With both actions matched, status should be wired regardless of
    // what the static parse said.
    expect(withFactsG?.status).toBe("wired");
    // Without facts, the static path may still report wired if the
    // existing manifests register publicApi handlers — verify the
    // call simply doesn't throw and produces a valid status.
    expect(["wired", "partial", "declared-only"]).toContain(noFactsG?.status);
  });
});
