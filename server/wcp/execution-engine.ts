/**
 * Workflow Execution Engine
 * 
 * Executes workflow blocks in sequence based on the workflow graph.
 * Handles block execution, error handling, logging, and status updates.
 */

import { getDb } from "../db";
import { sql } from "drizzle-orm";

// Block execution result
export interface BlockExecutionResult {
  success: boolean;
  output?: any;
  error?: string;
  duration: number; // milliseconds
}

// Execution log entry
export interface ExecutionLog {
  timestamp: Date;
  blockId: string;
  blockType: string;
  blockLabel: string;
  status: "pending" | "running" | "completed" | "failed";
  message: string;
  output?: any;
  error?: string;
  duration?: number;
}

// Workflow execution context
export interface ExecutionContext {
  workflowId: number;
  executionId: number;
  variables: Record<string, any>; // Shared variables between blocks
  logs: ExecutionLog[];
}

/**
 * Execute a single workflow block
 */
async function executeBlock(
  blockType: string,
  blockData: any,
  context: ExecutionContext
): Promise<BlockExecutionResult> {
  const startTime = Date.now();

  try {
    let output: any;

    switch (blockType) {
      case "time_trigger":
        output = await executeTimeTrigger(blockData, context);
        break;

      case "webhook":
        output = await executeWebhook(blockData, context);
        break;

      case "invoke_agent":
        output = await executeInvokeAgent(blockData, context);
        break;

      case "database_query":
        output = await executeDatabaseQuery(blockData, context);
        break;

      case "send_email":
        output = await executeSendEmail(blockData, context);
        break;

      case "run_code":
        output = await executeRunCode(blockData, context);
        break;

      case "send_message":
        output = await executeSendMessage(blockData, context);
        break;

      default:
        throw new Error(`Unknown block type: ${blockType}`);
    }

    const duration = Date.now() - startTime;
    return { success: true, output, duration };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return { success: false, error: error.message, duration };
  }
}

/**
 * Time Trigger Block
 * Executes immediately (scheduling logic would be handled by a separate cron service)
 */
