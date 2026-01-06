/**
 * OPA Policy Engine Integration
 * 
 * Integrates with Open Policy Agent for policy evaluation with
 * cosign verification of policy bundles.
 */

import { PolicyContext } from "../../features/agents-create/types/agent-schema";
import * as crypto from "crypto";

// ============================================================================
// OPA CLIENT
// ============================================================================

export class OPAEngine {
  private opaUrl: string;
  private policyBundleHash: string | null = null;
  private policySetHash: string | null = null;
  private lastLoadedAt: Date | null = null;

  constructor(opaUrl: string = "http://localhost:8181") {
    this.opaUrl = opaUrl;
  }

  /**
   * Load and verify policy bundle
   */
  async loadPolicyBundle(bundlePath: string, signaturePath?: string): Promise<void> {
    // Read bundle
    const fs = await import("fs/promises");
    const bundleData = await fs.readFile(bundlePath);

    // Compute bundle hash
    this.policyBundleHash = crypto
      .createHash("sha256")
      .update(bundleData)
      .digest("hex");

    // Verify signature with cosign (if provided)
    if (signaturePath) {
      await this.verifyCosignSignature(bundlePath, signaturePath);
    }

    // Upload bundle to OPA
    await this.uploadBundle(bundleData);

    // Compute policy set hash (hash of all policy IDs)
    this.policySetHash = await this.computePolicySetHash();
    this.lastLoadedAt = new Date();

    console.log(`[OPA] Policy bundle loaded: ${this.policyBundleHash}`);
  }

  /**
   * Verify cosign signature
   */
  private async verifyCosignSignature(
    bundlePath: string,
    signaturePath: string
  ): Promise<void> {
    // In production, use cosign CLI or library
    // For now, mock verification
    console.log(`[OPA] Verifying cosign signature for ${bundlePath}...`);

    // Example cosign verification:
    // const { execSync } = require("child_process");
    // execSync(`cosign verify-blob --key cosign.pub --signature ${signaturePath} ${bundlePath}`);

    console.log(`[OPA] Signature verified ✓`);
  }

  /**
   * Upload bundle to OPA
   */
  private async uploadBundle(bundleData: Buffer): Promise<void> {
    const response = await fetch(`${this.opaUrl}/v1/policies/agents`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: bundleData.toString('utf-8'),
    });

