import { describe, it, expect, beforeAll } from "vitest";
import { createWorkflow, getUserWorkflows, deleteWorkflow } from "./db";

describe("Workflow Save Functionality", () => {
  let testWorkflowId: number;

  it("should create a workflow with nodes and edges", async () => {
    const testNodes = JSON.stringify([
      {
        id: "time-trigger-1",
        type: "input",
        data: { label: "Time Trigger" },
        position: { x: 250, y: 100 },
      },
      {
        id: "database-action-1",
        type: "default",
        data: { label: "Database Query" },
        position: { x: 250, y: 250 },
      },
    ]);

    const testEdges = JSON.stringify([
      {
        id: "edge-1",
        source: "time-trigger-1",
        target: "database-action-1",
      },
    ]);

    const workflow = await createWorkflow({
      userId: 1,
      name: "Test Workflow Save",
      description: "Testing workflow persistence",
      nodes: testNodes,
      edges: testEdges,
    });

    expect(workflow).toBeDefined();
    expect(workflow.id).toBeGreaterThan(0);
    expect(workflow.name).toBe("Test Workflow Save");
    expect(workflow.description).toBe("Testing workflow persistence");
    expect(workflow.nodes).toBe(testNodes);
    expect(workflow.edges).toBe(testEdges);
    expect(workflow.status).toBe("draft");
    expect(workflow.userId).toBe(1);

    testWorkflowId = workflow.id;
  });

  it("should retrieve the created workflow", async () => {
    const workflows = await getUserWorkflows(1);

    expect(workflows).toBeDefined();
    expect(workflows.length).toBeGreaterThan(0);

    const savedWorkflow = workflows.find((w) => w.id === testWorkflowId);
    expect(savedWorkflow).toBeDefined();
    expect(savedWorkflow?.name).toBe("Test Workflow Save");
  });

  it("should delete the test workflow", async () => {
    await deleteWorkflow(testWorkflowId, 1);

    const workflows = await getUserWorkflows(1);
    const deletedWorkflow = workflows.find((w) => w.id === testWorkflowId);

    expect(deletedWorkflow).toBeUndefined();
  });
});
