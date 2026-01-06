import { describe, it, expect } from "vitest";
import * as db from "../db";

describe("Workflow Execution Integration", () => {
  const userId = 1;

  it("should create workflow with default permissions", async () => {
    const workflow = await db.createWorkflow({
      name: "Integration Test Workflow",
      description: "Test workflow creation",
      nodes: JSON.stringify([
        {
          id: "1",
          type: "workflow",
          position: { x: 0, y: 0 },
          data: { label: "Time Trigger", blockType: "time_trigger" },
        },
      ]),
      edges: JSON.stringify([]),
      userId,
    });

    expect(workflow).toBeTruthy();
    expect(workflow.name).toBe("Integration Test Workflow");
    expect(workflow.userId).toBe(userId);
  });

  it("should retrieve workflow by ID", async () => {
    const created = await db.createWorkflow({
      name: "Retrieve Test",
      description: "Test retrieval",
      nodes: JSON.stringify([]),
      edges: JSON.stringify([]),
      userId,
    });

    const retrieved = await db.getWorkflowById(created.id, userId);
    expect(retrieved).toBeTruthy();
    expect(retrieved?.id).toBe(created.id);
  });

  it("should list user workflows", async () => {
    await db.createWorkflow({
      name: "List Test 1",
      description: "First workflow",
      nodes: JSON.stringify([]),
      edges: JSON.stringify([]),
      userId,
    });

    await db.createWorkflow({
      name: "List Test 2",
      description: "Second workflow",
      nodes: JSON.stringify([]),
      edges: JSON.stringify([]),
      userId,
    });

    const workflows = await db.getUserWorkflows(userId);
    expect(workflows.length).toBeGreaterThanOrEqual(2);
  });

  it("should update workflow", async () => {
    const created = await db.createWorkflow({
      name: "Update Test",
      description: "Original description",
      nodes: JSON.stringify([]),
      edges: JSON.stringify([]),
      userId,
    });

    await db.updateWorkflow(
      created.id,
      {
        name: "Updated Name",
        description: "Updated description",
      },
      userId
    );

    const updated = await db.getWorkflowById(created.id, userId);
    expect(updated?.name).toBe("Updated Name");
    expect(updated?.description).toBe("Updated description");
  });

  it("should delete workflow", async () => {
    const created = await db.createWorkflow({
      name: "Delete Test",
      description: "To be deleted",
      nodes: JSON.stringify([]),
      edges: JSON.stringify([]),
      userId,
    });

    await db.deleteWorkflow(created.id, userId);
    const retrieved = await db.getWorkflowById(created.id, userId);
    expect(retrieved).toBeNull();
  });
});
