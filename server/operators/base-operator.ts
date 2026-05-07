/**
 * Base Operator — Abstract operator contract
 *
 * All operators extend this base. An operator:
 *   1. Receives an OperatorJob
 *   2. Calls Provider Hub Router (NEVER a provider directly)
 *   3. Produces a SyscallBatch
 *   4. NEVER executes adapters directly
 */

import { v4 as uuidv4 } from "uuid";
import type {
  OperatorJob,
  OperatorName,
  SyscallBatch,
  ProviderHubRequest,
  ProviderHubResponse,
} from "@shared/operator-types";
import { callProviderHub } from "./provider-hub";

export abstract class BaseOperator {
  abstract readonly name: OperatorName;
  abstract readonly systemPrompt: string;

  /**
   * Build the user prompt from the job.
   * Each operator customizes this based on its domain.
   */
  abstract buildUserPrompt(job: OperatorJob): string;

  /**
   * Generate a SyscallBatch by calling the Provider Hub.
   * This is the core operator loop: prompt → LLM → parse → validate → return.
   */
  async generatePlan(job: OperatorJob): Promise<SyscallBatch> {
    const userPrompt = this.buildUserPrompt(job);

    // PMB Phase 29.5 — workspaceId is required by the post-LR-04
    // provider hub. Operator jobs without a workspace context cannot
    // resolve a classifier binding and are refused before any
    // upstream call.
    if (!job.intent.workspaceId) {
      throw new Error(
        `[Operator/${this.name}] Job ${job.jobId} cannot be planned without a workspaceId on the intent (PMB Phase 29.5).`,
      );
    }

    const request: ProviderHubRequest = {
      operator: this.name,
      jobId: job.jobId,
      systemPrompt: this.systemPrompt,
      userPrompt,
      maxTokens: job.constraints.maxTokens,
      temperature: job.constraints.temperature,
      responseFormat: "json",
      traceId: job.traceId,
      workspaceId: job.intent.workspaceId,
    };

    const response: ProviderHubResponse = await callProviderHub(request);

    // Parse and validate SyscallBatch from LLM response
    const parsed = this.parseSyscallBatch(response.content, job, response);
    return parsed;
  }

  /**
   * Parse raw LLM JSON output into a validated SyscallBatch.
   */
  private parseSyscallBatch(
    content: string,
    job: OperatorJob,
    response: ProviderHubResponse,
  ): SyscallBatch {
    let raw: any;
    try {
      raw = JSON.parse(content);
    } catch {
      throw new Error(`Operator "${this.name}" received non-JSON response from LLM`);
    }

    // Normalize and validate structure
    const plan = Array.isArray(raw.plan) ? raw.plan : [];
    const explain = typeof raw.explain === "string" ? raw.explain : "No explanation provided";
    const risk = raw.risk && typeof raw.risk === "object"
      ? {
          level: (["low", "medium", "high"].includes(raw.risk.level) ? raw.risk.level : "medium") as "low" | "medium" | "high",
          reasoning: typeof raw.risk.reasoning === "string" ? raw.risk.reasoning : "No risk reasoning",
        }
      : { level: "medium" as const, reasoning: "Default risk assessment" };

    // Validate each syscall in the plan
    const validatedPlan = plan.map((sc: any, i: number) => {
      if (!sc.action || typeof sc.action !== "string") {
        throw new Error(`Syscall ${i}: missing or invalid "action" field`);
      }
      return {
        action: sc.action,
        args: sc.args && typeof sc.args === "object" ? sc.args : {},
        description: typeof sc.description === "string" ? sc.description : `Syscall ${i}`,
        riskLevel: ["low", "medium", "high"].includes(sc.riskLevel) ? sc.riskLevel : "medium",
        requiredAutonomyLevel: typeof sc.requiredAutonomyLevel === "number" ? sc.requiredAutonomyLevel : 0,
      };
    });

    // Enforce max syscalls constraint
    if (validatedPlan.length > job.constraints.maxSyscalls) {
      throw new Error(
        `Operator "${this.name}" produced ${validatedPlan.length} syscalls, exceeding limit of ${job.constraints.maxSyscalls}`
      );
    }

    return {
      jobId: job.jobId,
      operator: this.name,
      plan: validatedPlan,
      explain,
      risk,
      generatedAt: new Date().toISOString(),
      modelUsed: response.model,
      providerUsed: response.provider,
    };
  }
}
