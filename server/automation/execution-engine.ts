/**
 * Workflow Execution Engine
 * Executes automation workflows with job queue, retry logic, and logging
 */

import type { Node, Edge } from "reactflow";

export interface WorkflowDefinition {
  id: string;
  name: string;
  nodes: Node[];
  edges: Edge[];
  createdBy: string;
  createdAt: Date;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  workflowName: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  logs: ExecutionLog[];
  retryCount: number;
  maxRetries: number;
}

export interface ExecutionLog {
  timestamp: Date;
  level: "info" | "warn" | "error";
  message: string;
  nodeId?: string;
  data?: any;
}

export interface JobQueueItem {
  executionId: string;
  workflowId: string;
  priority: number;
  scheduledFor?: Date;
  addedAt: Date;
}

/**
 * Workflow Execution Engine
 */
export class WorkflowExecutionEngine {
  private executions: Map<string, WorkflowExecution> = new Map();
  private queue: JobQueueItem[] = [];
  private running: Set<string> = new Set();
  private maxConcurrent = 5;

  /**
   * Submit a workflow for execution
   */
  async submitWorkflow(
    workflow: WorkflowDefinition,
    priority = 5,
    scheduledFor?: Date
  ): Promise<string> {
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create execution record
    const execution: WorkflowExecution = {
      id: executionId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      status: "queued",
      logs: [],
      retryCount: 0,
      maxRetries: 3,
    };

    this.executions.set(executionId, execution);

    // Add to queue
    const queueItem: JobQueueItem = {
      executionId,
      workflowId: workflow.id,
      priority,
      scheduledFor,
      addedAt: new Date(),
    };

    this.queue.push(queueItem);
    this.queue.sort((a, b) => b.priority - a.priority);

    this.log(executionId, "info", `Workflow "${workflow.name}" queued for execution`);

    // Process queue
    this.processQueue();

    return executionId;
  }

  /**
   * Process the job queue
   */
  private async processQueue(): Promise<void> {
    // Check if we can run more jobs
    if (this.running.size >= this.maxConcurrent) {
      return;
    }

    // Find next job to run
    const now = new Date();
    const nextJob = this.queue.find(
      (job) =>
        !this.running.has(job.executionId) &&
        (!job.scheduledFor || job.scheduledFor <= now)
    );

    if (!nextJob) {
      return;
    }

    // Remove from queue and mark as running
    this.queue = this.queue.filter((j) => j.executionId !== nextJob.executionId);
    this.running.add(nextJob.executionId);

    // Execute workflow
    this.executeWorkflow(nextJob.executionId).finally(() => {
      this.running.delete(nextJob.executionId);
      // Process next job
      setTimeout(() => this.processQueue(), 100);
    });
  }

  /**
   * Execute a workflow
   */
  private async executeWorkflow(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    try {
      // Update status
      execution.status = "running";
      execution.startedAt = new Date();
      this.log(executionId, "info", "Starting workflow execution");

      // Simulate workflow execution (in production, this would execute actual nodes)
      await this.simulateWorkflowExecution(executionId);

      // Mark as completed
      execution.status = "completed";
      execution.completedAt = new Date();
      this.log(executionId, "info", "Workflow completed successfully");
    } catch (error: any) {
      this.log(executionId, "error", `Workflow failed: ${error.message}`);

      // Retry logic
      if (execution.retryCount < execution.maxRetries) {
        execution.retryCount++;
        execution.status = "queued";
        this.log(
          executionId,
          "warn",
          `Retrying workflow (attempt ${execution.retryCount}/${execution.maxRetries})`
        );

        // Re-queue with higher priority
        this.queue.push({
          executionId,
          workflowId: execution.workflowId,
          priority: 10,
          addedAt: new Date(),
        });
        this.queue.sort((a, b) => b.priority - a.priority);
      } else {
        execution.status = "failed";
        execution.completedAt = new Date();
        execution.error = error.message;
        this.log(executionId, "error", "Workflow failed after max retries");
      }
    }
  }

  /**
   * Simulate workflow execution (placeholder for actual execution logic)
   */
  private async simulateWorkflowExecution(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) return;

    // Simulate processing steps
    const steps = ["Initialize", "Process Data", "Execute Actions", "Finalize"];

    for (const step of steps) {
      this.log(executionId, "info", `Executing step: ${step}`);
      await this.sleep(500); // Simulate work
    }
  }

  /**
   * Cancel a workflow execution
   */
  async cancelExecution(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    if (execution.status === "running" || execution.status === "queued") {
      execution.status = "cancelled";
      execution.completedAt = new Date();
      this.log(executionId, "warn", "Workflow execution cancelled");

      // Remove from queue if queued
      this.queue = this.queue.filter((j) => j.executionId !== executionId);
    }
  }

  /**
   * Get execution status
   */
  getExecution(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * Get all executions
   */
  getAllExecutions(): WorkflowExecution[] {
    return Array.from(this.executions.values()).sort(
      (a, b) => (b.startedAt?.getTime() || 0) - (a.startedAt?.getTime() || 0)
    );
  }

  /**
   * Get executions by workflow ID
   */
  getExecutionsByWorkflow(workflowId: string): WorkflowExecution[] {
    return Array.from(this.executions.values())
      .filter((e) => e.workflowId === workflowId)
      .sort((a, b) => (b.startedAt?.getTime() || 0) - (a.startedAt?.getTime() || 0));
  }

  /**
   * Get execution logs
   */
  getLogs(executionId: string): ExecutionLog[] {
    const execution = this.executions.get(executionId);
    return execution?.logs || [];
  }

  /**
   * Add log entry
   */
  private log(
    executionId: string,
    level: "info" | "warn" | "error",
    message: string,
    nodeId?: string,
    data?: any
  ): void {
    const execution = this.executions.get(executionId);
    if (!execution) return;

    const logEntry: ExecutionLog = {
      timestamp: new Date(),
      level,
      message,
      nodeId,
      data,
    };

    execution.logs.push(logEntry);
    console.log(`[WorkflowEngine][${level.toUpperCase()}] ${message}`);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get queue status
   */
  getQueueStatus(): {
    queueLength: number;
    runningCount: number;
    maxConcurrent: number;
  } {
    return {
      queueLength: this.queue.length,
      runningCount: this.running.size,
      maxConcurrent: this.maxConcurrent,
    };
  }
}

// Global execution engine instance
export const executionEngine = new WorkflowExecutionEngine();
