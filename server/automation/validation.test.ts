import { describe, it, expect } from "vitest";
import { validateWorkflow } from "./validation";
import type { Node, Edge } from "reactflow";

describe("Workflow Validation", () => {
  it("should pass validation for valid workflow with trigger and action", () => {
    const nodes: Node[] = [
      {
        id: "1",
        type: "input",
        position: { x: 0, y: 0 },
        data: { label: "Time Trigger", blockType: "trigger" },
      },
      {
        id: "2",
        type: "default",
        position: { x: 200, y: 0 },
        data: { label: "Database Query", blockType: "action" },
      },
    ];

    const edges: Edge[] = [
      {
        id: "e1-2",
        source: "1",
        target: "2",
      },
    ];

    const result = validateWorkflow(nodes, edges);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should fail validation for empty workflow", () => {
    const result = validateWorkflow([], []);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe("EMPTY_WORKFLOW");
  });

  it("should fail validation for workflow without trigger", () => {
    const nodes: Node[] = [
      {
        id: "1",
        type: "default",
        position: { x: 0, y: 0 },
        data: { label: "Database Query", blockType: "action" },
      },
    ];

    const result = validateWorkflow(nodes, []);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe("MISSING_TRIGGER");
  });

  it("should warn about disconnected nodes", () => {
    const nodes: Node[] = [
      {
        id: "1",
        type: "input",
        position: { x: 0, y: 0 },
        data: { label: "Time Trigger", blockType: "trigger" },
      },
      {
        id: "2",
        type: "default",
        position: { x: 200, y: 0 },
        data: { label: "Database Query", blockType: "action" },
      },
      {
        id: "3",
        type: "default",
        position: { x: 400, y: 0 },
        data: { label: "Orphaned Node", blockType: "action" },
      },
    ];

    const edges: Edge[] = [
      {
        id: "e1-2",
        source: "1",
        target: "2",
      },
    ];

    const result = validateWorkflow(nodes, edges);
    expect(result.valid).toBe(true); // Warnings don't fail validation
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings.some(w => w.code === "DISCONNECTED_NODE")).toBe(true);
  });

  it("should detect cycles", () => {
    const nodes: Node[] = [
      {
        id: "1",
        type: "input",
        position: { x: 0, y: 0 },
        data: { label: "Time Trigger", blockType: "trigger" },
      },
      {
        id: "2",
        type: "default",
        position: { x: 200, y: 0 },
        data: { label: "Node A", blockType: "action" },
      },
      {
        id: "3",
        type: "default",
        position: { x: 400, y: 0 },
        data: { label: "Node B", blockType: "action" },
      },
    ];

    const edges: Edge[] = [
      { id: "e1-2", source: "1", target: "2" },
      { id: "e2-3", source: "2", target: "3" },
      { id: "e3-2", source: "3", target: "2" }, // Cycle: 2 → 3 → 2
    ];

    const result = validateWorkflow(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe("CYCLE_DETECTED");
  });

  it("should detect duplicate node IDs", () => {
    const nodes: Node[] = [
      {
        id: "1",
        type: "input",
        position: { x: 0, y: 0 },
        data: { label: "Time Trigger", blockType: "trigger" },
      },
      {
        id: "1", // Duplicate ID
        type: "default",
        position: { x: 200, y: 0 },
        data: { label: "Database Query", blockType: "action" },
      },
    ];

    const result = validateWorkflow(nodes, []);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe("DUPLICATE_NODE_ID");
  });

  it("should detect invalid edge source", () => {
    const nodes: Node[] = [
      {
        id: "1",
        type: "input",
        position: { x: 0, y: 0 },
        data: { label: "Time Trigger", blockType: "trigger" },
      },
    ];

    const edges: Edge[] = [
      {
        id: "e1-2",
        source: "999", // Non-existent node
        target: "1",
      },
    ];

    const result = validateWorkflow(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe("INVALID_EDGE_SOURCE");
  });

  it("should detect invalid edge target", () => {
    const nodes: Node[] = [
      {
        id: "1",
        type: "input",
        position: { x: 0, y: 0 },
        data: { label: "Time Trigger", blockType: "trigger" },
      },
    ];

    const edges: Edge[] = [
      {
        id: "e1-2",
        source: "1",
        target: "999", // Non-existent node
      },
    ];

    const result = validateWorkflow(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe("INVALID_EDGE_TARGET");
  });

  it("should warn about unreachable nodes", () => {
    const nodes: Node[] = [
      {
        id: "1",
        type: "input",
        position: { x: 0, y: 0 },
        data: { label: "Time Trigger", blockType: "trigger" },
      },
      {
        id: "2",
        type: "default",
        position: { x: 200, y: 0 },
        data: { label: "Database Query", blockType: "action" },
      },
      {
        id: "3",
        type: "default",
        position: { x: 400, y: 0 },
        data: { label: "Unreachable Node", blockType: "action" },
      },
    ];

    const edges: Edge[] = [
      {
        id: "e1-2",
        source: "1",
        target: "2",
      },
      // Node 3 has no incoming edges
    ];

    const result = validateWorkflow(nodes, edges);
    expect(result.valid).toBe(true); // Warnings don't fail validation
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings.some(w => w.code === "UNREACHABLE_NODE")).toBe(true);
  });

  it("should provide info about missing node labels", () => {
    const nodes: Node[] = [
      {
        id: "1",
        type: "input",
        position: { x: 0, y: 0 },
        data: { label: "", blockType: "trigger" }, // Empty label
      },
    ];

    const result = validateWorkflow(nodes, []);
    expect(result.info).toHaveLength(1);
    expect(result.info[0].code).toBe("MISSING_NODE_LABEL");
  });
});
