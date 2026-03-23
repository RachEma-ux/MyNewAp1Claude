# OPA Policy Guide

## Overview

The Agent Governance Platform uses Open Policy Agent (OPA) and the Rego language to define and enforce governance policies for AI agents. This guide explains how to write, test, and deploy policies.

## Policy Structure

### Basic Policy Template

```rego
package agent_governance

# Main evaluation rule
evaluate[result] {
    result := {
        "allowed": is_compliant,
        "violations": get_violations,
        "score": calculate_score,
        "details": {
            "check_1": check_1,
            "check_2": check_2,
        }
    }
}

# Compliance check
is_compliant {
    check_1
    check_2
}

# Individual checks
check_1 {
    # Your logic here
}

check_2 {
    # Your logic here
}

# Violations
get_violations = violations_list {
    violations_list := [v | v := violation_messages[_]]
}

violation_messages[msg] {
    not check_1
    msg := "Check 1 failed"
}

# Default deny
default is_compliant = false
```

## Common Policy Patterns

### Temperature Validation

```rego
# Ensure temperature is within valid range
check_temperature {
    agent := input.agent
    agent.temperature >= 0
    agent.temperature <= 2
}

violation_messages[msg] {
    not check_temperature
    msg := "Temperature out of valid range [0, 2]"
}
```

### Role-Based Access Control

```rego
# Define allowed capabilities by role
allowed_capabilities[cap] {
    input.agent.roleClass == "assistant"
    cap := "chat"
}

allowed_capabilities[cap] {
    input.agent.roleClass == "analyst"
    cap := cap_list[_]
    cap_list := ["analysis", "reporting", "data_access"]
}

# Validate agent has allowed capabilities
check_capabilities {
    agent := input.agent
    # Agent capabilities must be in allowed list
    count([c | c := agent.capabilities[_]; not allowed_capabilities[c]]) == 0
}
```

### Document Access Control

```rego
# Only specific roles can access documents
check_document_access {
    agent := input.agent
    
    # Document access requires specific roles
    agent.hasDocumentAccess == false; or
    agent.roleClass in ["analyst", "reviewer"]
}

violation_messages[msg] {
    not check_document_access
    msg := "Document access not allowed for this role"
}
```

### Tool Access Validation

```rego
# Tool access requires explicit tool list
check_tool_access {
    agent := input.agent
    
    # Tool access must have explicit tools
    agent.hasToolAccess == false; or
    count(agent.allowedTools) > 0
}

violation_messages[msg] {
    not check_tool_access
    msg := "Tool access requires explicit tool list"
}
```

### Resource Limits

```rego
# Enforce resource limits by role
max_tokens[role] = limit {
    role == "assistant"
    limit := 2000
}

max_tokens[role] = limit {
    role == "analyst"
    limit := 8000
}

max_tokens[role] = limit {
    role == "automator"
    limit := 16000
}

check_resource_limits {
    agent := input.agent
    limit := max_tokens[agent.roleClass]
    agent.maxTokens <= limit
}
```

### Compliance Scoring

```rego
# Calculate compliance score
calculate_score = score {
    checks := [
        check_temperature,
        check_document_access,
        check_tool_access,
        check_capabilities,
    ]
    passed := count([c | c := checks[_]; c])
    total := count(checks)
    score := (passed / total) * 100
}
```

## Advanced Patterns

### Conditional Rules

```rego
# Apply different rules based on conditions
check_advanced {
    agent := input.agent
    
    # If analyst, require document access
    agent.roleClass == "analyst" -> agent.hasDocumentAccess == true;
    
    # If automator, require tool access
    agent.roleClass == "automator" -> agent.hasToolAccess == true;
    
    # Otherwise, no special access needed
    agent.roleClass not in ["analyst", "automator"]
}
```

### Workspace-Level Policies

```rego
# Apply different policies based on workspace settings
check_workspace_policy {
    workspace := input.workspace
    
    # Get workspace policy settings
    policy_settings := workspace.policies[_]
    
    # Apply policy checks
    apply_policy_check(policy_settings)
}

apply_policy_check(policy) {
    policy.enforceStrictMode == true
    # Strict mode checks
}

apply_policy_check(policy) {
    policy.enforceStrictMode == false
    # Relaxed mode checks
}
```

### Time-Based Rules

```rego
# Apply different rules based on time
check_time_based {
    now := time.now_ns()
    agent := input.agent
    
    # During business hours (9-17)
    hour := time.date(now)[3]
    hour >= 9
    hour <= 17
    
    # Apply business hours policy
    agent.temperature <= 0.5
}
```

### Deny Rules

```rego
# Explicitly deny certain configurations
deny[msg] {
    agent := input.agent
    
    # Deny assistants with tool access
    agent.roleClass == "assistant"
    agent.hasToolAccess == true
    
    msg := "Assistants cannot have tool access"
}

# Deny rules are checked first
is_compliant {
    count(deny) == 0
}
```

