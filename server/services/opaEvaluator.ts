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
 * Evaluate runtime policy
 * Used for action authorization, tool usage, resource access
 */
export async function evaluateRuntimePolicy(input: OPAInput): Promise<OPADecision> {
  const denies: Array<{ rule: string; reason: string; field?: string }> = [];

  // Rule 1: Agent must have governance context
  if (!input.governance) {
    denies.push({
      rule: "governance_required",
      reason: "Agent must have governance context for runtime actions",
      field: "governance",
    });
  }

  // Rule 2: Capability check — agent can only use capabilities it was granted
  if (input.governance?.capabilities && input.agent?.requestedCapability) {
    const granted = input.governance.capabilities as string[];
    const requested = input.agent.requestedCapability as string;
    if (!granted.includes(requested)) {
      denies.push({
        rule: "capability_authorized",
        reason: `Agent does not have the "${requested}" capability. Granted: ${granted.join(", ")}`,
        field: "agent.requestedCapability",
      });
    }
  }

  // Rule 3: Network access must be explicitly granted
  if (input.agent?.requestedCapability === "network") {
    if (input.sandbox_constraints?.externalCalls === false) {
      denies.push({
        rule: "network_blocked",
        reason: "Network access is blocked by sandbox constraints",
        field: "sandbox_constraints.externalCalls",
      });
    }
  }

  // Rule 4: Write access must be explicitly granted
  if (input.agent?.requestedCapability === "write" || input.agent?.requestedCapability === "storage") {
    if (input.sandbox_constraints?.persistentWrites === false) {
      denies.push({
        rule: "write_blocked",
        reason: "Persistent writes are blocked by sandbox constraints",
        field: "sandbox_constraints.persistentWrites",
      });
    }
  }

  // Rule 5: Budget check for runtime cost
  if (input.governance?.economics?.monthly_budget_usd && input.agent?.estimatedCostUsd) {
    const budget = input.governance.economics.monthly_budget_usd;
    const spent = input.agent.currentMonthSpendUsd || 0;
    const estimated = input.agent.estimatedCostUsd;
    if (spent + estimated > budget) {
      denies.push({
        rule: "budget_exceeded",
        reason: `Action would exceed monthly budget: $${spent} spent + $${estimated} estimated > $${budget} limit`,
        field: "governance.economics.monthly_budget_usd",
      });
    }
  }

  // Try real OPA if available, fall back to rule-based
  if (denies.length === 0) {
    try {
      const opaResult = await callOPAEngine("runtime/allow", input);
      return opaResult;
    } catch {
      // OPA not available — rule-based evaluation passed, allow
    }
  }

  return {
    allowed: denies.length === 0,
    denies,
  };
}

/**
 * Evaluate interaction policy
 * Used for user interaction rules, data access
 */
export async function evaluateInteractionPolicy(input: OPAInput): Promise<OPADecision> {
  const denies: Array<{ rule: string; reason: string; field?: string }> = [];

  // Rule 1: Actor must have a valid role
  const validRoles = ["agent_admin", "policy_admin", "viewer"];
  if (!validRoles.includes(input.request.actor.role)) {
    denies.push({
      rule: "valid_role",
      reason: `Invalid actor role: ${input.request.actor.role}`,
      field: "request.actor.role",
    });
  }

  // Rule 2: Viewers cannot modify agents
  if (input.request.actor.role === "viewer" && input.agent?.action) {
    const writeActions = ["update", "delete", "execute", "promote", "configure"];
    if (writeActions.includes(input.agent.action)) {
      denies.push({
        rule: "viewer_read_only",
        reason: `Viewers cannot perform "${input.agent.action}" actions`,
        field: "agent.action",
      });
    }
  }

  // Rule 3: Compliance agents cannot be modified without policy_admin
  if (input.agent?.role_class === "compliance" && input.agent?.action === "update") {
    if (input.request.actor.role !== "policy_admin") {
      denies.push({
        rule: "compliance_locked",
        reason: "Compliance agents can only be modified by policy admins",
        field: "request.actor.role",
      });
    }
  }

  // Rule 4: Data access scope — agent can only access its workspace data
  if (input.agent?.targetWorkspaceId && input.agent?.ownWorkspaceId) {
    if (input.agent.targetWorkspaceId !== input.agent.ownWorkspaceId) {
      denies.push({
        rule: "workspace_scope",
        reason: "Agent cannot access data outside its own workspace",
        field: "agent.targetWorkspaceId",
      });
    }
  }

  // Try real OPA if available, fall back to rule-based
  if (denies.length === 0) {
    try {
      const opaResult = await callOPAEngine("interaction/allow", input);
      return opaResult;
    } catch {
      // OPA not available — rule-based evaluation passed, allow
    }
  }

  return {
    allowed: denies.length === 0,
    denies,
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