async function executeTimeTrigger(
  blockData: any,
  context: ExecutionContext
): Promise<any> {
  const config = blockData.config || {};
  const schedule = config.schedule || "immediate";

  // For now, just log that the trigger fired
  return {
    triggered: true,
    schedule,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Webhook Block
 * In a real implementation, this would register a webhook endpoint
 * For now, we'll simulate webhook data
 */
async function executeWebhook(
  blockData: any,
  context: ExecutionContext
): Promise<any> {
  const config = blockData.config || {};
  const webhookUrl = config.url || "/webhook/trigger";

  // Simulate webhook data
  return {
    received: true,
    url: webhookUrl,
    payload: { message: "Webhook triggered successfully" },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Invoke Agent Block
 * Calls an AI agent and returns the response
 */
async function executeInvokeAgent(
  blockData: any,
  context: ExecutionContext
): Promise<any> {
  const config = blockData.config || {};
  const agentId = config.agentId;
  const prompt = config.prompt || "Hello";

  if (!agentId) {
    throw new Error("Agent ID is required");
  }

  // In a real implementation, this would call the agent execution service
  // For now, simulate agent response
  return {
    agentId,
    prompt,
    response: `Agent ${agentId} processed: "${prompt}"`,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Database Query Block
 * Executes a SQL query against the database
 */
async function executeDatabaseQuery(
  blockData: any,
  context: ExecutionContext
): Promise<any> {
  const config = blockData.config || {};
  const query = config.query;

  if (!query) {
    throw new Error("SQL query is required");
  }

  // For safety, only allow SELECT queries in this demo
  if (!query.trim().toLowerCase().startsWith("select")) {
    throw new Error("Only SELECT queries are allowed for safety");
  }

  try {
    const db = getDb();
    // Execute the query (this is a simplified version)
    // In production, you'd want proper query validation and parameterization
    const result = await db.execute(query);
    
    return {
      query,
      rowCount: Array.isArray(result) ? result.length : 0,
      rows: Array.isArray(result) ? result.slice(0, 10) : [], // Limit to 10 rows for display
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    throw new Error(`Database query failed: ${error.message}`);
  }
}

/**
 * Send Email Block
 * Sends an email (simulated for now)
 */
async function executeSendEmail(
  blockData: any,
  context: ExecutionContext
): Promise<any> {
  const config = blockData.config || {};
  const to = config.to;
  const subject = config.subject || "Workflow Notification";
  const body = config.body || "This is an automated message from your workflow.";

  if (!to) {
    throw new Error("Email recipient (to) is required");
  }

  // In a real implementation, this would use an email service (SendGrid, AWS SES, etc.)
  // For now, simulate sending
  console.log(`[Email] Sending to ${to}: ${subject}`);

  return {
    sent: true,
    to,
    subject,
    body,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Run Code Block
 * Executes JavaScript code in a sandboxed environment
 */
async function executeRunCode(
  blockData: any,
  context: ExecutionContext
): Promise<any> {
  const config = blockData.config || {};
  const code = config.code;

  if (!code) {
    throw new Error("Code is required");
  }

  try {
    const forbidden = /process\.|require\(|import\s|global\.|child_process|fs\.|net\.|http\./;
    if (forbidden.test(code)) {
      throw new Error("Code contains disallowed references (process, require, fs, etc.)");
    }
    const sandboxedFunction = new Function("context", `
      "use strict";
      const { variables } = context;
      ${code}
    `);

    // Execute the code
    const result = sandboxedFunction(context);

    return {
      executed: true,
      code: code.substring(0, 100) + (code.length > 100 ? "..." : ""),
      result,
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    throw new Error(`Code execution failed: ${error.message}`);
  }
}

/**
 * Send Message Block
 * Sends a notification or message (simulated for now)
 */
async function executeSendMessage(
  blockData: any,
  context: ExecutionContext
): Promise<any> {
  const config = blockData.config || {};
  const message = config.message || "Workflow notification";
  const channel = config.channel || "notification";

  // In a real implementation, this would use a messaging service
  console.log(`[Message] Sending to ${channel}: ${message}`);

  return {
    sent: true,
    channel,
    message,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Execute a complete workflow
 */
export async function executeWorkflow(
  workflowId: number,
  executionId: number,
  nodes: any[],
  edges: any[]
): Promise<void> {
  const db = getDb();
  const context: ExecutionContext = {
    workflowId,
    executionId,
    variables: {},
    logs: [],
  };

  try {
    // Add initial log
    context.logs.push({
      timestamp: new Date(),
      blockId: "start",
      blockType: "system",
      blockLabel: "Workflow Start",
      status: "completed",
      message: "Workflow execution started",
    });

    // Build execution order (topological sort)
    const executionOrder = buildExecutionOrder(nodes, edges);

    // Execute blocks in order
    for (const nodeId of executionOrder) {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      const blockType = node.data.blockType;
      const blockLabel = node.data.label || blockType;

      // Add "running" log
      context.logs.push({
        timestamp: new Date(),
        blockId: nodeId,
        blockType,
        blockLabel,
        status: "running",
        message: `Executing ${blockLabel}...`,
      });

      // Execute the block
      const result = await executeBlock(blockType, node.data, context);

      // Add completion log
      if (result.success) {
        context.logs.push({
          timestamp: new Date(),
          blockId: nodeId,
          blockType,
          blockLabel,
          status: "completed",
          message: `${blockLabel} completed successfully`,
          output: result.output,
          duration: result.duration,
        });

        // Store output in context variables for next blocks
        context.variables[nodeId] = result.output;
      } else {
        context.logs.push({
          timestamp: new Date(),
          blockId: nodeId,
          blockType,
          blockLabel,
          status: "failed",
          message: `${blockLabel} failed`,
          error: result.error,
          duration: result.duration,
        });

        // Workflow failed, stop execution
        throw new Error(`Block ${blockLabel} failed: ${result.error}`);
      }
    }

    // Add completion log
    context.logs.push({
      timestamp: new Date(),
      blockId: "end",
      blockType: "system",
      blockLabel: "Workflow End",
      status: "completed",
      message: "Workflow execution completed successfully",
    });

    // Update execution status to completed
    await db.execute(
      sql`UPDATE wcp_executions 
          SET status = 'completed', 
              completedAt = NOW(), 
              executionLog = ${JSON.stringify(context.logs)}
          WHERE id = ${executionId}`
    );

    console.log(`[Execution] Workflow ${workflowId} execution ${executionId} completed`);
  } catch (error: any) {
    // Add error log
    context.logs.push({
      timestamp: new Date(),
      blockId: "error",
      blockType: "system",
      blockLabel: "Workflow Error",
      status: "failed",
      message: `Workflow execution failed: ${error.message}`,
      error: error.message,
    });

    // Update execution status to failed
    await db.execute(
      sql`UPDATE wcp_executions 
          SET status = 'failed', 
              completedAt = NOW(), 
              errorMessage = ${error.message},
              executionLog = ${JSON.stringify(context.logs)}
          WHERE id = ${executionId}`
    );

    console.error(`[Execution] Workflow ${workflowId} execution ${executionId} failed:`, error);
  }
}

/**
 * Build execution order using topological sort
 * Returns array of node IDs in execution order
 */
function buildExecutionOrder(nodes: any[], edges: any[]): string[] {
  // Build adjacency list
  const adjacency: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};

  // Initialize
  for (const node of nodes) {
    adjacency[node.id] = [];
    inDegree[node.id] = 0;
  }

  // Build graph
  for (const edge of edges) {
    adjacency[edge.source].push(edge.target);
    inDegree[edge.target] = (inDegree[edge.target] || 0) + 1;
  }

  // Find starting nodes (triggers with no incoming edges)
  const queue: string[] = [];
  for (const nodeId of Object.keys(inDegree)) {
    if (inDegree[nodeId] === 0) {
      queue.push(nodeId);
    }
  }

  // Topological sort
  const order: string[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    order.push(nodeId);

    for (const neighbor of adjacency[nodeId]) {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Check for cycles
  if (order.length !== nodes.length) {
    throw new Error("Workflow contains cycles");
  }

  return order;
}
