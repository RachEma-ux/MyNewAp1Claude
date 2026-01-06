import type { Node, Edge } from "reactflow";

/**
 * Workflow Validation System
 * Provides structured validation with error codes, severity levels, and locations
 */

export interface ValidationError {
  severity: "error" | "warn" | "info";
  code: string;
  message: string;
  location: {
    nodeId?: string;
    edgeId?: string;
    field?: string;
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  info: ValidationError[];
}

/**
 * Validate a workflow graph
 */
export function validateWorkflow(
  nodes: Node[],
  edges: Edge[]
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const info: ValidationError[] = [];

  // Validation Rule 1: Must have at least one node
  if (nodes.length === 0) {
    errors.push({
      severity: "error",
      code: "EMPTY_WORKFLOW",
      message: "Workflow must have at least one node",
      location: {},
    });
  }

  // Validation Rule 2: Must have at least one trigger node
  const triggerNodes = nodes.filter(
    (n) => n.data.blockType === "trigger" || n.type === "input"
  );
  if (nodes.length > 0 && triggerNodes.length === 0) {
    errors.push({
      severity: "error",
      code: "MISSING_TRIGGER",
      message: "Workflow must have at least one trigger node (Time Trigger, Webhook, or File Upload)",
      location: {},
    });
  }

  // Validation Rule 3: Check for disconnected nodes (orphaned nodes)
  if (nodes.length > 1) {
    const connectedNodeIds = new Set<string>();
    
    // Build set of all connected nodes
    edges.forEach((edge) => {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    });

    // Find disconnected nodes
    const disconnectedNodes = nodes.filter(
      (node) => !connectedNodeIds.has(node.id)
    );

    disconnectedNodes.forEach((node) => {
      warnings.push({
        severity: "warn",
        code: "DISCONNECTED_NODE",
        message: `Node "${node.data.label || node.id}" is not connected to any other nodes`,
        location: { nodeId: node.id },
      });
    });
  }

  // Validation Rule 4: Check for cycles (infinite loops)
  const cycles = detectCycles(nodes, edges);
  if (cycles.length > 0) {
    cycles.forEach((cycle) => {
      errors.push({
        severity: "error",
        code: "CYCLE_DETECTED",
        message: `Cycle detected: ${cycle.join(" → ")} → ${cycle[0]}. This will cause an infinite loop.`,
        location: { nodeId: cycle[0] },
      });
    });
  }

  // Validation Rule 5: Check for duplicate node IDs
  const nodeIds = nodes.map((n) => n.id);
  const duplicateIds = nodeIds.filter(
    (id, index) => nodeIds.indexOf(id) !== index
  );
  if (duplicateIds.length > 0) {
    duplicateIds.forEach((id) => {
      errors.push({
        severity: "error",
        code: "DUPLICATE_NODE_ID",
        message: `Duplicate node ID detected: "${id}"`,
        location: { nodeId: id },
      });
    });
  }

  // Validation Rule 6: Check edge source/target nodes exist
  edges.forEach((edge) => {
    const sourceExists = nodes.some((n) => n.id === edge.source);
    const targetExists = nodes.some((n) => n.id === edge.target);

    if (!sourceExists) {
      errors.push({
        severity: "error",
        code: "INVALID_EDGE_SOURCE",
        message: `Edge "${edge.id}" references non-existent source node "${edge.source}"`,
        location: { edgeId: edge.id },
      });
    }

    if (!targetExists) {
      errors.push({
        severity: "error",
        code: "INVALID_EDGE_TARGET",
        message: `Edge "${edge.id}" references non-existent target node "${edge.target}"`,
        location: { edgeId: edge.id },
      });
    }
  });

  // Validation Rule 7: Check for missing node labels
  nodes.forEach((node) => {
    if (!node.data.label || node.data.label.trim() === "") {
      info.push({
        severity: "info",
        code: "MISSING_NODE_LABEL",
        message: `Node "${node.id}" has no label. Consider adding a descriptive label.`,
        location: { nodeId: node.id },
      });
    }
  });

  // Validation Rule 8: Check for unreachable nodes (nodes with no incoming edges)
  if (nodes.length > 1 && edges.length > 0) {
    const nodesWithIncomingEdges = new Set(edges.map((e) => e.target));
    const triggerNodeIds = new Set(triggerNodes.map((n) => n.id));
    
    nodes.forEach((node) => {
      // Skip trigger nodes (they don't need incoming edges)
      if (triggerNodeIds.has(node.id)) return;
      
      if (!nodesWithIncomingEdges.has(node.id)) {
        warnings.push({
          severity: "warn",
          code: "UNREACHABLE_NODE",
          message: `Node "${node.data.label || node.id}" has no incoming connections and will never execute`,
          location: { nodeId: node.id },
        });
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    info,
  };
}

/**
 * Detect cycles in the workflow graph using DFS
 */
function detectCycles(nodes: Node[], edges: Edge[]): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  // Build adjacency list
  const adjacency = new Map<string, string[]>();
  nodes.forEach((node) => adjacency.set(node.id, []));
  edges.forEach((edge) => {
    const neighbors = adjacency.get(edge.source) || [];
    neighbors.push(edge.target);
    adjacency.set(edge.source, neighbors);
  });

  // DFS to detect cycles
  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);

    const neighbors = adjacency.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recursionStack.has(neighbor)) {
        // Cycle detected
        const cycleStart = path.indexOf(neighbor);
        cycles.push(path.slice(cycleStart));
        return true;
      }
    }

    recursionStack.delete(nodeId);
    path.pop();
    return false;
  }

  // Check each node
  nodes.forEach((node) => {
    if (!visited.has(node.id)) {
      dfs(node.id);
    }
  });

  return cycles;
}

/**
 * Format validation result as human-readable text
 */
export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [];

  if (result.valid) {
    lines.push("✓ Workflow validation passed");
  } else {
    lines.push("✗ Workflow validation failed");
  }

  if (result.errors.length > 0) {
    lines.push(`\nErrors (${result.errors.length}):`);
    result.errors.forEach((err) => {
      lines.push(`  • [${err.code}] ${err.message}`);
    });
  }

  if (result.warnings.length > 0) {
    lines.push(`\nWarnings (${result.warnings.length}):`);
    result.warnings.forEach((warn) => {
      lines.push(`  • [${warn.code}] ${warn.message}`);
    });
  }

  if (result.info.length > 0) {
    lines.push(`\nInfo (${result.info.length}):`);
    result.info.forEach((info) => {
      lines.push(`  • [${info.code}] ${info.message}`);
    });
  }

  return lines.join("\n");
}
