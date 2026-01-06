import { describe, it, expect, beforeAll } from "vitest";
import * as db from "./db";

describe("Workflow Fetching - Database Integration", () => {
  const testUserId = 1;

  it("should fetch workflows from database for userId 1", async () => {
    const workflows = await db.getUserWorkflows(testUserId);
    
    console.log(`Found ${workflows.length} workflows for userId ${testUserId}`);
    workflows.forEach((w: any) => {
      console.log(`  - ID: ${w.id}, Name: ${w.name}, Status: ${w.status}`);
    });
    
    expect(workflows).toBeDefined();
    expect(Array.isArray(workflows)).toBe(true);
    expect(workflows.length).toBeGreaterThan(0);
  });

  it("should return workflows with correct structure", async () => {
    const workflows = await db.getUserWorkflows(testUserId);
    
    if (workflows.length > 0) {
      const workflow = workflows[0];
      expect(workflow).toHaveProperty("id");
      expect(workflow).toHaveProperty("userId");
      expect(workflow).toHaveProperty("name");
      expect(workflow).toHaveProperty("nodes");
      expect(workflow).toHaveProperty("edges");
      expect(workflow).toHaveProperty("status");
      expect(workflow.userId).toBe(testUserId);
    }
  });

  it("should not return deleted workflows", async () => {
    const workflows = await db.getUserWorkflows(testUserId);
    
    const deletedWorkflows = workflows.filter((w: any) => w.status === "deleted");
    expect(deletedWorkflows.length).toBe(0);
  });

  it("should return workflows ordered by updatedAt descending", async () => {
    const workflows = await db.getUserWorkflows(testUserId);
    
    if (workflows.length > 1) {
      for (let i = 0; i < workflows.length - 1; i++) {
        const current = new Date(workflows[i].updatedAt).getTime();
        const next = new Date(workflows[i + 1].updatedAt).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    }
  });
});
