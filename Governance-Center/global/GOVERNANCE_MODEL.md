# Governance Model

## Platform Governance Overview

MyNewAp1Claude implements a layered governance model enforced at runtime through the Governance Engine (CGT v2).

## Governance Layers

### 1. Platform Governance (Cross-Cutting)
- Enforced by `server/governance/governance-engine.ts`
- All mutations route through `governedProcedure` or `requireGovernedAction`
- Central action registry (`config/governance/platform_action_registry.yaml`) defines all governed actions
- Governance engine evaluates: freeze state, lifecycle stage, RBAC, risk classification, audit requirements

### 2. Module Governance (Per-Module)
- Each module (HR, Workspace, Automation, etc.) may define additional governance constraints
- Module-specific permission models (e.g., HR uses `governedProcedure` + `requireHrPermission`)
- Module governance profiles describe per-module controls, risks, and gaps

### 3. Domain Governance (Cross-Cutting Technical Domains)
- Policy engine, audit core, identity/access, module registry, publication lifecycle, runtime agents
- These are not app menu modules but technical domains that enforce governance across all modules

## Enforcement Architecture

```
Request → tRPC procedure → governedProcedure middleware
  → freeze check (fail-closed)
  → lifecycle stage validation
  → RBAC/permission check
  → risk classification
  → audit log emission
  → mutation execution
  → evidence artifact storage
```

## Governance Modes

| Mode | Behavior |
|---|---|
| `strict` | All governance checks enforced, violations blocked |
| `permissive` | Governance checks run but violations logged, not blocked |
| `disabled` | No governance checks (development only) |

Current default: `permissive` (as seen in server boot logs).

## Key Governance Primitives

- **governedProcedure**: tRPC procedure that enforces governance checks before mutation
- **requireGovernedAction**: Pipeline that wraps a mutation with freeze + audit + risk checks
- **requireGate**: Gate enforcement function (available but underutilized per audit)
- **policyGate**: RBAC-based policy gate in services layer
- **Scorecard**: Per-entity governance health scoring with control catalog evaluation

## Module Governance Sequencing

All modules must follow the governance-first policy: governance documentation before implementation code. See [GOVERNANCE_FIRST_MODULE_AND_SANDBOX_POLICY.md](GOVERNANCE_FIRST_MODULE_AND_SANDBOX_POLICY.md) for the official policy, including the sandbox exception path and promotion rules.

Module governance packet templates are in `Governance-Center/templates/module/`.

## Authoritative Sources

- Full governance specification: [Governance Bible](../docs/governance-bible/GOVERNANCE_BIBLE.md)
- Module and sandbox policy: [Governance-First Module and Sandbox Policy](GOVERNANCE_FIRST_MODULE_AND_SANDBOX_POLICY.md)
