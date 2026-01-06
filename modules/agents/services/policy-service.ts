import { readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import type { AgentSpec, PolicyEvaluationInput, PolicyEvaluationResult } from "../types";

/**
 * Policy Service
 * Evaluates agent promotion requests against OPA policies
 */
export class PolicyService {
  private policyWasm: WebAssembly.Module | null = null;
  private policyHash: string | null = null;

  /**
   * Load policy from Rego file (compiled to WASM)
   * In production, this would load a pre-compiled WASM bundle
   */
  async loadPolicy(policyPath: string): Promise<void> {
    try {
      // For now, we'll use the Rego source directly
      // In production, compile with: opa build -t wasm -e governance/promotion promotion.rego
      const regoSource = readFileSync(policyPath, "utf-8");
      this.policyHash = createHash("sha256").update(regoSource).digest("hex");
      
      // Note: Actual WASM loading would happen here
      // For MVP, we'll implement a simplified evaluation
      console.log(`Policy loaded: ${policyPath} (hash: ${this.policyHash})`);
    } catch (error) {
      throw new Error(`Failed to load policy: ${error}`);
    }
  }

  /**
   * Evaluate agent against promotion policy
   */
  async evaluate(input: PolicyEvaluationInput): Promise<PolicyEvaluationResult> {
    if (!this.policyHash) {
      throw new Error("Policy not loaded");
    }

    // Simplified evaluation logic (MVP)
    // In production, this would use OPA WASM runtime
    const violations: string[] = [];

    // Check budget
    if (input.governance?.economics?.monthly_budget_usd > input.request.org_limits.max_monthly_budget_usd) {
      violations.push(
        `Agent monthly budget ${input.governance.economics.monthly_budget_usd} exceeds org limit ${input.request.org_limits.max_monthly_budget_usd}`
      );
    }

    // Check forbidden side effects
    const forbiddenActions = input.agent.anatomy.actions?.filter(
      (action: any) => 
        action.side_effects === true && 
        !["send_email", "send_notification", "log_event"].includes(action.type)
    ) || [];

    if (forbiddenActions.length > 0) {
      violations.push(
        `Agent has forbidden side-effecting actions: ${forbiddenActions.map((a: any) => a.type).join(", ")}`
      );
    }

    // Check sandbox constraints
    if (input.sandbox_constraints?.external_calls === true) {
      violations.push("Sandbox agents with external_calls=true cannot be promoted");
    }

    if (input.sandbox_constraints?.persistent_writes === true) {
      violations.push("Sandbox agents with persistent_writes=true cannot be promoted");
    }

    // Check role permissions
    if (input.request.actor.role === "viewer") {
      violations.push("Viewers cannot promote agents");
    }

    const allow = violations.length === 0;

    return {
      allow,
      denies: violations,
      policyHash: this.policyHash,
      evaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get current policy hash
   */
  getPolicyHash(): string {
    if (!this.policyHash) {
      throw new Error("Policy not loaded");
    }
    return this.policyHash;
  }

  /**
   * Hot-reload policy
   */
  async reload(policyPath: string): Promise<void> {
    await this.loadPolicy(policyPath);
    console.log("Policy reloaded successfully");
  }
}

// Singleton instance
let policyServiceInstance: PolicyService | null = null;

export function getPolicyService(): PolicyService {
  if (!policyServiceInstance) {
    policyServiceInstance = new PolicyService();
    // Load default policy
    const policyPath = join(process.cwd(), "modules/agents/policies/promotion.rego");
    policyServiceInstance.loadPolicy(policyPath).catch(console.error);
  }
  return policyServiceInstance;
}