## Testing Policies

### Using OPA CLI

```bash
# Test policy compilation
opa build -b server/policies/

# Test policy evaluation
opa run -s server/policies/ <<EOF
{
  "agent": {
    "id": 1,
    "name": "Test Agent",
    "roleClass": "analyst",
    "temperature": 0.7,
    "hasDocumentAccess": true,
    "hasToolAccess": true,
    "allowedTools": ["web_search"]
  },
  "workspace": {
    "id": 1,
    "policies": []
  }
}
EOF
```

### Using the API

```bash
# Compile policy
curl -X POST https://opa.example.com/v1/compile \
  -H "Content-Type: application/json" \
  -d '{
    "query": "data.agent_governance.evaluate",
    "modules": [{
      "filename": "policy.rego",
      "content": "package agent_governance\n..."
    }]
  }'

# Evaluate policy
curl -X POST https://opa.example.com/v1/data/agent_governance/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "agent": {...},
      "workspace": {...}
    }
  }'
```

## Policy Examples

### Example 1: Strict Governance

```rego
package agent_governance

evaluate[result] {
    result := {
        "allowed": is_compliant,
        "violations": get_violations,
        "score": calculate_score,
    }
}

is_compliant {
    check_temperature
    check_document_access
    check_tool_access
    check_role
}

check_temperature {
    input.agent.temperature >= 0
    input.agent.temperature <= 1
}

check_document_access {
    input.agent.hasDocumentAccess == false
}

check_tool_access {
    input.agent.hasToolAccess == false
}

check_role {
    input.agent.roleClass in ["assistant", "monitor"]
}

get_violations = [v | v := violation_messages[_]]

violation_messages[msg] {
    not check_temperature
    msg := "Temperature must be between 0 and 1"
}

violation_messages[msg] {
    not check_document_access
    msg := "Document access not allowed"
}

violation_messages[msg] {
    not check_tool_access
    msg := "Tool access not allowed"
}

violation_messages[msg] {
    not check_role
    msg := "Invalid role for strict governance"
}

calculate_score = score {
    checks := [check_temperature, check_document_access, check_tool_access, check_role]
    passed := count([c | c := checks[_]; c])
    score := (passed / count(checks)) * 100
}

default is_compliant = false
```

### Example 2: Role-Based Governance

```rego
package agent_governance

evaluate[result] {
    result := {
        "allowed": is_compliant,
        "violations": get_violations,
        "score": 100,
    }
}

is_compliant {
    role_policy[input.agent.roleClass]
}

role_policy["assistant"] {
    input.agent.temperature <= 0.8
    input.agent.hasDocumentAccess == false
    input.agent.hasToolAccess == false
}

role_policy["analyst"] {
    input.agent.temperature <= 1.0
    input.agent.hasDocumentAccess == true
    input.agent.hasToolAccess == true
    count(input.agent.allowedTools) > 0
}

role_policy["automator"] {
    input.agent.temperature <= 0.5
    input.agent.hasToolAccess == true
    count(input.agent.allowedTools) > 0
}

role_policy["reviewer"] {
    input.agent.temperature <= 0.3
    input.agent.hasDocumentAccess == true
    input.agent.hasToolAccess == false
}

get_violations = [msg | msg := violation_messages[_]]

violation_messages[msg] {
    not is_compliant
    msg := sprintf("Agent does not comply with %s policy", [input.agent.roleClass])
}

default is_compliant = false
```

## Best Practices

1. **Keep Policies Simple**: Start with basic rules and gradually add complexity
2. **Use Descriptive Names**: Make rule names self-documenting
3. **Test Thoroughly**: Test policies with various agent configurations
4. **Version Control**: Track policy changes in version control
5. **Document Rules**: Add comments explaining complex logic
6. **Gradual Rollout**: Test policies in staging before production
7. **Monitor Violations**: Track which agents fail policy checks
8. **Regular Reviews**: Review and update policies regularly

## Troubleshooting

### Policy Compilation Errors

```
error: rego_parse_error: unexpected token
```

**Solution**: Check syntax - ensure all rules end with proper closing braces

### Policy Evaluation Errors

```
error: rego_type_error: undefined reference
```

**Solution**: Ensure all referenced variables are defined in the input

### Performance Issues

```
error: rego_eval_error: evaluation timed out
```

**Solution**: Simplify policy logic, avoid complex nested loops

## Resources

- [OPA Documentation](https://www.openpolicyagent.org/docs/latest/)
- [Rego Language Guide](https://www.openpolicyagent.org/docs/latest/policy-language/)
- [OPA Playground](https://play.openpolicyagent.org/)
