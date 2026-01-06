/**
 * OPA Policy Engine Integration
 * 
 * Provides real OPA policy evaluation for agent governance.
 * Uses OPA WebAssembly for in-process policy decisions.
 */

import { loadPolicy } from "@open-policy-agent/opa-wasm";
import { readFileSync } from "fs";
import { join } from "path";

interface PolicyResult {
  allow: boolean;
  deny?: boolean;
  restrict?: boolean;
  reasons?: string[];
  denies?: string[];
}

interface PromotionInput {
  request: {
    kind: string;
    actor: {
      id: string;
      role: string;
    };
    org_limits: {
      max_monthly_budget_usd: number;
    };
  };
  mode: string;
  agent: any;
  sandbox_constraints: any;
  governance: any;
}

export class OPAEngine {
  private policy: any = null;
  private policyHash: string = "";
  private loadedAt: string = "";

  /**
   * Load OPA policy from file or string
   */
  async loadPolicy(policyPath?: string, policyWasm?: Buffer): Promise<void> {
    try {
      let wasmBuffer: Buffer;

      if (policyWasm) {
        wasmBuffer = policyWasm;
      } else if (policyPath) {
        wasmBuffer = readFileSync(policyPath);
      } else {
        // Load default policy
        const defaultPath = join(__dirname, "../../../policies/agent_governance.wasm");
        wasmBuffer = readFileSync(defaultPath);
      }

      this.policy = await loadPolicy(wasmBuffer);
      this.policyHash = this.computeHash(wasmBuffer);
      this.loadedAt = new Date().toISOString();

      console.log(`[OPA] Policy loaded successfully (hash: ${this.policyHash})`);
    } catch (error) {
      console.error("[OPA] Failed to load policy:", error);
      throw new Error(`Failed to load OPA policy: ${error.message}`);
    }
  }

  /**
   * Evaluate promotion request against policy
   */
  async evaluatePromotion(input: PromotionInput): Promise<PolicyResult> {
    if (!this.policy) {
      throw new Error("OPA policy not loaded. Call loadPolicy() first.");
    }

    try {
      // Set input data
      this.policy.setData(input);

      // Evaluate policy
      const result = this.policy.evaluate();

      // Parse OPA result
      return this.parseResult(result);
    } catch (error) {
      console.error("[OPA] Policy evaluation failed:", error);
      return {
        allow: false,
        deny: true,
        reasons: [`Policy evaluation error: ${error.message}`],
      };
    }
  }

  /**
   * Evaluate admission control (runtime check)
   */
  async evaluateAdmission(agentSpec: any, action: string): Promise<PolicyResult> {
    if (!this.policy) {
      throw new Error("OPA policy not loaded. Call loadPolicy() first.");
    }

    const input = {
      request: {
        kind: "admission",
        action,
      },
      agent: agentSpec,
    };

    try {
      this.policy.setData(input);
      const result = this.policy.evaluate();
      return this.parseResult(result);
    } catch (error) {
      console.error("[OPA] Admission evaluation failed:", error);
      return {
        allow: false,
        deny: true,
        reasons: [`Admission evaluation error: ${error.message}`],
      };
    }
  }

  /**
   * Get current policy metadata
   */
  getPolicyMetadata() {
    return {
      loaded: !!this.policy,
      hash: this.policyHash,
      loadedAt: this.loadedAt,
    };
  }

  /**
   * Parse OPA evaluation result
   */
  private parseResult(result: any): PolicyResult {
    // OPA result format varies by policy
    // Adapt to your specific policy output structure
    
    if (result && typeof result === "object") {
      // Standard format: { allow: boolean, deny: boolean, reasons: string[] }
      if ("allow" in result) {
        return {
          allow: result.allow === true,
          deny: result.deny === true,
          restrict: result.restrict === true,
          reasons: result.reasons || [],
          denies: result.denies || [],
        };
      }

      // Alternative format: { result: { allow: boolean } }
      if (result.result) {
        return this.parseResult(result.result);
      }
    }

    // Default: deny if unclear
    return {
      allow: false,
      deny: true,
      reasons: ["Policy result format not recognized"],
    };
  }

  /**
   * Compute SHA-256 hash of policy
   */
  private computeHash(buffer: Buffer): string {
    const crypto = require("crypto");
    return "sha256:" + crypto.createHash("sha256").update(buffer).digest("hex");
  }

  /**
   * Hot reload policy (for development)
   */
  async reloadPolicy(policyPath?: string): Promise<void> {
    console.log("[OPA] Hot reloading policy...");
    await this.loadPolicy(policyPath);
  }
}

// Singleton instance
let opaEngine: OPAEngine | null = null;

export async function getOPAEngine(): Promise<OPAEngine> {
  if (!opaEngine) {
    opaEngine = new OPAEngine();
    // Load default policy on first access
    try {
      await opaEngine.loadPolicy();
    } catch (error) {
      console.warn("[OPA] Could not load default policy, will use mock mode");
      // Don't throw - allow app to start without OPA
    }
  }
  return opaEngine;
}

export function resetOPAEngine() {
  opaEngine = null;
}
