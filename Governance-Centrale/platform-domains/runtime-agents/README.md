# Runtime Agents — Platform Domain

## Overview

Covers autonomous agents and operators that execute governance actions at runtime without direct user interaction.

## Components

| Component | Location | Purpose |
|---|---|---|
| Governance operator | `server/operators/governance-operator.ts` | Autonomous governance operator |
| Agent orchestration | `server/agents/` | Agent runtime engine |
| Agent promotions | `server/agents/promotions/` | Agent promotion lifecycle |
| Agent policy engine | `server/policies/agent-policy-engine.ts` | Agent governance rules |
| Bot policy engine | `server/policies/bot-policy-engine.ts` | Bot governance rules |
| Syscall governance gate | `server/syscall/governance-gate.ts` | Deny-by-default gate for agent syscalls |

## Governance Controls

- Agent syscalls pass through `governance-gate.ts` (deny-by-default)
- Agent lifecycle governed by agent policy engine
- Agent promotions have governance overlay (with mock freeze — H1)
- Governance operator runs autonomous governance checks

## All files are runtime-critical and remain in their original locations.
