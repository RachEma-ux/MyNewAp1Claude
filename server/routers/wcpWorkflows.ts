import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { executeWorkflow } from "../wcp/execution-engine";

export const wcpWorkflowsRouter = router({
  // Save or update a WCP workflow
  saveWorkflow: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        name: z.string(),
        description: z.string().optional(),
        nodes: z.string(), // JSON string of ReactFlow nodes
        edges: z.string(), // JSON string of ReactFlow edges
        status: z.enum(["draft", "active", "paused", "archived"]).default("draft"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      console.log('[wcpWorkflows.saveWorkflow] Mutation called with input:', input);
      console.log('[wcpWorkflows.saveWorkflow] User ID:', ctx.user.id);
      const { id, name, description, nodes, edges, status } = input;

      const db = getDb();
      if (!db) {
        console.error('[wcpWorkflows.saveWorkflow] Database not available');
        throw new Error("Database not available");
      }

      if (id) {
        // Update existing workflow
        console.log('[wcpWorkflows.saveWorkflow] Updating workflow ID:', id);
        const result = await db.execute(
          sql`UPDATE wcp_workflows 
              SET name = ${name}, 
                  description = ${description || ""}, 
                  nodes = ${nodes}, 
                  edges = ${edges}, 
                  status = ${status},
                  updatedAt = NOW()
              WHERE id = ${id}`
        );
        console.log('[wcpWorkflows.saveWorkflow] Update result:', result);

        return { id, message: "Workflow updated successfully" };
      } else {
        // Create new workflow
        console.log('[wcpWorkflows.saveWorkflow] Creating new workflow');
        const result: any = await db.execute(
          sql`INSERT INTO wcp_workflows (userId, name, description, nodes, edges, status)
              VALUES (${ctx.user.id}, ${name}, ${description || ""}, ${nodes}, ${edges}, ${status})
              RETURNING id`
        );
        const newId = result.rows?.[0]?.id ?? result[0]?.id;
        console.log('[wcpWorkflows.saveWorkflow] New workflow ID:', newId);

        return { id: newId, message: "Workflow created successfully" };
      }
    }),

  // Get all WCP workflows for the current user
  getWorkflows: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    if (!db) return [];

    const workflows: any = await db.execute(
      sql`SELECT * FROM wcp_workflows 
          WHERE userId = ${ctx.user.id} 
          AND status != 'deleted'
          ORDER BY updatedAt DESC`
    );

    return workflows[0].map((workflow: any) => ({
      ...workflow,
      nodes: JSON.parse(workflow.nodes),
      edges: JSON.parse(workflow.edges),
    }));
  }),

  // Get a single WCP workflow by ID
  getWorkflow: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      console.log('[wcpWorkflows.getWorkflow] Query called with id:', input.id);
      const db = getDb();
      if (!db) {
        console.error('[wcpWorkflows.getWorkflow] Database not available');
        throw new Error("Database not available");
      }

      console.log('[wcpWorkflows.getWorkflow] Executing SELECT query...');
      const workflows: any = await db.execute(
        sql`SELECT * FROM wcp_workflows WHERE id = ${input.id}`
      );

      console.log('[wcpWorkflows.getWorkflow] Query result:', workflows[0]);
      const workflow = workflows[0][0];
      if (!workflow) {
        console.error('[wcpWorkflows.getWorkflow] Workflow not found');
        throw new Error("Workflow not found");
      }

      // Check ownership
      if (workflow.userId !== ctx.user.id) {
        console.error('[wcpWorkflows.getWorkflow] Unauthorized access attempt');
        throw new Error("Unauthorized");
      }

      console.log('[wcpWorkflows.getWorkflow] Parsing nodes and edges...');
      console.log('[wcpWorkflows.getWorkflow] Raw nodes:', workflow.nodes);
      console.log('[wcpWorkflows.getWorkflow] Raw edges:', workflow.edges);
      
      try {
        const parsedNodes = JSON.parse(workflow.nodes);
        const parsedEdges = JSON.parse(workflow.edges);
        console.log('[wcpWorkflows.getWorkflow] Successfully parsed workflow data');
        return {
          ...workflow,
          nodes: parsedNodes,
          edges: parsedEdges,
        };
      } catch (error) {
        console.error('[wcpWorkflows.getWorkflow] JSON parse error:', error);
        throw new Error("Failed to parse workflow data");
      }
    }),

  // Delete a WCP workflow
  deleteWorkflow: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new Error("Database not available");

      // Check ownership
      const workflows: any = await db.execute(
        sql`SELECT * FROM wcp_workflows WHERE id = ${input.id}`
      );

      const workflow = workflows[0][0];
      if (!workflow) {
        throw new Error("Workflow not found");
      }

      if (workflow.userId !== ctx.user.id) {
        throw new Error("Unauthorized");
      }

      // Soft delete: set status to 'deleted' instead of removing from database
      await db.execute(
        sql`UPDATE wcp_workflows SET status = 'deleted' WHERE id = ${input.id}`
      );

      return { message: "Workflow deleted successfully" };
    }),

  // Get all executions for WCP workflows
  getExecutions: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    if (!db) return [];

    const executions: any = await db.execute(
      sql`SELECT * FROM wcp_executions 
          ORDER BY startedAt DESC 
          LIMIT 100`
    );

    return executions[0];
  }),

  // Create a new execution and execute the workflow
  createExecution: protectedProcedure
    .input(
      z.object({
        workflowId: z.number(),
        workflowName: z.string(),
        status: z.enum(["pending", "running", "completed", "failed", "cancelled"]).default("running"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      console.log('[wcpWorkflows.createExecution] Mutation called with input:', input);
      const db = getDb();
      if (!db) {
        console.error('[wcpWorkflows.createExecution] Database not available');
        throw new Error("Database not available");
      }

      // Get workflow data
      console.log('[wcpWorkflows.createExecution] Fetching workflow data...');
      const workflows: any = await db.execute(
        sql`SELECT * FROM wcp_workflows WHERE id = ${input.workflowId}`
      );

      const workflow = workflows[0][0];
      if (!workflow) {
        throw new Error("Workflow not found");
      }

      // Check ownership
      if (workflow.userId !== ctx.user.id) {
        throw new Error("Unauthorized");
      }

      // Parse nodes and edges
      const nodes = JSON.parse(workflow.nodes);
      const edges = JSON.parse(workflow.edges);

      console.log('[wcpWorkflows.createExecution] Creating execution record...');
      const result: any = await db.execute(
        sql`INSERT INTO wcp_executions (workflowId, workflowName, status, startedAt)
            VALUES (${input.workflowId}, ${input.workflowName}, ${input.status}, NOW())
            RETURNING id`
      );

      const executionId = result.rows?.[0]?.id ?? result[0]?.id;
      console.log('[wcpWorkflows.createExecution] Execution created with ID:', executionId);

      // Execute workflow asynchronously (don't wait for completion)
      executeWorkflow(input.workflowId, executionId, nodes, edges).catch((error) => {
        console.error('[wcpWorkflows.createExecution] Workflow execution error:', error);
      });

      return { id: executionId, message: "Execution started" };
    }),
});
