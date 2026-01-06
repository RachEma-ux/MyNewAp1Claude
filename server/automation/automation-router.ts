import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { WorkflowExecutionEngine } from "./execution-engine";
import { validateWorkflow, formatValidationResult } from "./validation";
import {
  canEditWorkflow,
  canPublishWorkflow,
  canExecuteWorkflow,
  getDefaultPermissions,
  addPermission,
  removePermission,
  setWorkflowPublic,
  getWorkflowPermissions,
  type WorkflowPermissions,
} from "./permissions";
import type { Node, Edge } from "reactflow";
import * as db from "../db";
import { TRPCError } from "@trpc/server";

// Create singleton execution engine instance
const executionEngine = new WorkflowExecutionEngine();

/**
 * Automation Router
 * Handles workflow execution and monitoring
 */
export const automationRouter = router({
  /**
   * Create a new workflow
   */
  createWorkflow: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        nodes: z.string(), // JSON string of ReactFlow nodes
        edges: z.string(), // JSON string of ReactFlow edges
      })
    )
    .mutation(async ({ input, ctx }) => {
      console.log('[createWorkflow] START - userId:', ctx.user?.id, 'name:', input.name);
      if (!ctx.user) {
        console.error('[createWorkflow] ERROR: No user in context!');
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
      }
      
      // Validate workflow before saving
      const nodes: Node[] = JSON.parse(input.nodes);
      const edges: Edge[] = JSON.parse(input.edges);
      const validation = validateWorkflow(nodes, edges);
      
      if (!validation.valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Workflow validation failed:\n${formatValidationResult(validation)}`,
        });
      }
      
      console.log('[createWorkflow] Validation passed, creating workflow...');
      const workflow = await db.createWorkflow({
        ...input,
        userId: ctx.user.id,
      });
      console.log('[createWorkflow] Workflow created:', workflow.id, workflow.name);
      
      // Set default permissions for new workflow
      const defaultPerms = getDefaultPermissions(ctx.user.id);
      await db.updateWorkflow(workflow.id, {
        permissions: defaultPerms as any,
      }, ctx.user.id);
      
      console.log('[createWorkflow] SUCCESS - workflow saved with id:', workflow.id);
      return workflow;
    }),

  /**
   * List all workflows for current user
   */
  listWorkflows: protectedProcedure.query(async ({ ctx }) => {
    console.log('[listWorkflows] START - userId:', ctx.user?.id, 'user:', ctx.user);
    if (!ctx.user) {
      console.error('[listWorkflows] ERROR: No user in context!');
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
    }
    const workflows = await db.getUserWorkflows(ctx.user.id);
    console.log('[listWorkflows] SUCCESS - found', workflows.length, 'workflows for userId', ctx.user.id);
    workflows.forEach((w: any) => console.log('  - Workflow:', w.id, w.name, 'status:', w.status));
    return workflows;
  }),

  /**
   * Get a specific workflow
   */
  getWorkflow: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      return await db.getWorkflowById(input.id, ctx.user.id);
    }),

  /**
   * Update an existing workflow
   */
  updateWorkflow: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        nodes: z.string(), // JSON string of ReactFlow nodes
        edges: z.string(), // JSON string of ReactFlow edges
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Validate workflow before updating
      const nodes: Node[] = JSON.parse(input.nodes);
      const edges: Edge[] = JSON.parse(input.edges);
      const validation = validateWorkflow(nodes, edges);
      
      if (!validation.valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Workflow validation failed:\n${formatValidationResult(validation)}`,
        });
      }
      
      return await db.updateWorkflow(input.id, {
        name: input.name,
        description: input.description,
        nodes: input.nodes,
        edges: input.edges,
      }, ctx.user.id);
    }),

  /**
   * Delete a workflow
   */
  deleteWorkflow: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      return await db.deleteWorkflow(input.id, ctx.user.id);
    }),

  /**
   * Publish a workflow (creates immutable version snapshot)
   */
  publishWorkflow: protectedProcedure
    .input(
      z.object({
        workflowId: z.number(),
        changeNotes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await db.publishWorkflow(
        input.workflowId,
        ctx.user.id,
        input.changeNotes
      );
    }),

  /**
   * Get all versions of a workflow
   */
  getWorkflowVersions: protectedProcedure
    .input(z.object({ workflowId: z.number() }))
    .query(async ({ input, ctx }) => {
      return await db.getWorkflowVersions(input.workflowId, ctx.user.id);
    }),

  /**
   * Rollback workflow to a specific version
   */
  rollbackToVersion: protectedProcedure
    .input(
      z.object({
        workflowId: z.number(),
        versionId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await db.rollbackToVersion(
        input.workflowId,
        input.versionId,
        ctx.user.id
      );
    }),

  /**
   * Execute a workflow (with database persistence)
   */
  executeWorkflow: protectedProcedure
    .input(
      z.object({
        workflowId: z.number(),
        versionId: z.number().optional(),
        triggerData: z.any().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Create execution record
      const executionId = await db.createWorkflowExecution(
        input.workflowId,
        ctx.user.id,
        {
          versionId: input.versionId,
          triggerType: "manual",
          triggerData: input.triggerData,
        }
      );

      // Update status to running
      await db.updateWorkflowExecution(executionId, {
        status: "running",
      });

      // Get workflow data
      const workflow = await db.getWorkflowById(input.workflowId, ctx.user.id);
      if (!workflow) {
        await db.updateWorkflowExecution(executionId, {
          status: "failed",
          error: "Workflow not found",
          completedAt: new Date(),
        });
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow not found",
        });
      }

      try {
        const nodes: Node[] = JSON.parse(workflow.nodes);
        const edges: Edge[] = JSON.parse(workflow.edges);

        // Import block executors
        const { executeBlock, topologicalSort } = await import("./block-executors.js");

        // Sort nodes in execution order
        const sortedNodes = topologicalSort(nodes, edges);

        // Initialize execution context
        const context = {
          workflowId: input.workflowId,
          executionId,
          userId: ctx.user.id,
          variables: {},
        };

        const startTime = Date.now();

        // Execute each node in order
        for (const node of sortedNodes) {
          const nodeStartTime = Date.now();

          // Create log entry with running status
          await db.createExecutionLog(executionId, {
            nodeId: node.id,
            nodeType: node.data?.blockType || node.type || "unknown",
            nodeLabel: node.data?.label || node.id,
            status: "running",
            startedAt: new Date(nodeStartTime),
            completedAt: new Date(),
            duration: 0,
            output: null,
          });

          try {
            // Execute the block
            const output = await executeBlock(node, context);

            // Store output in context variables
            context.variables[node.id] = output;

            const nodeEndTime = Date.now();

            // Update log entry with completed status
            await db.updateExecutionLog(executionId, node.id, {
              status: "completed",
              completedAt: new Date(),
              duration: nodeEndTime - nodeStartTime,
              output,
            });
          } catch (error: any) {
            const nodeEndTime = Date.now();

            // Update log entry with failed status
            await db.updateExecutionLog(executionId, node.id, {
              status: "failed",
              completedAt: new Date(),
              duration: nodeEndTime - nodeStartTime,
              error: error.message,
            });

            // Stop execution on error
            throw error;
          }
        }

        const endTime = Date.now();

        // Update execution as completed
        await db.updateWorkflowExecution(executionId, {
          status: "completed",
          completedAt: new Date(),
          duration: endTime - startTime,
        });

        return { executionId, status: "completed" };
      } catch (error: any) {
        // Update execution as failed
        await db.updateWorkflowExecution(executionId, {
          status: "failed",
          error: error.message,
          completedAt: new Date(),
        });

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Workflow execution failed: ${error.message}`,
        });
      }
    }),

  /**
   * Get execution status
   */
  getExecution: protectedProcedure
    .input(z.object({ executionId: z.string() }))
    .query(({ input }) => {
      const execution = executionEngine.getExecution(input.executionId);
      if (!execution) {
        throw new Error("Execution not found");
      }
      return execution;
    }),

  /**
   * Get all executions
   */
  getAllExecutions: protectedProcedure.query(() => {
    return executionEngine.getAllExecutions();
  }),

  /**
   * Get executions by workflow ID
   */
  getExecutionsByWorkflow: protectedProcedure
    .input(z.object({ workflowId: z.string() }))
    .query(({ input }) => {
      return executionEngine.getExecutionsByWorkflow(input.workflowId);
    }),

  /**
   * Get execution logs from database
   */
  getExecutionLogs: protectedProcedure
    .input(z.object({ executionId: z.number() }))
    .query(async ({ input, ctx }) => {
      return await db.getExecutionLogs(input.executionId, ctx.user.id);
    }),

  /**
   * Cancel execution
   */
  cancelExecution: protectedProcedure
    .input(z.object({ executionId: z.string() }))
    .mutation(async ({ input }) => {
      await executionEngine.cancelExecution(input.executionId);
      return { success: true };
    }),

  /**
   * Get all workflow executions for the current user
   */
  getExecutions: protectedProcedure
    .input(
      z.object({
        limit: z.number().optional().default(50),
      })
    )
    .query(async ({ input, ctx }) => {
      return await db.getAllWorkflowExecutions(ctx.user.id, input.limit);
    }),

  /**
   * Get executions for a specific workflow
   */
  getWorkflowExecutions: protectedProcedure
    .input(
      z.object({
        workflowId: z.number(),
        limit: z.number().optional().default(50),
      })
    )
    .query(async ({ input, ctx }) => {
      return await db.getWorkflowExecutions(
        input.workflowId,
        ctx.user.id,
        input.limit
      );
    }),

  /**
   * Get a single execution by ID with logs
   */
  getExecutionById: protectedProcedure
    .input(
      z.object({
        executionId: z.number(),
      })
    )
    .query(async ({ input, ctx }) => {
      const execution = await db.getWorkflowExecutionById(
        input.executionId,
        ctx.user.id
      );

      if (!execution) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Execution not found",
        });
      }

      const logs = await db.getExecutionLogs(input.executionId, ctx.user.id);

      return {
        ...execution,
        logs,
      };
    }),
});
