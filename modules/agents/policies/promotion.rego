package governance.promotion

# Default deny
default allow = false

# Allow promotion if all checks pass
allow {
    not has_violations
}

# Collect all violations
violations[msg] {
    check_budget
    msg := sprintf("Agent monthly budget %v exceeds org limit %v", [
        input.governance.economics.monthly_budget_usd,
        input.request.org_limits.max_monthly_budget_usd
    ])
}

violations[msg] {
    check_side_effects
    msg := sprintf("Agent has forbidden side-effecting actions: %v", [
        forbidden_actions
    ])
}

violations[msg] {
    check_external_calls
    input.sandbox_constraints.external_calls == true
    msg := "Sandbox agents with external_calls=true cannot be promoted"
}

violations[msg] {
    check_persistent_writes
    input.sandbox_constraints.persistent_writes == true
    msg := "Sandbox agents with persistent_writes=true cannot be promoted"
}

violations[msg] {
    check_role_permissions
    input.request.actor.role == "viewer"
    msg := "Viewers cannot promote agents"
}

# Helper: Check if there are any violations
has_violations {
    count(violations) > 0
}

# Helper: Check budget
check_budget {
    input.governance.economics.monthly_budget_usd > input.request.org_limits.max_monthly_budget_usd
}

# Helper: Check side effects
check_side_effects {
    count(forbidden_actions) > 0
}

forbidden_actions[action.type] {
    action := input.agent.anatomy.actions[_]
    action.side_effects == true
    not action.type in allowed_side_effect_actions
}

# Allowed side-effecting actions (whitelist)
allowed_side_effect_actions = {
    "send_email",
    "send_notification",
    "log_event"
}

# Helper: Check external calls
check_external_calls {
    input.sandbox_constraints.external_calls == true
}

# Helper: Check persistent writes
check_persistent_writes {
    input.sandbox_constraints.persistent_writes == true
}

# Helper: Check role permissions
check_role_permissions {
    input.request.actor.role == "viewer"
}

# Decision output
decision = {
    "allow": allow,
    "denies": violations
}
