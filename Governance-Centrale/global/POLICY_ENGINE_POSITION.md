# Policy Engine Position

## Current Status

This document clarifies the repo's policy engine story.

### What is authoritative now?

The **rule-based governance engine** (`server/governance/governance-engine.ts`) is the authoritative policy enforcement mechanism. It uses:

1. **Platform action registry** (`config/governance/platform_action_registry.yaml`) — defines all governed actions
2. **YAML control catalog** (`controls/*.yaml`) — defines governance controls per domain
3. **TypeScript policy engines** (`server/policies/*-policy-engine.ts`) — domain-specific rule evaluation
4. **RBAC model** (`server/governance/rbac-model.ts`) — role-based access decisions

### OPA / Rego Status

- **Legacy/reference**: A Rego policy file exists at `server/policies/agent_governance.rego`
- **Not actively enforced at runtime**: The OPA evaluation path is not wired into the main governance engine
- **Historical**: OPA was part of an earlier governance design (documented in archived `OPA_POLICY_GUIDE.md`)
- **Reference copy**: A copy exists in `Governance-Centrale/manifests/agent_governance.rego` for documentation

### Is OPA planned?

There is no active plan to re-introduce OPA as the primary policy engine. The current rule-based approach using TypeScript policy engines and YAML control catalogs is the operational standard.

If OPA integration is revisited in the future, it would need to:
1. Replace or wrap the current TypeScript policy engines
2. Be integrated into the `governedProcedure` pipeline
3. Maintain the existing control catalog semantics
4. Pass all existing governance tests

## Policy Evaluation Flow

```
Mutation request
  → governedProcedure
    → governance-engine.evaluate()
      → action-registry lookup (YAML)
      → freeze check
      → lifecycle guard
      → domain policy engine (TypeScript)
      → risk classification
      → RBAC check
      → audit + evidence
    → allow / deny
```

## Domain Policy Engines

| Engine | Location | Scope |
|---|---|---|
| Agent policy | `server/policies/agent-policy-engine.ts` | Agent lifecycle |
| Bot policy | `server/policies/bot-policy-engine.ts` | Bot governance |
| Domain policy | `server/policies/domain-policy-engine.ts` | Cross-domain |
| LLM policy | `server/policies/llm-policy-engine.ts` | LLM governance |
| Model policy | `server/policies/model-policy-engine.ts` | Model governance |
| Provider policy | `server/policies/provider-policy-engine.ts` | Provider governance |
