# Agent Governance Policy
# Defines rules for agent promotion and admission control

package agent_governance

import future.keywords.if
import future.keywords.in

# Default deny
default allow = false

# Allow promotion if all checks pass
allow if {
    input.request.kind == "promote"
    not deny_promotion
}

# Deny promotion reasons
deny_promotion[reason] {
    input.governance.economics.monthly_budget_usd > input.request.org_limits.max_monthly_budget_usd
    reason := "Budget exceeds organization limit"
}

deny_promotion[reason] {
    input.mode != "sandbox"
    reason := "Can only promote from sandbox mode"
}

deny_promotion[reason] {
    count(input.agent.anatomy.actions) == 0
    reason := "Agent must have at least one action"
}

deny_promotion[reason] {
    input.governance.economics.rate_limit_per_min > 1000
    reason := "Rate limit too high (max 1000/min)"
}

# Admission control for runtime
allow if {
    input.request.kind == "admission"
    not deny_admission
}

deny_admission[reason] {
    input.agent.mode == "sandbox"
    input.agent.expiresAt < time.now_ns()
    reason := "Sandbox agent expired"
}

deny_admission[reason] {
    input.agent.governanceStatus == "GOVERNED_INVALIDATED"
    reason := "Agent governance invalidated"
}

# Policy metadata
policy_version := "1.0.0"
policy_hash := "sha256:placeholder"
