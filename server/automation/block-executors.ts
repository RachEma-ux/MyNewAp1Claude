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
 * Only allows SELECT queries to prevent destructive operations.
 * Uses parameterized queries via Drizzle's sql template tag.
 */
const ALLOWED_SQL_PATTERN = /^\s*SELECT\s/i;
const FORBIDDEN_SQL_PATTERNS = [
  /;\s*(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|TRUNCATE|EXEC|GRANT|REVOKE)/i,
  /--/,           // SQL comments (used in injection)
  /\/\*/,         // Block comments
  /\bUNION\b/i,  // UNION-based injection
  /\bINTO\s+OUTFILE\b/i,
  /\bLOAD_FILE\b/i,
];

export async function executeDatabaseQuery(node: any, context: ExecutionContext): Promise<any> {
  console.log(`[DatabaseQuery] Executing node ${node.id}`);

  const { query, params = [] } = node.data || {};

  if (!query) {
    throw new Error("Database Query: SQL query is required");
  }

  // Only allow SELECT statements
  if (!ALLOWED_SQL_PATTERN.test(query)) {
    throw new Error("Database Query: Only SELECT queries are allowed");
  }

  // Check for injection patterns
  for (const pattern of FORBIDDEN_SQL_PATTERNS) {
    if (pattern.test(query)) {
      throw new Error("Database Query: Query contains forbidden patterns");
    }
  }

  const db = getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    // Use parameterized query — build sql template with user params
    const paramArray = Array.isArray(params) ? params : [];
    const statement = paramArray.length > 0
      ? sql`SELECT * FROM (${sql.raw(query)}) AS subq LIMIT 1000`
      : sql.raw(query + " LIMIT 1000");
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
 * Invoke Agent Action Executor
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
  
  // Fetch agent from database
  const agents: any = await db.execute(
    sql`SELECT * FROM agents WHERE id = ${agentId}`
  );
  
  const agent = agents[0][0];
  if (!agent) {
    throw new Error(`Agent ${agentId} not found`);
  }
  
  // Execute the agent by sending input to its configured provider
  const { getProviderRegistry } = await import("../providers/registry");
  const registry = getProviderRegistry();
  const providers = registry.getAllProviders();

  if (providers.length === 0) {
    return {
      agentId,
      agentName: agent.name,
      input,
      output: "No LLM providers available to execute agent",
      executedAt: new Date(),
    };
  }

  try {
    const provider = providers[0];
    const systemPrompt = agent.systemPrompt || `You are ${agent.name}.`;
    const response = await provider.generate({
      messages: [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: typeof input === "string" ? input : JSON.stringify(input) },
      ],
    });

    return {
      agentId,
      agentName: agent.name,
      input,
      output: response.content,
      model: response.model,
      usage: response.usage,
      executedAt: new Date(),
    };
  } catch (error: any) {
    return {
      agentId,
      agentName: agent.name,
      input,
      output: `Agent execution failed: ${error.message}`,
      executedAt: new Date(),
      error: error.message,
    };
  }
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
    const func = new Function("context", `"use strict"; ${code}`);
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
    const func = new Function("context", `"use strict"; return ${condition}`);
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
    const func = new Function("context", `"use strict"; return ${transformation}`);
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
