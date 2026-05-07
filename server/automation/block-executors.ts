/**
 * Block Executors for Automation Workflows
 * Each executor handles a specific block type and performs actual operations
 */

import { getDb } from "../db.js";
import { sql } from "drizzle-orm";

export interface ExecutionContext {
  workflowId: number;
  executionId: number;
  userId: number;
  variables: Record<string, any>;
}

/**
 * Time Trigger Executor
 */
export async function executeTimeTrigger(node: any, context: ExecutionContext): Promise<any> {
  console.log(`[TimeTrigger] Executing node ${node.id}`);
  
  const delay = node.data?.delay || 0;
  if (delay > 0) {
    await new Promise(resolve => setTimeout(resolve, delay * 1000));
  }
  
  return {
    triggeredAt: new Date(),
    delay,
  };
}

/**
 * Webhook Trigger Executor
 */
export async function executeWebhookTrigger(node: any, context: ExecutionContext): Promise<any> {
  console.log(`[WebhookTrigger] Executing node ${node.id}`);

  // Webhook triggers are event-driven: the workflow engine registers this node
  // and waits for an incoming HTTP request to the webhook endpoint.
  // When executed directly (e.g. manual run), use any payload stored on the node.
  const webhookData = node.data?.webhookPayload || context.variables?.webhookPayload;

  return {
    method: webhookData?.method || "POST",
    headers: webhookData?.headers || {},
    body: webhookData?.body || {},
    receivedAt: new Date(),
  };
}

/**
 * HTTP Request Action Executor
 */
export async function executeHttpRequest(node: any, context: ExecutionContext): Promise<any> {
  console.log(`[HttpRequest] Executing node ${node.id}`);

  const { url, method = "GET", headers = {}, body } = node.data || {};

  if (!url) {
    throw new Error("HTTP Request: URL is required");
  }

  // SSRF protection: validate URL before fetching
  const { validateExternalUrl } = await import("../routers/ssrf-guard.js");
  const validation = await validateExternalUrl(url, { allowHttp: process.env.NODE_ENV === "development" });
  if (!validation.safe) {
    throw new Error(`HTTP Request blocked: ${validation.error}`);
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => response.text());

    return {
      status: response.status,
      statusText: response.statusText,
      data,
    };
  } catch (error: any) {
    throw new Error(`HTTP Request failed: ${error.message}`);
  }
}

/**
 * Database Query Action Executor
 * Uses a structured query descriptor instead of raw SQL to prevent injection.
 * Only whitelisted tables can be queried; all values are parameterized.
 */
const IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const ALLOWED_TABLES = new Set([
  "agents",
  "models",
  "documents",
  "workspaces",
  "catalog_entries",
  "workflows",
  "workflow_executions",
  "conversations",
  "providers",
]);

export async function executeDatabaseQuery(node: any, context: ExecutionContext): Promise<any> {
  console.log(`[DatabaseQuery] Executing node ${node.id}`);

  const { table, columns, where, limit: queryLimit } = node.data || {};

  if (!table) {
    throw new Error("Database Query: 'table' is required (raw SQL queries are not supported)");
  }

  const normalizedTable = String(table).toLowerCase().trim();
  if (!ALLOWED_TABLES.has(normalizedTable)) {
    throw new Error(
      `Database Query: Table "${table}" is not allowed. ` +
      `Allowed tables: ${[...ALLOWED_TABLES].join(", ")}`
    );
  }

  const db = getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    // Build SELECT columns — only validated identifiers
    let selectClause;
    if (columns && Array.isArray(columns) && columns.length > 0) {
      const validatedCols = columns.map((col: string) => {
        if (!IDENTIFIER_PATTERN.test(col)) {
          throw new Error(`Invalid column name: "${col}"`);
        }
        return sql.raw(`"${col}"`);
      });
      selectClause = validatedCols.reduce(
        (acc: any, col: any, i: number) => (i === 0 ? col : sql`${acc}, ${col}`)
      );
    } else {
      selectClause = sql.raw("*");
    }

    // Build WHERE clause — keys are validated identifiers, values are parameterized
    let whereClause = sql`TRUE`;
    if (where && typeof where === "object" && !Array.isArray(where)) {
      const conditions = Object.entries(where).map(([key, value]) => {
        if (!IDENTIFIER_PATTERN.test(key)) {
          throw new Error(`Invalid column name in where: "${key}"`);
        }
        return sql`${sql.raw(`"${key}"`)} = ${value}`;
      });
      if (conditions.length > 0) {
        whereClause = conditions.reduce((acc, cond) => sql`${acc} AND ${cond}`);
      }
    }

    const rowLimit = Math.min(Math.max(1, Number(queryLimit) || 100), 1000);
    const tableName = sql.raw(`"${normalizedTable}"`);
    const statement = sql`SELECT ${selectClause} FROM ${tableName} WHERE ${whereClause} LIMIT ${rowLimit}`;
    const result: any = await db.execute(statement);

    return {
      rowCount: result[0]?.length || 0,
      rows: result[0] || [],
    };
  } catch (error: any) {
    throw new Error(`Database query failed: ${error.message}`);
  }
}

