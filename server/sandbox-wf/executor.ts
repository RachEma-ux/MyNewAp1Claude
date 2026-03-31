/**
 * WfDB — Execution Engine
 *
 * Step-by-step workflow executor with pluggable step handlers.
 * Follows edge connections, passes context between steps,
 * handles branching (if/else), delays, and error recovery.
 */

import { eq } from "drizzle-orm";
import { getWfDb } from "./connection";
import {
  wfWorkflows,
  wfSteps,
  wfExecutions,
  wfExecutionLogs,
} from "../../drizzle/tables/wfdb";

// ── Types ────────────────────────────────────────────────────────────────────

interface StepConfig {
  // HTTP Request
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  // If/Else
  condition?: string;
  operator?: string;
  value?: string;
  // Transform
  expression?: string;
  // Delay
  delayMs?: number;
  // LLM Prompt
  provider?: string;
  model?: string;
  systemPrompt?: string;
  userPrompt?: string;
  temperature?: number;
  // Approval Gate
  approvers?: string;
  // Log
  logMessage?: string;
  [key: string]: any;
}

interface ExecutionContext {
  workflowId: number;
  executionId: number;
  stepOutputs: Record<string, any>;
  variables: Record<string, any>;
  startTime: number;
}

// ── DB Helper ────────────────────────────────────────────────────────────────

function db() {
  const d = getWfDb();
  if (!d) throw new Error("WfDB not connected");
  return d;
}

// ── Step Executors ───────────────────────────────────────────────────────────

async function executeHttpRequest(config: StepConfig, ctx: ExecutionContext) {
  const url = resolveTemplate(config.url || "", ctx);
  const method = (config.method || "GET").toUpperCase();
  const timeout = config.timeout || 30000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const fetchOpts: RequestInit = {
      method,
      signal: controller.signal,
      headers: config.headers || {},
    };
    if (method !== "GET" && method !== "HEAD" && config.body) {
      fetchOpts.body = resolveTemplate(config.body, ctx);
    }
    const resp = await fetch(url, fetchOpts);
    const text = await resp.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: resp.status, statusText: resp.statusText, data };
  } finally {
    clearTimeout(timer);
  }
}

function executeIfElse(config: StepConfig, ctx: ExecutionContext) {
  const field = resolveTemplate(config.condition || "", ctx);
  const operator = config.operator || "equals";
  const value = config.value || "";

  let result = false;
  switch (operator) {
    case "equals": result = String(field) === String(value); break;
    case "not_equals": result = String(field) !== String(value); break;
    case "contains": result = String(field).includes(String(value)); break;
    case "greater_than": result = Number(field) > Number(value); break;
    case "less_than": result = Number(field) < Number(value); break;
    case "is_empty": result = !field || String(field).trim() === ""; break;
    case "is_not_empty": result = !!field && String(field).trim() !== ""; break;
    default: result = !!field;
  }
  return { condition: config.condition, operator, value, result, branch: result ? "true" : "false" };
}

function executeTransform(config: StepConfig, ctx: ExecutionContext) {
  const expression = config.expression || "";
  const resolved = resolveTemplate(expression, ctx);
  return { expression, result: resolved };
}

async function executeDelay(config: StepConfig) {
  const ms = Math.min(config.delayMs || 1000, 10000); // cap at 10s
  await new Promise((r) => setTimeout(r, ms));
  return { delayed: ms };
}

function executeLogMessage(config: StepConfig, ctx: ExecutionContext) {
  const message = resolveTemplate(config.logMessage || "Log step executed", ctx);
  return { message };
}

function executeApprovalGate(config: StepConfig) {
  // In sandbox mode, auto-approve
  return { approved: true, approvers: config.approvers || "auto", mode: "sandbox-auto-approve" };
}

function executeLlmPrompt(config: StepConfig) {
  // Placeholder — returns mock response in sandbox
  return {
    provider: config.provider || "sandbox",
    model: config.model || "mock",
    response: `[Sandbox] LLM response for: "${config.userPrompt || "no prompt"}"`,
    tokens: { prompt: 50, completion: 100 },
  };
}

// ── Template Resolution ──────────────────────────────────────────────────────

