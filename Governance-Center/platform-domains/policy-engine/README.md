# Policy Engine — Platform Domain

## Overview

The policy engine domain covers all runtime policy evaluation: domain-specific TypeScript policy engines, the OPA/Rego reference policy, and the policyGate service.

## Current Architecture

The platform uses **TypeScript rule-based policy engines**, not OPA. See [Policy Engine Position](../../global/POLICY_ENGINE_POSITION.md) for the full clarification.

## Components

| Component | Location | Purpose |
|---|---|---|
| Agent policy engine | `server/policies/agent-policy-engine.ts` | Agent lifecycle rules |
| Bot policy engine | `server/policies/bot-policy-engine.ts` | Bot governance rules |
| Domain policy engine | `server/policies/domain-policy-engine.ts` | Cross-domain rules |
| LLM policy engine | `server/policies/llm-policy-engine.ts` | LLM governance rules |
| Model policy engine | `server/policies/model-policy-engine.ts` | Model governance rules |
| Provider policy engine | `server/policies/provider-policy-engine.ts` | Provider governance rules |
| OPA policy (reference) | `server/policies/agent_governance.rego` | Legacy OPA policy (not actively enforced) |
| Policy gate service | `server/services/policyGate.ts` | RBAC-based policy gate |

## All files are runtime-critical and remain in their original locations.
