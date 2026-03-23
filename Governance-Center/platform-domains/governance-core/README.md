# Governance Core — Platform Domain

## Overview

The core governance engine that enforces platform governance rules at runtime. This is the central enforcement mechanism for all governed mutations.

## Key Components

| Component | Location | Purpose |
|---|---|---|
| Governance engine | `server/governance/governance-engine.ts` | Central evaluation engine |
| Index/barrel | `server/governance/index.ts` | Public API exports |
| RBAC model | `server/governance/rbac-model.ts` | Role-based access control |
| Lifecycle guard | `server/governance/lifecycle-guard.ts` | Lifecycle transition rules |
| Publication gate | `server/governance/publication-gate.ts` | Pre-publish validation |
| Architecture validator | `server/governance/architecture-validator.ts` | Boundary enforcement |
| Risk classifier | `server/governance/risk-classifier.ts` | Risk severity classification |
| Action registry | `server/governance/action-registry.ts` | Platform action registry loader |
| Action key map | `server/governance/action-key-map.ts` | tRPC path to action key mapping |
| Self-check | `server/governance/self-check.ts` | Engine health validation |
| Stage review | `server/governance/stage-review.ts` | Stage review checklist |
| Production hardening | `server/governance/production-hardening.ts` | Hardening checks |

## Runtime Config

| File | Location | Purpose |
|---|---|---|
| Action registry YAML | `config/governance/platform_action_registry.yaml` | Action definitions |
| Control catalog YAML | `controls/*.yaml` | Per-domain control definitions |

## All files in this domain are runtime-critical and remain in their original locations.