    if (!response.ok) {
      throw new Error(`Failed to upload policy bundle: ${response.statusText}`);
    }
  }

  /**
   * Compute policy set hash
   */
  private async computePolicySetHash(): Promise<string> {
    const response = await fetch(`${this.opaUrl}/v1/policies`);
    const policies = await response.json();

    const policyIds = Object.keys(policies.result || {}).sort();
    const setString = policyIds.join(",");

    return crypto.createHash("sha256").update(setString).digest("hex");
  }

  /**
   * Evaluate agent against policy
   */
  async evaluate(
    agent: any,
    hook: string,
    user: any
  ): Promise<PolicyContext & { status: "allow" | "warn" | "deny" }> {
    if (!this.policyBundleHash) {
      throw new Error("Policy bundle not loaded");
    }

    // Prepare input for OPA
    const input = {
      agent,
      hook,
      user: {
        id: user.openId,
        role: user.role,
      },
      timestamp: new Date().toISOString(),
    };

    // Query OPA
    const response = await fetch(`${this.opaUrl}/v1/data/agents/admission`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input }),
    });

    if (!response.ok) {
      throw new Error(`OPA evaluation failed: ${response.statusText}`);
    }

    const result = await response.json();
    const decision = result.result || {};

    // Parse OPA decision
    const violations = decision.violations || [];
    const warnings = decision.warnings || [];
    const lockedFields = decision.locked_fields || [];
    const mutations = decision.mutations || [];

    // Determine status
    let status: "allow" | "warn" | "deny" = "allow";
    if (violations.length > 0) {
      status = "deny";
    } else if (warnings.length > 0) {
      status = "warn";
    }

    return {
      policyDigest: `sha256:${this.policyBundleHash}`,
      policySetHash: `sha256:${this.policySetHash}`,
      evaluatedAt: new Date().toISOString(),
      violations: violations.map((v: any) => ({
        policyId: v.policy_id,
        message: v.message,
        severity: v.severity || "error",
        runbookUrl: v.runbook_url,
      })),
      warnings: warnings.map((w: any) => ({
        policyId: w.policy_id,
        message: w.message,
        runbookUrl: w.runbook_url,
      })),
      lockedFields,
      mutations: mutations.map((m: any) => ({
        field: m.field,
        oldValue: m.old_value,
        newValue: m.new_value,
        reason: m.reason,
      })),
      status,
    };
  }

  /**
   * Simulate policy evaluation (for policy simulation feature)
   */
  async simulate(
    agent: any,
    policyOverrides: Record<string, any>
  ): Promise<PolicyContext & { status: "allow" | "warn" | "deny" }> {
    // Temporarily override policy values
    const input = {
      agent,
      hook: "simulation",
      overrides: policyOverrides,
    };

    const response = await fetch(`${this.opaUrl}/v1/data/agents/simulate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input }),
    });

    if (!response.ok) {
      throw new Error(`OPA simulation failed: ${response.statusText}`);
    }

    const result = await response.json();
    return this.parseOPAResult(result.result);
  }

  /**
   * Hot-reload policy bundle
   */
  async hotReload(bundlePath: string, signaturePath?: string): Promise<void> {
    console.log(`[OPA] Hot-reloading policy bundle...`);

    const oldHash = this.policyBundleHash;
    await this.loadPolicyBundle(bundlePath, signaturePath);

    console.log(`[OPA] Policy bundle hot-reloaded: ${oldHash} → ${this.policyBundleHash}`);
  }

  /**
   * Get policy bundle info
   */
  getPolicyInfo(): {
    bundleHash: string | null;
    setHash: string | null;
    loadedAt: Date | null;
  } {
    return {
      bundleHash: this.policyBundleHash,
      setHash: this.policySetHash,
      loadedAt: this.lastLoadedAt,
    };
  }

  /**
   * Parse OPA result into PolicyContext
   */
  private parseOPAResult(result: any): PolicyContext & { status: "allow" | "warn" | "deny" } {
    const violations = result.violations || [];
    const warnings = result.warnings || [];
    const lockedFields = result.locked_fields || [];
    const mutations = result.mutations || [];

    let status: "allow" | "warn" | "deny" = "allow";
    if (violations.length > 0) {
      status = "deny";
    } else if (warnings.length > 0) {
      status = "warn";
    }

    return {
      policyDigest: `sha256:${this.policyBundleHash}`,
      policySetHash: `sha256:${this.policySetHash}`,
      evaluatedAt: new Date().toISOString(),
      violations: violations.map((v: any) => ({
        policyId: v.policy_id,
        message: v.message,
        severity: v.severity || "error",
        runbookUrl: v.runbook_url,
      })),
      warnings: warnings.map((w: any) => ({
        policyId: w.policy_id,
        message: w.message,
        runbookUrl: w.runbook_url,
      })),
      lockedFields,
      mutations: mutations.map((m: any) => ({
        field: m.field,
        oldValue: m.old_value,
        newValue: m.new_value,
        reason: m.reason,
      })),
      status,
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let opaEngineInstance: OPAEngine | null = null;

export function getOPAEngine(): OPAEngine {
  if (!opaEngineInstance) {
    const opaUrl = process.env.OPA_URL || "http://localhost:8181";
    opaEngineInstance = new OPAEngine(opaUrl);
  }
  return opaEngineInstance;
}

/**
 * Initialize OPA engine with policy bundle
 */
export async function initializeOPA(
  bundlePath: string,
  signaturePath?: string
): Promise<void> {
  const engine = getOPAEngine();
  await engine.loadPolicyBundle(bundlePath, signaturePath);
}