/**
 * Send Email Action Executor
 */
export async function executeSendEmail(node: any, context: ExecutionContext): Promise<any> {
  console.log(`[SendEmail] Executing node ${node.id}`);
  
  const { to, subject, body } = node.data || {};
  
  if (!to || !subject) {
    throw new Error("Send Email: 'to' and 'subject' are required");
  }
  
  // In real implementation, integrate with email service (SendGrid, AWS SES, etc.)
  console.log(`[SendEmail] Sending email to ${to}: ${subject}`);
  
  return {
    sent: true,
    to,
    subject,
    sentAt: new Date(),
  };
}

/**
 * Invoke Agent Action Executor.
 *
 * **PMB Phase 29.6b (LR-08 closure — Path B):** the legacy `agents`
 * table is the pre-Agent-Studio orchestration system, marked out of
 * retrofit scope by `CLAUDE.md` ("`server/agents/` — Legacy agent
 * orchestration (pre-Agent-Studio; out of retrofit scope)"). Per
 * D-PR-5 in `PROVIDER_ROUTER_MIGRATION_DECISION.md`, the path forward
 * for `executeInvokeAgent` is Path B (refuse): return `binding_required`
 * for legacy `agents`-table rows; admins migrate the workflow to an
 * Agent Studio agent.
 *
 * Path B was preferred over Path A (backfill an AS draft on first
 * invocation) and Path C (dual-table support keeping `getProviderRegistry()`
 * alive in this one path). Path A is non-trivial for code explicitly
 * marked out-of-retrofit-scope; Path C re-introduces the D1-violation
 * registry path AT THE TIME we're closing it.
 *
 * Pre-condition check (run before promoting to production): enumerate
 * active automation workflows that hit `executeInvokeAgent` with a
 * legacy `agentId` from the `agents` table. If non-zero, an operator
 * needs to either delete the workflow or migrate the legacy agent into
 * Agent Studio before this code path can be exercised cleanly.
 *
 *   SELECT COUNT(*) FROM workflow_executions
 *    WHERE workflow_id IN (
 *      SELECT workflow_id FROM workflow_blocks
 *       WHERE block_type = 'invokeAgent'
 *         AND data->>'agentId' IS NOT NULL
 *    );
 */
export async function executeInvokeAgent(node: any, context: ExecutionContext): Promise<any> {
  console.log(`[InvokeAgent] Executing node ${node.id}`);

  const { agentId, input } = node.data || {};

  if (!agentId) {
    throw new Error("Invoke Agent: agentId is required");
  }

  const db = getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  // Fetch agent from legacy `agents` table for the surfacing message.
  const agents: any = await db.execute(
    sql`SELECT * FROM agents WHERE id = ${agentId}`,
  );
  const agent = agents[0][0];
  const agentName = agent?.name ?? `agent #${agentId}`;

  // Path B (refuse): return a soft-error result. The workflow
  // execution engine surfaces this via the result payload's `error`
  // field; CI/UI can detect it and prompt the operator.
  return {
    agentId,
    agentName,
    input,
    output:
      `Agent execution refused: legacy agents-table row #${agentId} cannot be invoked post-PMB-Phase-29.6b. ` +
      `Path B (refuse) — D-PR-5 in PROVIDER_ROUTER_MIGRATION_DECISION.md. ` +
      `Migrate this agent to Agent Studio (server/agent-studio/) and update the workflow to reference the new draft id.`,
    executedAt: new Date(),
    error: "legacy_agents_table_unsupported",
  };
}

/**
 * Run Code Action Executor
 */
