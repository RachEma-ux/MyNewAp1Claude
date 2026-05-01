/**
 * Application Wiring Inventory — Dependency graph
 *
 * Graph nodes:
 *   - module:<key>          → a registered module
 *   - db:<dbkey>            → a database (owned or shared)
 *   - event:<type>          → a platform event type
 *   - handoff:<type>        → a platform handoff type
 *   - port:<service>        → a logical service port
 *   - gov:<module>          → governance authority for a module
 *   - api:<action>          → public-API action
 *
 * Edge `type` is the dependency kind ("owned", "consumes",
 * "produces", "accepts", "provides", "consumes-port", "declares").
 *
 * Cycle detection runs over the module-only sub-graph (we only consider
 * `module:` → `module:` edges induced by `consumes-port`). Other node
 * types are leaves and cannot participate in a cycle.
 */
import { buildApplicationWiringInventory, type BuildAwiOptions } from "./inventory";
import { KNOWN_MODULES } from "../modules/wiring-inventory";
import type { ModuleWiringInventory, WiringGraph, WiringGraphEdge, WiringGraphNode } from "./types";

export function buildDependencyGraph(opts: BuildAwiOptions = {}): WiringGraph {
  const modules = buildApplicationWiringInventory(opts);
  return buildGraphFromInventory(modules);
}

export function buildGraphFromInventory(modules: ModuleWiringInventory[]): WiringGraph {
  const nodes = new Map<string, WiringGraphNode>();
  const edges: WiringGraphEdge[] = [];
  let edgeIdCounter = 0;

  function addNode(node: WiringGraphNode) {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  }

  // Seed all known modules so isolated modules still appear in the graph.
  for (const km of KNOWN_MODULES) {
    addNode({
      id: `module:${km.key}`,
      label: km.name,
      type: "module",
    });
  }

  for (const mod of modules) {
    addNode({
      id: `module:${mod.moduleKey}`,
      label: mod.moduleName,
      type: "module",
      status: mod.readinessStatus,
      readinessScore: mod.readinessScore,
    });
    for (const dep of mod.dependencies) {
      const targetType = dep.targetType === "unknown" ? "module" : (dep.targetType as WiringGraphNode["type"]);
      addNode({
        id: dep.target,
        label: dep.target.split(":").slice(1).join(":") || dep.target,
        type: targetType,
      });
      edges.push({
        id: `e${edgeIdCounter++}`,
        source: `module:${mod.moduleKey}`,
        target: dep.target,
        type: dep.dependencyType,
        required: dep.required,
      });
    }
  }

  const cycles = detectModuleCycles(modules);

  return {
    nodes: [...nodes.values()],
    edges,
    cycles,
  };
}

export function getModuleDependencies(
  moduleKey: string,
  modules?: ModuleWiringInventory[],
): WiringGraphEdge[] {
  const inv = modules ?? buildApplicationWiringInventory();
  const graph = buildGraphFromInventory(inv);
  return graph.edges.filter((e) => e.source === `module:${moduleKey}`);
}

export function getReverseDependencies(
  moduleKey: string,
  modules?: ModuleWiringInventory[],
): WiringGraphEdge[] {
  const inv = modules ?? buildApplicationWiringInventory();
  const graph = buildGraphFromInventory(inv);
  return graph.edges.filter((e) => e.target === `module:${moduleKey}`);
}

export function detectDependencyCycles(modules?: ModuleWiringInventory[]): string[][] {
  const inv = modules ?? buildApplicationWiringInventory();
  return detectModuleCycles(inv);
}

/**
 * DFS-based cycle finder over the induced module-graph.
 *
 * Only `module:<key>` → `module:<key>` edges are considered (those come
 * from `consumes-port` where the port has the form `<otherModule>.<verb>`).
 * Self-loops are reported.
 */
function detectModuleCycles(modules: ModuleWiringInventory[]): string[][] {
  const adj = new Map<string, Set<string>>();
  for (const mod of modules) {
    adj.set(mod.moduleKey, new Set());
    for (const d of mod.dependencies) {
      if (d.targetType !== "module") continue;
      const target = d.target.replace(/^module:/, "");
      if (!target || target === mod.moduleKey) {
        // Self-loop is its own cycle — record it directly.
        if (target === mod.moduleKey) {
          adj.get(mod.moduleKey)!.add(mod.moduleKey);
        }
        continue;
      }
      adj.get(mod.moduleKey)!.add(target);
    }
  }

  const cycles: string[][] = [];
  const seenCycle = new Set<string>();

  function record(path: string[]) {
    // Normalize the cycle so a→b→a == b→a→b.
    const minIdx = path.indexOf(
      path.reduce((min, cur) => (cur < min ? cur : min)),
    );
    const rotated = [...path.slice(minIdx), ...path.slice(0, minIdx)];
    const key = rotated.join("→");
    if (seenCycle.has(key)) return;
    seenCycle.add(key);
    cycles.push(rotated);
  }

  function dfs(node: string, stack: string[], onStack: Set<string>) {
    if (onStack.has(node)) {
      const idx = stack.indexOf(node);
      record(stack.slice(idx));
      return;
    }
    if (!adj.has(node)) return;
    stack.push(node);
    onStack.add(node);
    for (const next of adj.get(node)!) {
      dfs(next, stack, onStack);
    }
    stack.pop();
    onStack.delete(node);
  }

  for (const start of adj.keys()) {
    dfs(start, [], new Set());
  }

  return cycles;
}
