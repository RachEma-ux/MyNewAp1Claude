/**
 * Platform Wiring — inventory + report tests
 *
 * Verifies the static wiring inventory model:
 *   - builds an inventory for every known module
 *   - empty inventory has the expected shape
 *   - mergeRuntimeFacts() correctly upgrades declared-only → wired
 *   - the markdown report renderer is deterministic
 */

import { describe, it, expect } from "vitest";
import {
  buildFullInventory,
  KNOWN_MODULES,
  mergeRuntimeFacts,
  resolveRepoRoot,
} from "./wiring-inventory";
import { renderReportMarkdown, rollUp } from "./wiring-report";
import { emptyInventory } from "./wiring-types";

describe("wiring inventory", () => {
  it("discovers all 16 known modules", () => {
    expect(KNOWN_MODULES.length).toBe(16);
    const keys = new Set(KNOWN_MODULES.map((m) => m.key));
    for (const k of [
      "prm",
      "psm",
      "codeStudio",
      "agentStudio",
      "sandboxWf",
      "rag",
      "openRouter",
      "ps",
      "hr",
      "organizationManagement",
      "cultureValues",
      "aiTypes",
      "kgraAgent",
      "communication",
      "pmCentral",
      "dataAnalysis",
    ]) {
      expect(keys.has(k)).toBe(true);
    }
  });

  it("builds inventory entries for every known module", () => {
    const inv = buildFullInventory({ repoRoot: resolveRepoRoot() });
    expect(inv.length).toBe(KNOWN_MODULES.length);
    for (const i of inv) {
      expect(typeof i.key).toBe("string");
      expect(i.folder).toMatch(/^server\//);
    }
  });

  it("flags modules with declared public APIs and confirms all are wired", () => {
    const inv = buildFullInventory({ repoRoot: resolveRepoRoot() });
    // At least one module should have governanceActions declared (PRM, PSM, etc.)
    const withGov = inv.filter((i) => i.publicApi.declared.length > 0);
    expect(withGov.length).toBeGreaterThan(0);
    // After PR #50, every governance-declared action is wired through
    // registerPublicApi(). The static inventory only marks `wired`
    // when registerPublicApi() statically registers the action — so
    // a non-zero `declared-only` count would mean a regression.
    const declaredOnly = withGov.filter((i) => i.publicApi.status === "declared-only");
    expect(declaredOnly.map((i) => i.key)).toEqual([]);
  });

  it("empty inventory has the right defaults", () => {
    const e = emptyInventory("foo", "Foo", "server/foo");
    expect(e.serverManifestExists).toBe(false);
    expect(e.runtime.mode).toBe(null);
    expect(e.publicApi.status).toBe("not-applicable");
    expect(e.events.status).toBe("not-applicable");
    expect(e.handoffs.status).toBe("not-applicable");
  });
});

describe("mergeRuntimeFacts", () => {
  it("upgrades public API status from declared-only → wired when all actions registered", () => {
    const inv = [
      emptyInventory("prm", "PRM", "server/prm"),
    ];
    inv[0].publicApi.declared = ["prm.method.publish", "prm.method.deprecate"];
    inv[0].publicApi.status = "declared-only";

    mergeRuntimeFacts(inv, {
      registeredPublicApis: [
        { module: "prm", action: "prm.method.publish" },
        { module: "prm", action: "prm.method.deprecate" },
      ],
    });

    expect(inv[0].publicApi.registered).toEqual([
      "prm.method.publish",
      "prm.method.deprecate",
    ]);
    expect(inv[0].publicApi.status).toBe("wired");
  });

  it("leaves status as declared-only when only some actions registered", () => {
    const inv = [emptyInventory("prm", "PRM", "server/prm")];
    inv[0].publicApi.declared = ["a", "b", "c"];
    inv[0].publicApi.status = "declared-only";

    mergeRuntimeFacts(inv, {
      registeredPublicApis: [{ module: "prm", action: "a" }],
    });

    expect(inv[0].publicApi.registered).toEqual(["a"]);
    expect(inv[0].publicApi.status).toBe("declared-only");
  });

  it("matches event subscriptions including wildcard patterns", () => {
    const inv = [emptyInventory("agentStudio", "Agent Studio", "server/agent-studio")];
    inv[0].events.consumes = ["prm.method.published", "prm.method.deprecated"];

    mergeRuntimeFacts(inv, {
      registeredEventSubscriptions: [{ pattern: "prm.*" }],
    });

    expect(inv[0].events.subscribed.sort()).toEqual([
      "prm.method.deprecated",
      "prm.method.published",
    ]);
    expect(inv[0].events.status).toBe("wired");
  });
});

describe("report renderer", () => {
  it("renders a deterministic markdown report", () => {
    const inv = [
      { ...emptyInventory("prm", "PRM", "server/prm"), serverManifestExists: true },
    ];
    const report = {
      generatedAt: "2026-05-01T00:00:00.000Z",
      modules: inv,
      findings: [],
      totals: rollUp(inv, []),
    };
    const md = renderReportMarkdown(report);
    expect(md).toContain("# Module Wiring Report");
    expect(md).toContain("Generated: 2026-05-01T00:00:00.000Z");
    expect(md).toContain("| prm |");
    expect(md).toContain("No findings.");
  });

  it("groups findings by severity", () => {
    const inv = [emptyInventory("prm", "PRM", "server/prm")];
    const report = {
      generatedAt: "2026-05-01T00:00:00.000Z",
      modules: inv,
      findings: [
        {
          module: "prm" as const,
          lane: "publicApi" as const,
          status: "declared-only" as const,
          severity: "follow-up" as const,
          message: "declared but unregistered",
        },
        {
          module: "(platform)" as const,
          lane: "event" as const,
          status: "missing" as const,
          severity: "blocker" as const,
          message: "envelope missing field X",
        },
      ],
      totals: rollUp(inv, []),
    };
    const md = renderReportMarkdown(report);
    expect(md).toContain("### BLOCKER");
    expect(md).toContain("### FOLLOW-UP");
    expect(md.indexOf("### BLOCKER")).toBeLessThan(md.indexOf("### FOLLOW-UP"));
  });
});