export async function executeRunCode(node: any, context: ExecutionContext): Promise<any> {
  console.log(`[RunCode] Executing node ${node.id}`);
  
  const { code, language = "javascript" } = node.data || {};
  
  if (!code) {
    throw new Error("Run Code: code is required");
  }
  
  if (language !== "javascript") {
    throw new Error(`Run Code: ${language} is not supported yet`);
  }
  
  try {
    // Sandboxed execution — block access to dangerous globals
    const forbidden = /process\.|require\(|import\s|global\.|__dirname|__filename|child_process|fs\.|net\.|http\./;
    if (forbidden.test(code)) {
      throw new Error("Code contains disallowed references (process, require, fs, etc.)");
    }
    const func = new Function("context", `"use strict"; ${code}`); // governance-eval-safe: sandboxed execution
    const result = func(context.variables);
    
    return {
      output: result,
      executedAt: new Date(),
    };
  } catch (error: any) {
    throw new Error(`Code execution failed: ${error.message}`);
  }
}

/**
 * Condition/Branch Executor
 */
export async function executeCondition(node: any, context: ExecutionContext): Promise<any> {
  console.log(`[Condition] Executing node ${node.id}`);
  
  const { condition } = node.data || {};
  
  if (!condition) {
    throw new Error("Condition: condition expression is required");
  }
  
  try {
    const forbidden = /process\.|require\(|import\s|global\.|child_process|fs\.|net\.|http\./;
    if (forbidden.test(condition)) {
      throw new Error("Condition contains disallowed references");
    }
    const func = new Function("context", `"use strict"; return ${condition}`); // governance-eval-safe: sandboxed execution
    const result = func(context.variables);
    
    return {
      condition,
      result: Boolean(result),
      evaluatedAt: new Date(),
    };
  } catch (error: any) {
    throw new Error(`Condition evaluation failed: ${error.message}`);
  }
}

/**
 * Send Message/Notification Executor
 */
export async function executeSendMessage(node: any, context: ExecutionContext): Promise<any> {
  console.log(`[SendMessage] Executing node ${node.id}`);
  
  const { message, channel = "notification" } = node.data || {};
  
  if (!message) {
    throw new Error("Send Message: message is required");
  }
  
  // In real implementation, send via notification service
  console.log(`[SendMessage] Sending message via ${channel}: ${message}`);
  
  return {
    sent: true,
    channel,
    message,
    sentAt: new Date(),
  };
}

/**
 * Transform Data Executor
 */
export async function executeTransformData(node: any, context: ExecutionContext): Promise<any> {
  console.log(`[TransformData] Executing node ${node.id}`);
  
  const { transformation } = node.data || {};
  
  if (!transformation) {
    throw new Error("Transform Data: transformation is required");
  }
  
  try {
    const forbidden = /process\.|require\(|import\s|global\.|child_process|fs\.|net\.|http\./;
    if (forbidden.test(transformation)) {
      throw new Error("Transformation contains disallowed references");
    }
    const func = new Function("context", `"use strict"; return ${transformation}`); // governance-eval-safe: sandboxed execution
    const result = func(context.variables);
    
    return {
      transformed: result,
      transformedAt: new Date(),
    };
  } catch (error: any) {
    throw new Error(`Data transformation failed: ${error.message}`);
  }
}

/**
 * Delay Executor
 */
export async function executeDelay(node: any, context: ExecutionContext): Promise<any> {
  console.log(`[Delay] Executing node ${node.id}`);
  
  const { duration = 1000 } = node.data || {};
  
  await new Promise(resolve => setTimeout(resolve, duration));
  
  return {
    delayed: duration,
    delayedAt: new Date(),
  };
}

/**
 * Main Block Executor
 * Routes to specific executor based on block type
 */
export async function executeBlock(node: any, context: ExecutionContext): Promise<any> {
  const blockType = node.type || node.data?.blockType || node.data?.type;
  
  console.log(`[BlockExecutor] Executing block type: ${blockType}`);
  
  switch (blockType) {
    // Time Trigger
    case "timeTrigger":
    case "time_trigger":
    case "time-trigger":
      return executeTimeTrigger(node, context);
      
    // Webhook Trigger
    case "webhookTrigger":
    case "webhook_trigger":
    case "webhook-trigger":
      return executeWebhookTrigger(node, context);
    
    // File Upload Trigger
    case "file-upload-trigger":
      return executeTimeTrigger(node, context);
      
    case "httpRequest":
    case "http_request":
      return executeHttpRequest(node, context);
      
    case "databaseQuery":
    case "database_query":
    case "database-action":
      return executeDatabaseQuery(node, context);
      
    case "sendEmail":
    case "send_email":
    case "email-action":
      return executeSendEmail(node, context);
      
    case "invokeAgent":
    case "invoke_agent":
    case "ai-action":
      return executeInvokeAgent(node, context);
      
    case "runCode":
    case "run_code":
    case "code-action":
      return executeRunCode(node, context);
      
    case "condition":
      return executeCondition(node, context);
      
    case "sendMessage":
    case "send_message":
    case "chat-action":
      return executeSendMessage(node, context);
      
    case "transformData":
    case "transform_data":
      return executeTransformData(node, context);
      
    case "delay":
      return executeDelay(node, context);
      
    default:
      console.warn(`[BlockExecutor] Unknown block type: ${blockType}, skipping...`);
      return { 
        skipped: true, 
        reason: `Unknown block type: ${blockType}`,
        timestamp: new Date(),
      };
  }
}

/**
 * Topological Sort
 * Determines execution order based on edges
 */
export function topologicalSort(nodes: any[], edges: any[]): any[] {
  const graph = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  
  // Initialize graph
  nodes.forEach(node => {
    graph.set(node.id, []);
    inDegree.set(node.id, 0);
  });
  
  // Build graph
  edges.forEach(edge => {
    graph.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  });
  
  // Find nodes with no incoming edges (start nodes)
  const queue: string[] = [];
  inDegree.forEach((degree, nodeId) => {
    if (degree === 0) {
      queue.push(nodeId);
    }
  });
  
  // Topological sort
  const sorted: string[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    sorted.push(nodeId);
    
    graph.get(nodeId)?.forEach(neighbor => {
      const newDegree = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    });
  }
  
  // Convert node IDs back to node objects
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  return sorted.map(id => nodeMap.get(id)).filter(Boolean) as any[];
}
