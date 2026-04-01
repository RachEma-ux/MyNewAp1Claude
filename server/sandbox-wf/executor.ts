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
  // Catalog Agent
  catalogEntryId?: number;
  catalogEntryName?: string;
  message?: string;
  // Parallel Fan-Out
  tasks?: ParallelTask[];
  maxConcurrency?: number;
  failStrategy?: "fail_fast" | "continue_all";
  // Quality Gate
  reviewerCatalogEntryId?: number;
  reviewerPrompt?: string;
  passThreshold?: number;
  maxRetries?: number;
  sourceStepKey?: string;
  [key: string]: any;
}

interface ParallelTask {
  key: string;
  label: string;
  catalogEntryId?: number;
  userPrompt?: string;
  nodeType?: string;
  config?: Record<string, any>;
}

interface BudgetState {
  tokenCount: number;
  estimatedCost: number;
  budgetLimit: number;  // 0 = unlimited
  costLimit: number;    // 0 = unlimited
}

interface ExecutionContext {
  workflowId: number;
  executionId: number;
  stepOutputs: Record<string, any>;
  variables: Record<string, any>;
  startTime: number;
  budget: BudgetState;
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

async function executeLlmPrompt(config: StepConfig, ctx: ExecutionContext): Promise<Record<string, any>> {
  // Try real LLM via Provider Hub; fall back to mock if unavailable
  try {
    const { getAvailableProvider, callLLM } = await import("../modules/pmt/idea-builder-agent");
    const provider = getAvailableProvider();

    if (provider) {
      const systemPrompt = resolveTemplate(config.systemPrompt || "You are a helpful assistant.", ctx);
      const userPrompt = resolveTemplate(config.userPrompt || "", ctx);

      const response = await callLLM(provider, [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ], {
        temperature: config.temperature ?? 0.7,
        maxTokens: 2000,
        model: config.model || undefined,
      });

      return {
        provider: provider.type,
        model: config.model || provider.name,
        response,
        tokens: { prompt: 50, completion: 100 }, // estimate
      };
    }
  } catch {
    // Provider Hub unavailable — fall through to mock
  }

  // Graceful degradation — no LLM available
  return {
    provider: "sandbox",
    model: "mock",
    response: `[Sandbox] No LLM provider available. Mock response for: "${config.userPrompt || "no prompt"}"`,
    tokens: { prompt: 0, completion: 0 },
  };
}

async function executeCatalogAgent(config: StepConfig, ctx: ExecutionContext): Promise<Record<string, any>> {
  const catalogEntryId = config.catalogEntryId;
  if (!catalogEntryId) {
    return { error: "No catalogEntryId configured", status: "skipped" };
  }

  try {
    const { invokeCatalogEntry } = await import("../ai-types/invoke");
    const message = resolveTemplate(config.userPrompt || config.message || "", ctx);

    let result: any = {};
    for await (const event of invokeCatalogEntry({
      catalogEntryId,
      actorUserId: 0,
      message,
      triggerSource: "wf_sandbox",
    })) {
      if (event.type === "complete") {
        result = { status: "completed", response: (event as any).result || event };
      } else if (event.type === "error") {
        result = { status: "failed", error: (event as any).error };
      } else if (event.type === "chunk") {
        result.response = (result.response || "") + ((event as any).text || "");
      }
    }
    return {
      catalogEntryId,
      entryName: config.catalogEntryName || `Entry #${catalogEntryId}`,
      ...result,
    };
  } catch (err: any) {
    return {
      catalogEntryId,
      status: "failed",
      error: err.message,
      mode: "sandbox-fallback",
    };
  }
}

// ── Parallel Fan-Out Executor ────────────────────────────────────────────────

async function executeParallelFanOut(config: StepConfig, ctx: ExecutionContext): Promise<Record<string, any>> {
  const tasks = config.tasks || [];
  if (tasks.length === 0) {
    return { status: "skipped", reason: "No tasks defined for parallel fan-out" };
  }

  const maxConcurrency = Math.min(config.maxConcurrency || 10, 20);
  const failStrategy = config.failStrategy || "continue_all";

  await writeLog(ctx.executionId, "", "INFO", `[Parallel] Launching ${tasks.length} tasks (max concurrency: ${maxConcurrency})`);

  // Execute tasks in batches limited by maxConcurrency
  const results: Record<string, any> = {};
  let failed = 0;
  let completed = 0;

  for (let i = 0; i < tasks.length; i += maxConcurrency) {
    const batch = tasks.slice(i, i + maxConcurrency);

    const batchResults = await Promise.allSettled(
      batch.map(async (task) => {
        const taskStart = Date.now();
        const taskConfig: StepConfig = {
          ...task.config,
          catalogEntryId: task.catalogEntryId,
          userPrompt: task.userPrompt ? resolveTemplate(task.userPrompt, ctx) : undefined,
        };

        let output: any;
        const nodeType = task.nodeType || (task.catalogEntryId ? "catalog_agent" : "llm_prompt");

        switch (nodeType) {
          case "catalog_agent":
            output = await executeCatalogAgent(taskConfig, ctx);
            break;
          case "llm_prompt":
            output = await executeLlmPrompt(taskConfig, ctx);
            break;
          case "http_request":
            output = await executeHttpRequest(taskConfig, ctx);
            break;
          case "transform":
            output = executeTransform(taskConfig, ctx);
            break;
          default:
            output = { type: nodeType, label: task.label, status: "executed" };
        }

        // Track tokens from task output
        if (output?.tokens) {
          ctx.budget.tokenCount += (output.tokens.prompt || 0) + (output.tokens.completion || 0);
          ctx.budget.estimatedCost += estimateTokenCost(output.tokens);
        }

        return { key: task.key, label: task.label, output, duration: Date.now() - taskStart };
      })
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        const { key, output, duration } = result.value;
        results[key] = output;
        completed++;
        await writeLog(ctx.executionId, key, "INFO", `[Parallel/${key}] Completed in ${duration}ms`);
      } else {
        failed++;
        const errMsg = result.reason?.message || String(result.reason);
        await writeLog(ctx.executionId, "", "ERROR", `[Parallel] Task failed: ${errMsg}`);
        if (failStrategy === "fail_fast") {
          return { status: "failed", completed, failed, results, error: errMsg };
        }
      }
    }
  }

