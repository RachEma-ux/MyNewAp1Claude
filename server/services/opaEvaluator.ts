/**
 * OPA Policy Evaluator
 * Phase 4: Policy-as-Code
 * 
 * Evaluates promotion and runtime policies using OPA engine
 * MVP: Uses rule-based evaluation (upgrade to real OPA later)
 */

export interface OPAInput {
  request: {
    kind: "promote" | "runtime" | "interaction";
    actor: {
      id: string;
      role: "agent_admin" | "policy_admin" | "viewer";
    };
    org_limits: {
      max_monthly_budget_usd: number;
    };
  };
  agent: any;
  sandbox_constraints?: any;
  governance?: any;
}

export interface OPADecision {
  allowed: boolean;
  denies: Array<{
    rule: string;
    reason: string;
    field?: string;
  }>;
}

/**
 * Evaluate promotion policy
 * MVP: Rule-based evaluation
 * TODO: Integrate with real OPA engine (POST to http://localhost:8181/v1/data/promotion/allow)
 */
export async function evaluatePromotionPolicy(input: OPAInput): Promise<OPADecision> {
  const denies: Array<{ rule: string; reason: string; field?: string }> = [];

  // Rule 1: Actor must be admin
  if (input.request.actor.role !== "agent_admin" && input.request.actor.role !== "policy_admin") {
    denies.push({
      rule: "user_is_admin",
      reason: "Only admins can promote agents",
      field: "request.actor.role",
    });
  }

  // Rule 2: Anatomy must be complete
  if (!input.agent.anatomy || Object.keys(input.agent.anatomy).length === 0) {
    denies.push({
      rule: "anatomy_complete",
      reason: "Agent anatomy is incomplete",
      field: "agent.anatomy",
    });
  }

  // Rule 3: Sandbox must be contained
  if (input.sandbox_constraints) {
    if (input.sandbox_constraints.externalCalls === true) {
      denies.push({
        rule: "sandbox_contained",
        reason: "CONTAINMENT_VIOLATION: Sandbox agents cannot make external calls",
        field: "sandbox_constraints.externalCalls",
      });
    }

    if (input.sandbox_constraints.persistentWrites === true) {
      denies.push({
        rule: "sandbox_contained",
        reason: "CONTAINMENT_VIOLATION: Sandbox agents cannot make persistent writes",
        field: "sandbox_constraints.persistentWrites",
      });
    }
  }

  // Rule 4: Capabilities must be valid
  if (input.governance?.capabilities) {
    const validCapabilities = ["read", "write", "execute", "network", "storage"];
    const invalidCaps = input.governance.capabilities.filter(
      (cap: string) => !validCapabilities.includes(cap)
    );

    if (invalidCaps.length > 0) {
      denies.push({
        rule: "capabilities_valid",
        reason: `Invalid capabilities: ${invalidCaps.join(", ")}`,
        field: "governance.capabilities",
      });
    }
  }

  // Rule 5: Temperature must be appropriate for role class
  if (input.agent.role_class === "compliance") {
    const temperature = input.agent.anatomy?.reasoning?.temperature;
    if (temperature && temperature > 0.3) {
      denies.push({
        rule: "temp_ok",
        reason: `Compliance agents must have temperature ≤ 0.3, got ${temperature}`,
        field: "agent.anatomy.reasoning.temperature",
      });
    }
  }

  // Rule 6: Budget must not exceed org limit
  if (input.governance?.economics?.monthly_budget_usd) {
    const budget = input.governance.economics.monthly_budget_usd;
    const orgLimit = input.request.org_limits.max_monthly_budget_usd;

    if (budget > orgLimit) {
      denies.push({
        rule: "budget_ok",
        reason: `Monthly budget ${budget} exceeds org limit of ${orgLimit}`,
        field: "governance.economics.monthly_budget_usd",
      });
    }
  }

  return {
    allowed: denies.length === 0,
    denies,
  };
}

/**
 * Build OPA input payload from promotion request
 */
export function buildPromotionInput(
  agent: any,
  actor: { id: string; role: string },
  orgLimits: { max_monthly_budget_usd: number }
): OPAInput {
  return {
    request: {
      kind: "promote",
      actor: {
        id: actor.id,
        role: actor.role as any,
      },
      org_limits: orgLimits,
    },
    agent: {
      name: agent.name,
      version: agent.version,
      description: agent.description,
      role_class: agent.roleClass,
      anatomy: agent.anatomy,
    },
    sandbox_constraints: agent.sandboxConstraints,
    governance: agent.governance,
  };
}

/**
 * Evaluate runtime policy (placeholder for future)
 * Used for action authorization, tool usage, resource access
 */
export async function evaluateRuntimePolicy(input: OPAInput): Promise<OPADecision> {
  // MVP: Allow all runtime actions
  // TODO: Implement runtime policy evaluation
  return {
    allowed: true,
    denies: [],
  };
}

/**
 * Evaluate interaction policy (placeholder for future)
 * Used for user interaction rules, data access
 */
export async function evaluateInteractionPolicy(input: OPAInput): Promise<OPADecision> {
  // MVP: Allow all interactions
  // TODO: Implement interaction policy evaluation
  return {
    allowed: true,
    denies: [],
  };
}

/**
 * Call real OPA engine (for production)
 * Requires OPA server running on localhost:8181
 */
export async function callOPAEngine(
  policyPath: string,
  input: OPAInput
): Promise<OPADecision> {
  try {
    const response = await fetch(`http://localhost:8181/v1/data/${policyPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input }),
    });

    if (!response.ok) {
      throw new Error(`OPA engine returned ${response.status}`);
    }

    const result = await response.json();

    // OPA returns { result: { allowed: boolean, denies: [...] } }
    return result.result || { allowed: false, denies: [{ rule: "opa_error", reason: "OPA evaluation failed" }] };
  } catch (error) {
    console.error("[OPA] Failed to call OPA engine:", error);
    
    // Fallback to rule-based evaluation
    return evaluatePromotionPolicy(input);
  }
}
