# ADR-005: AI Types Integration — Deferred

## Status
Deferred (MVP ships without AI Types integration)

## Context
The platform AI Types module provides model classification, capability tagging,
and selection logic. Code Studio uses OpenCode as its runtime, and OpenCode
manages its own model selection via agent config files.

## Decision
AI Types integration is deferred for the following reasons:

1. **Model selection is owned by OpenCode.** Agent configs (`.opencode/agents/`)
   set which model each agent uses. Code Studio does not select models directly.
2. **No immediate value.** AI Types enrichment (capability scores, cost tags)
   would only add informational metadata, not affect workflow behavior.
3. **Boundary compliance.** AGENTS.md rule: Code Studio is a standalone module.
   Coupling to AI Types creates a cross-module import, which violates the
   clone-only rule until an explicit integration contract is defined.

## Future Integration Path
When integration is needed:
- Code Studio exposes a `codeStudio.models.preferred` query returning the model
  IDs used by its agents.
- AI Types reads that list and enriches with capability metadata.
- A `code-studio-ai-types-bridge.ts` adapter (cloned, not imported) maps between
  the two schemas.

## Consequences
- MVP ships faster with no cross-module risk.
- OpenCode model selection remains the single source of truth.
- When AI Types integration is added later, it can be done without refactoring
  the core job orchestrator.
