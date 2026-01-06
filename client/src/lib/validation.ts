import type { Node, Edge } from "reactflow";
import type { ValidationError } from "@/components/ValidationPanel";

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  info: ValidationError[];
}

export function validateWorkflow(nodes: Node[], edges: Edge[]): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const info: ValidationError[] = [];

  // 1. Check if workflow is empty
  if (nodes.length === 0) {
    errors.push({
      severity: "error",
      code: "EMPTY_WORKFLOW",
      message: "Workflow must contain at least one node",
    });
    return { valid: false, errors, warnings, info };
  }

  // 2. Check for trigger node
  const triggerNodes = nodes.filter(n => n.data?.blockType === "trigger");
  if (triggerNodes.length === 0) {
    errors.push({
      severity: "error",
      code: "MISSING_TRIGGER",
      message: "Workflow must have at least one trigger node",
    });
  }

  // 3. Check for duplicate node IDs
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) {
      errors.push({
        severity: "error",
        code: "DUPLICATE_NODE_ID",
        message: `Duplicate node ID found: ${node.id}`,
        nodeId: node.id,
      });
    }
    nodeIds.add(node.id);
  }

  // 4. Validate edges
  for (const edge of edges) {
    const sourceExists = nodes.some(n => n.id === edge.source);
    const targetExists = nodes.some(n => n.id === edge.target);

    if (!sourceExists) {
      errors.push({
        severity: "error",
        code: "INVALID_EDGE_SOURCE",
        message: `Edge references non-existent source node: ${edge.source}`,
      });
    }

    if (!targetExists) {
      errors.push({
        severity: "error",
        code: "INVALID_EDGE_TARGET",
        message: `Edge references non-existent target node: ${edge.target}`,
      });
    }
  }

  // 5. Check for cycles (DFS-based cycle detection)
  const adjList = new Map<string, string[]>();
  for (const node of nodes) {
    adjList.set(node.id, []);
  }
  for (const edge of edges) {
    adjList.get(edge.source)?.push(edge.target);
  }

  const visited = new Set<string>();
  const recStack = new Set<string>();
  let cycleDetected = false;
  let cyclePath: string[] = [];

  function dfs(nodeId: string, path: string[]): boolean {
    visited.add(nodeId);
    recStack.add(nodeId);
    path.push(nodeId);

    const neighbors = adjList.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor, [...path])) {
          return true;
        }
      } else if (recStack.has(neighbor)) {
        cyclePath = [...path, neighbor];
        return true;
      }
    }

    recStack.delete(nodeId);
    return false;
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      if (dfs(node.id, [])) {
        cycleDetected = true;
        break;
      }
    }
  }

  if (cycleDetected) {
    errors.push({
      severity: "error",
      code: "CYCLE_DETECTED",
      message: `Cycle detected: ${cyclePath.join(" → ")}. This will cause an infinite loop.`,
    });
  }

  // 6. Check for disconnected nodes (nodes with no incoming or outgoing edges)
  for (const node of nodes) {
    const hasIncoming = edges.some(e => e.target === node.id);
    const hasOutgoing = edges.some(e => e.source === node.id);

    if (!hasIncoming && !hasOutgoing && node.data?.blockType !== "trigger") {
      warnings.push({
        severity: "warn",
        code: "DISCONNECTED_NODE",
        message: `Node "${node.data?.label || node.id}" is not connected to any other nodes`,
        nodeId: node.id,
      });
    }
  }

  // 7. Check for unreachable nodes (nodes that can't be reached from triggers)
  const reachable = new Set<string>();
  function markReachable(nodeId: string) {
    if (reachable.has(nodeId)) return;
    reachable.add(nodeId);
    const outgoing = edges.filter(e => e.source === nodeId);
    for (const edge of outgoing) {
      markReachable(edge.target);
    }
  }

  for (const trigger of triggerNodes) {
    markReachable(trigger.id);
  }

  for (const node of nodes) {
    if (!reachable.has(node.id) && node.data?.blockType !== "trigger") {
      warnings.push({
        severity: "warn",
        code: "UNREACHABLE_NODE",
        message: `Node "${node.data?.label || node.id}" cannot be reached from any trigger`,
        nodeId: node.id,
      });
    }
  }

  // 8. Check for missing node labels
  for (const node of nodes) {
    if (!node.data?.label || node.data.label.trim() === "") {
      info.push({
        severity: "info",
        code: "MISSING_NODE_LABEL",
        message: `Node ${node.id} has no label`,
        nodeId: node.id,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    info,
  };
}