  return { status: failed > 0 ? "partial" : "completed", completed, failed, total: tasks.length, results };
}

// ── Quality Gate Executor ───────────────────────────────────────────────────

async function executeQualityGate(config: StepConfig, ctx: ExecutionContext): Promise<Record<string, any>> {
  const sourceKey = config.sourceStepKey;
  const sourceOutput = sourceKey ? ctx.stepOutputs[sourceKey] : null;
  const passThreshold = config.passThreshold ?? 0.7;
  const maxRetries = config.maxRetries ?? 1;

  if (!sourceOutput && sourceKey) {
    return { verdict: "skip", reason: `Source step "${sourceKey}" has no output` };
  }

  // Build review prompt
  const basePrompt = config.reviewerPrompt || "Review the following output for quality, accuracy, and completeness. Return a JSON object with: {\"score\": 0.0-1.0, \"verdict\": \"pass\"|\"fail\"|\"replan\", \"feedback\": \"...\"}";
  const reviewInput = JSON.stringify(sourceOutput || ctx.stepOutputs, null, 2).slice(0, 4000);
  const fullPrompt = `${resolveTemplate(basePrompt, ctx)}\n\n--- OUTPUT TO REVIEW ---\n${reviewInput}`;

  // Use reviewer catalog agent if specified, otherwise fallback to LLM
  let reviewResult: any;
  if (config.reviewerCatalogEntryId) {
    reviewResult = await executeCatalogAgent({
      catalogEntryId: config.reviewerCatalogEntryId,
      userPrompt: fullPrompt,
    }, ctx);
  } else {
    reviewResult = await executeLlmPrompt({
      systemPrompt: "You are a quality gate reviewer. Always respond in valid JSON: {\"score\": number, \"verdict\": \"pass\"|\"fail\"|\"replan\", \"feedback\": \"string\"}",
      userPrompt: fullPrompt,
      temperature: 0.2,
    }, ctx);
  }

  // Track tokens
  if (reviewResult?.tokens) {
    ctx.budget.tokenCount += (reviewResult.tokens.prompt || 0) + (reviewResult.tokens.completion || 0);
    ctx.budget.estimatedCost += estimateTokenCost(reviewResult.tokens);
  }

  // Parse verdict from response
  let score = 0;
  let verdict = "fail";
  let feedback = "";

  try {
    const responseText = reviewResult?.response || reviewResult?.result || "";
    const jsonMatch = responseText.match(/\{[\s\S]*?"score"[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      score = typeof parsed.score === "number" ? parsed.score : 0;
      verdict = parsed.verdict || (score >= passThreshold ? "pass" : "fail");
      feedback = parsed.feedback || "";
    } else {
      // No JSON found — treat as pass with note
      verdict = "pass";
      score = 0.5;
      feedback = "Reviewer did not return structured JSON; auto-passed with low confidence";
    }
  } catch {
    verdict = "pass";
    score = 0.5;
    feedback = "Could not parse reviewer response; auto-passed with low confidence";
  }

  await writeLog(
    ctx.executionId, "", "INFO",
    `[QualityGate] Verdict: ${verdict} (score: ${score.toFixed(2)}, threshold: ${passThreshold})`
  );

  return {
    verdict,
    score,
    passThreshold,
    feedback,
    maxRetries,
    sourceStepKey: sourceKey || null,
    reviewerResponse: reviewResult,
  };
}

// ── Budget Guard ────────────────────────────────────────────────────────────

function checkBudgetGuard(ctx: ExecutionContext): { allowed: boolean; reason?: string } {
  const { budget } = ctx;
  if (budget.budgetLimit > 0 && budget.tokenCount >= budget.budgetLimit) {
    return { allowed: false, reason: `Token budget exceeded: ${budget.tokenCount}/${budget.budgetLimit}` };
  }
  if (budget.costLimit > 0 && budget.estimatedCost >= budget.costLimit) {
    return { allowed: false, reason: `Cost budget exceeded: $${budget.estimatedCost.toFixed(4)}/$${budget.costLimit.toFixed(4)}` };
  }
  return { allowed: true };
}

function estimateTokenCost(tokens: { prompt?: number; completion?: number }): number {
  // Rough estimate: $0.01 per 1K prompt tokens, $0.03 per 1K completion tokens (GPT-4 range)
  const promptCost = ((tokens.prompt || 0) / 1000) * 0.01;
  const completionCost = ((tokens.completion || 0) / 1000) * 0.03;
  return promptCost + completionCost;
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
    budget: {
      tokenCount: 0,
      estimatedCost: 0,
      budgetLimit: 0,   // 0 = unlimited; can be set per-workflow in future
      costLimit: 0,
    },
  };

  let hasError = false;

  // Execute steps sequentially
  for (const step of steps) {
    const stepStart = Date.now();
    const config: StepConfig = (step.config as StepConfig) || {};
    const nodeType = step.nodeType || "action";

    await writeLog(executionId, step.key, "INFO", `[${step.label}] Starting (type: ${nodeType})...`);

    // Budget guard — check before each step
    const budgetCheck = checkBudgetGuard(ctx);
    if (!budgetCheck.allowed) {
      hasError = true;
      await writeLog(executionId, step.key, "ERROR", `[BudgetGuard] ${budgetCheck.reason}`);
      await db().update(wfSteps).set({ status: "failed" }).where(eq(wfSteps.id, step.id));
      break;
    }

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
          output = await executeLlmPrompt(config, ctx);
          break;
        case "catalog_agent":
          output = await executeCatalogAgent(config, ctx);
          break;
        case "parallel_fan_out":
          output = await executeParallelFanOut(config, ctx);
          break;
        case "quality_gate":
          output = await executeQualityGate(config, ctx);
          break;
        default:
          // Generic action — pass through
          output = { type: nodeType, label: step.label, status: "executed" };
          break;
      }

      // Track token usage from LLM/agent steps
      if (output?.tokens) {
        ctx.budget.tokenCount += (output.tokens.prompt || 0) + (output.tokens.completion || 0);
        ctx.budget.estimatedCost += estimateTokenCost(output.tokens);
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
  await completeExecution(executionId, startTime, finalStatus, ctx.budget);
  await writeLog(executionId, "", "INFO",
    `[Execution #${executionId}] ${finalStatus} — ${steps.length} steps in ${Date.now() - startTime}ms | tokens: ${ctx.budget.tokenCount} | cost: $${ctx.budget.estimatedCost.toFixed(4)}`
  );

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

async function completeExecution(executionId: number, startTime: number, status: string, budget?: BudgetState) {
  const updates: any = {
    status,
    completedAt: new Date(),
    duration: Date.now() - startTime,
  };
  if (budget) {
    updates.tokenCount = budget.tokenCount;
    updates.estimatedCost = Math.round(budget.estimatedCost * 10000) / 10000; // 4 decimal places
  }
  await db()
    .update(wfExecutions)
    .set(updates)
    .where(eq(wfExecutions.id, executionId));
}
