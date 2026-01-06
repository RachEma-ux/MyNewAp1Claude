package agent_governance

import data.common.violations

# Main evaluation rule
evaluate[result] {
    result := {
        "allowed": is_compliant,
        "violations": get_violations,
        "score": calculate_score,
        "details": {
            "temperature_check": check_temperature,
            "access_check": check_access,
            "tools_check": check_tools,
            "role_check": check_role,
        }
    }
}

# Compliance check
is_compliant {
    check_temperature
    check_access
    check_tools
    check_role
}

# Temperature validation
check_temperature {
    agent := input.agent
    agent.temperature >= 0
    agent.temperature <= 2
}

# Access control validation
check_access {
    agent := input.agent
    
    # Document access requires specific roles
    agent.hasDocumentAccess == false; or
    agent.roleClass in ["analyst", "reviewer"]
}

# Tool access validation
check_tools {
    agent := input.agent
    
    # Tool access requires explicit tool list
    agent.hasToolAccess == false; or
    count(agent.allowedTools) > 0
}

# Role-based validation
check_role {
    agent := input.agent
    valid_roles := ["assistant", "analyst", "support", "reviewer", "automator", "monitor", "custom"]
    agent.roleClass in valid_roles
}

# Calculate compliance score (0-100)
calculate_score = score {
    checks := [
        check_temperature,
        check_access,
        check_tools,
        check_role,
    ]
    passed := count([c | c := checks[_]; c])
    total := count(checks)
    score := (passed / total) * 100
}

# Get violations
get_violations = violations_list {
    violations_list := [v | 
        v := violation_messages[_]
    ]
}

# Violation messages
violation_messages[msg] {
    not check_temperature
    msg := "Temperature out of valid range [0, 2]"
}

violation_messages[msg] {
    not check_access
    msg := "Document access not allowed for this role"
}

violation_messages[msg] {
    not check_tools
    msg := "Tool access requires explicit tool list"
}

violation_messages[msg] {
    not check_role
    msg := "Invalid agent role class"
}

# Role-specific policies
policy_assistant {
    input.agent.roleClass == "assistant"
    input.agent.hasDocumentAccess == false
    input.agent.hasToolAccess == false
}

policy_analyst {
    input.agent.roleClass == "analyst"
    input.agent.hasDocumentAccess == true
    count(input.agent.allowedTools) > 0
}

policy_reviewer {
    input.agent.roleClass == "reviewer"
    input.agent.hasDocumentAccess == true
    input.agent.hasToolAccess == false
}

policy_automator {
    input.agent.roleClass == "automator"
    input.agent.hasToolAccess == true
    count(input.agent.allowedTools) > 0
}

# Capability restrictions by role
allowed_capabilities[cap] {
    input.agent.roleClass == "assistant"
    cap := "chat"
}

allowed_capabilities[cap] {
    input.agent.roleClass == "analyst"
    cap := cap_list[_]
    cap_list := ["analysis", "reporting", "data_access"]
}

allowed_capabilities[cap] {
    input.agent.roleClass == "automator"
    cap := cap_list[_]
    cap_list := ["automation", "scheduling", "tool_execution"]
}

# Default deny
default is_compliant = false