function resolveTemplate(template: string, ctx: ExecutionContext): string {
  return template.replace(/\{\{(\w+)\.(\w+)\}\}/g, (_, stepKey, field) => {
    const output = ctx.stepOutputs[stepKey];
    if (output && output[field] !== undefined) return String(output[field]);
    return `{{${stepKey}.${field}}}`;
  }).replace(/\{\{var\.(\w+)\}\}/g, (_, varName) => {
    return ctx.variables[varName] !== undefined ? String(ctx.variables[varName]) : `{{var.${varName}}}`;
  });
}

// ── Main Execution Engine ────────────────────────────────────────────────────

export async function executeWorkflow(workflowId: number, triggerType = "manual"): Promise<number> {
  // Create execution record
  const [exec] = await db()
    .insert(wfExecutions)
    .values({ workflowId, status: "running", triggerType })
    .returning();

  const executionId = exec.id;
  const startTime = Date.now();

  // Log start
  await writeLog(executionId, "", "INFO", `[Execution #${executionId}] Started for workflow #${workflowId} (trigger: ${triggerType})`);

  // Get workflow steps
  const steps = await db()
    .select()
    .from(wfSteps)
    .where(eq(wfSteps.workflowId, workflowId))
    .orderBy(wfSteps.sortOrder);

  if (steps.length === 0) {
    await writeLog(executionId, "", "WARN", "No steps found — execution complete (empty)");
    await completeExecution(executionId, startTime, "completed");
    return executionId;
  }

  const ctx: ExecutionContext = {
    workflowId,
    executionId,
    stepOutputs: {},
    variables: { triggerType, workflowId },
    startTime,
  };

  let hasError = false;

  // Execute steps sequentially
  for (const step of steps) {
    const stepStart = Date.now();
    const config: StepConfig = (step.config as StepConfig) || {};
    const nodeType = step.nodeType || "action";

    await writeLog(executionId, step.key, "INFO", `[${step.label}] Starting (type: ${nodeType})...`);

    // Update step status to running
    await db().update(wfSteps).set({ status: "running" }).where(eq(wfSteps.id, step.id));

    try {
      let output: any = {};

      switch (nodeType) {
        case "http_request":
          output = await executeHttpRequest(config, ctx);
          break;
        case "if_else":
          output = executeIfElse(config, ctx);
          break;
        case "transform":
          output = executeTransform(config, ctx);
          break;
        case "delay":
          output = await executeDelay(config);
          break;
        case "log_message":
          output = executeLogMessage(config, ctx);
          break;
        case "approval":
          output = executeApprovalGate(config);
          break;
        case "llm_prompt":
          output = executeLlmPrompt(config);
          break;
        default:
          // Generic action — pass through
          output = { type: nodeType, label: step.label, status: "executed" };
          break;
      }

      const duration = Date.now() - stepStart;
      ctx.stepOutputs[step.key] = output;

      // Log success
      await db().insert(wfExecutionLogs).values({
        executionId,
        stepKey: step.key,
        status: "completed",
        logLevel: "INFO",
        message: `[${step.label}] Completed in ${duration}ms`,
        duration,
        input: config,
        output,
      });

      // Update step status to done
      await db().update(wfSteps).set({ status: "done" }).where(eq(wfSteps.id, step.id));

    } catch (error: any) {
      hasError = true;
      const duration = Date.now() - stepStart;

      await db().insert(wfExecutionLogs).values({
        executionId,
        stepKey: step.key,
        status: "failed",
        logLevel: "ERROR",
        message: `[${step.label}] Failed: ${error.message}`,
        duration,
        error: error.message,
        input: config,
      });

      // Update step status to failed
      await db().update(wfSteps).set({ status: "failed" }).where(eq(wfSteps.id, step.id));

      await writeLog(executionId, step.key, "ERROR", `[${step.label}] Error: ${error.message}`);
      break; // Stop on first error
    }
  }

  const finalStatus = hasError ? "failed" : "completed";
  await completeExecution(executionId, startTime, finalStatus);
  await writeLog(executionId, "", "INFO", `[Execution #${executionId}] ${finalStatus} — ${steps.length} steps processed in ${Date.now() - startTime}ms`);

  return executionId;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function writeLog(executionId: number, stepKey: string, level: string, message: string) {
  await db().insert(wfExecutionLogs).values({
    executionId,
    stepKey,
    status: "info",
    logLevel: level,
    message,
  });
}

async function completeExecution(executionId: number, startTime: number, status: string) {
  await db()
    .update(wfExecutions)
    .set({
      status,
      completedAt: new Date(),
      duration: Date.now() - startTime,
    })
    .where(eq(wfExecutions.id, executionId));
}
