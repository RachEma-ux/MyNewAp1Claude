import { describe, it, expect, beforeEach } from "vitest";
import {
  getDefaultPermissions,
  canEditWorkflow,
  canPublishWorkflow,
  canExecuteWorkflow,
  addPermission,
  removePermission,
  setWorkflowPublic,
  getWorkflowPermissions,
} from "./permissions";
import * as db from "../db";

describe("Permissions System", () => {
  const ownerId = 1;
  const otherUserId = 2;
  let testWorkflowId: number;

  beforeEach(async () => {
    // Create a test workflow
    const workflow = await db.createWorkflow({
      name: "Test Workflow",
      description: "For permissions testing",
      nodes: JSON.stringify([]),
      edges: JSON.stringify([]),
      userId: ownerId,
    });
    testWorkflowId = workflow.id;

    // Set default permissions
    const defaultPerms = getDefaultPermissions(ownerId);
    await db.updateWorkflow(testWorkflowId, {
      permissions: defaultPerms as any,
    }, ownerId);
  });

  it("should give owner all permissions by default", () => {
    const perms = getDefaultPermissions(ownerId);
    expect(perms.canEdit).toContain(ownerId);
    expect(perms.canPublish).toContain(ownerId);
    expect(perms.canExecute).toContain(ownerId);
  });

  it("should allow owner to edit workflow", async () => {
    const canEdit = await canEditWorkflow(testWorkflowId, ownerId);
    expect(canEdit).toBe(true);
  });

  it("should deny non-owner edit without permission", async () => {
    const canEdit = await canEditWorkflow(testWorkflowId, otherUserId);
    expect(canEdit).toBe(false);
  });

  it("should allow owner to publish workflow", async () => {
    const canPublish = await canPublishWorkflow(testWorkflowId, ownerId);
    expect(canPublish).toBe(true);
  });

  it("should deny non-owner publish without permission", async () => {
    const canPublish = await canPublishWorkflow(testWorkflowId, otherUserId);
    expect(canPublish).toBe(false);
  });

  it("should allow owner to execute workflow", async () => {
    const canExecute = await canExecuteWorkflow(testWorkflowId, ownerId);
    expect(canExecute).toBe(true);
  });

  it("should deny non-owner execute without permission", async () => {
    const canExecute = await canExecuteWorkflow(testWorkflowId, otherUserId);
    expect(canExecute).toBe(false);
  });

  it("should allow adding edit permission", async () => {
    await addPermission(testWorkflowId, ownerId, otherUserId, "canEdit");
    const canEdit = await canEditWorkflow(testWorkflowId, otherUserId);
    expect(canEdit).toBe(true);
  });

  it("should allow adding publish permission", async () => {
    await addPermission(testWorkflowId, ownerId, otherUserId, "canPublish");
    const canPublish = await canPublishWorkflow(testWorkflowId, otherUserId);
    expect(canPublish).toBe(true);
  });

  it("should allow adding execute permission", async () => {
    await addPermission(testWorkflowId, ownerId, otherUserId, "canExecute");
    const canExecute = await canExecuteWorkflow(testWorkflowId, otherUserId);
    expect(canExecute).toBe(true);
  });

  it("should allow removing permission", async () => {
    await addPermission(testWorkflowId, ownerId, otherUserId, "canEdit");
    let canEdit = await canEditWorkflow(testWorkflowId, otherUserId);
    expect(canEdit).toBe(true);

    await removePermission(testWorkflowId, ownerId, otherUserId, "canEdit");
    canEdit = await canEditWorkflow(testWorkflowId, otherUserId);
    expect(canEdit).toBe(false);
  });

  it("should allow setting workflow as public", async () => {
    await setWorkflowPublic(testWorkflowId, ownerId, true);
    const canExecute = await canExecuteWorkflow(testWorkflowId, otherUserId);
    expect(canExecute).toBe(true);
  });

  it("should deny non-owner from modifying permissions", async () => {
    await expect(
      addPermission(testWorkflowId, otherUserId, 3, "canEdit")
    ).rejects.toThrow("Only the owner");
  });

  it("should deny non-owner from setting public status", async () => {
    await expect(
      setWorkflowPublic(testWorkflowId, otherUserId, true)
    ).rejects.toThrow("Only the owner");
  });

  it("should allow owner to get workflow permissions", async () => {
    const perms = await getWorkflowPermissions(testWorkflowId, ownerId);
    expect(perms).toBeTruthy();
    expect(perms?.canEdit).toContain(ownerId);
  });

  it("should deny non-owner from viewing permissions", async () => {
    await expect(
      getWorkflowPermissions(testWorkflowId, otherUserId)
    ).rejects.toThrow("Only the owner");
  });
});
