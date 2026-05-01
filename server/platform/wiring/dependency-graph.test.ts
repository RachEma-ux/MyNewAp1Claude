/**
 * AWI dependency-graph tests.
 *
 * Covers node/edge construction from the real inventory, cycle
 * detection, and the convenience getters for forward/reverse deps.
 */
import { describe, expect, it } from "vitest";
import {
  buildDependencyGraph,
  buildGraphFromInventory,
  detectDependencyCycles,
  getModuleDependencies,
  getReverseDependencies,
  type ModuleWiringInventory,
} from "./index";

describe("buildDependencyGraph", () => {
  it("emits a module node for every registered module", () => {
    const g = buildDependencyGraph();
    const moduleNodes = g.nodes.filter((n) => n.type === "module");
    expect(moduleNodes.length).toBeGreaterThan(0);
    // Every edge source should be a module node.
    const moduleIds = new Set(moduleNodes.map((n) => n.id));
    for (const e of g.edges) {
      expect(moduleIds.has(e.source), `edge source ${e.source} not a module`).toBe(true);
    }
  });

  it("emits a db node for every owned database", () => {
    const g = buildDependencyGraph();
    const dbNodes = g.nodes.filter((n) => n.type === "database");
    // We expect at least the platform-DB-shared modules + the per-module DBs (codedb, asdb, prmdb, psmdb, ragdb, wfdb).
    expect(dbNodes.length).toBeGreaterThan(0);
  });

  it("emits event/handoff/governance nodes for declared types", () => {
    const g = buildDependencyGraph();
    expect(g.nodes.some((n) => n.type === "event")).toBe(true);
    expect(g.nodes.some((n) => n.type === "handoff")).toBe(true);
    expect(g.nodes.some((n) => n.type === "governance")).toBe(true);
  });

  it("getModuleDependencies returns only outgoing edges", () => {
    const edges = getModuleDependencies("codeStudio");
    for (const e of edges) {
      expect(e.source).toBe("module:codeStudio");
    }
  });

  it("getReverseDependencies returns only incoming edges", () => {
    const edges = getReverseDependencies("codeStudio");
    for (const e of edges) {
      expect(e.target).toBe("module:codeStudio");
    }
  });

  it("detectDependencyCycles handles a no-cycle inventory", () => {
    // Synthetic: two modules, no module→module edges → no cycles.
    const inv: ModuleWiringInventory[] = [
      {
        moduleKey: "a",
        moduleName: "A",
        areas: [],
        dependencies: [
          { sourceModule: "a", target: "db:adb", targetType: "database", dependencyType: "owned", required: true },
        ],
        readinessScore: 100,
        readinessStatus: "fully-wired",
        blockers: [],
        warnings: [],
      },
      {
        moduleKey: "b",
        moduleName: "B",
        areas: [],
        dependencies: [],
        readinessScore: 100,
        readinessStatus: "fully-wired",
        blockers: [],
        warnings: [],
      },
    ];
    const g = buildGraphFromInventory(inv);
    expect(g.cycles).toEqual([]);
  });

  it("detects a 2-module cycle", () => {
    const inv: ModuleWiringInventory[] = [
      {
        moduleKey: "a",
        moduleName: "A",
        areas: [],
        dependencies: [
          { sourceModule: "a", target: "module:b", targetType: "module", dependencyType: "consumes-port", required: true },
        ],
        readinessScore: 100,
        readinessStatus: "fully-wired",
        blockers: [],
        warnings: [],
      },
      {
        moduleKey: "b",
        moduleName: "B",
        areas: [],
        dependencies: [
          { sourceModule: "b", target: "module:a", targetType: "module", dependencyType: "consumes-port", required: true },
        ],
        readinessScore: 100,
        readinessStatus: "fully-wired",
        blockers: [],
        warnings: [],
      },
    ];
    const cycles = detectDependencyCycles(inv);
    expect(cycles.length).toBe(1);
    expect(cycles[0].sort()).toEqual(["a", "b"]);
  });

  it("detects a self-loop", () => {
    const inv: ModuleWiringInventory[] = [
      {
        moduleKey: "x",
        moduleName: "X",
        areas: [],
        dependencies: [
          { sourceModule: "x", target: "module:x", targetType: "module", dependencyType: "consumes-port", required: true },
        ],
        readinessScore: 100,
        readinessStatus: "fully-wired",
        blockers: [],
        warnings: [],
      },
    ];
    const cycles = detectDependencyCycles(inv);
    expect(cycles.length).toBe(1);
    expect(cycles[0]).toEqual(["x"]);
  });
});
