/**
 * Phase 15 — blessed vault template seeds.
 *
 * Pure data module. Each entry registers as a global (vaultId=null)
 * `ags_vault_templates` row via `seedVaultTemplateRows()`. Operators
 * can shadow any of these with vault-scoped overrides per the §1
 * dedup rule (vault-scoped wins per templateKey).
 *
 * The 11 templates cover the Phase 15 acceptance list ("Basic Note
 * Template, Agent Skill Template, CAG Block Template, Graph Skill
 * Pack Template, Tool Knowledge Template, Workflow Template, Policy
 * Template, Runtime Investigation Template, Evaluation Case Template,
 * Graph Correction Proposal Template, Decision Record Template").
 *
 * Variables follow the §2 `{{name}}` syntax. The seeded markdown
 * passes through `renderTemplate()` with whatever variables the
 * caller supplies — unknown vars are preserved verbatim so partial
 * renders are recoverable.
 *
 * ADR: docs/architecture/agent-studio-markdown-profile.md
 */

export interface VaultTemplateSeed {
  readonly templateKey: string;
  readonly name: string;
  readonly contentMd: string;
  readonly frontmatterDefaults?: Record<string, unknown>;
}

const BASIC_NOTE_MD = `# {{title}}

{{body}}

---
_Created from the Basic Note template._
`;

const AGENT_SKILL_MD = `# Agent Skill: {{name}}

## Purpose
{{purpose}}

## Inputs
- {{inputs}}

## Outputs
- {{outputs}}

## Failure Modes
- {{failureModes}}

## Notes
{{notes}}
`;

const CAG_BLOCK_MD = `# CAG Block: {{name}}

## Role
{{role}}

## Block Body
\`\`\`
{{blockBody}}
\`\`\`

## Risk Class
\`{{riskClass}}\`

## Source Note Reference
- noteId: {{sourceNoteId}}
- noteVersion: {{sourceNoteVersion}}
`;

const GRAPH_SKILL_PACK_MD = `# Graph Skill Pack: {{name}}

## Domain
{{domain}}

## Supported Node Types
- {{supportedNodeTypeKeys}}

## Supported Edge Types
- {{supportedEdgeTypeKeys}}

## Risk Level
\`{{riskLevel}}\` (approval required: {{approvalRequired}})

## Cypher Templates
- {{templateKeys}}

## Source Note
- noteId: {{sourceNoteId}}
- noteVersion: {{sourceNoteVersion}}
`;

const TOOL_KNOWLEDGE_MD = `# Tool Knowledge: {{toolKey}}

## What it does
{{description}}

## When to call
{{whenToCall}}

## Inputs
- {{inputs}}

## Outputs
- {{outputs}}

## Failure modes
- {{failureModes}}

## Risk class
\`{{riskClass}}\`
`;

const WORKFLOW_MD = `# Workflow: {{name}}

## Trigger
{{trigger}}

## Steps
1. {{step1}}
2. {{step2}}
3. {{step3}}

## Owners
- {{owner}}

## Notes
{{notes}}
`;

const POLICY_MD = `# Policy: {{name}}

## Scope
{{scope}}

## Rule
{{rule}}

## Rationale
{{rationale}}

## Enforcement Surface
{{enforcementSurface}}

## Effective Date
{{effectiveDate}}
`;

const RUNTIME_INVESTIGATION_MD = `# Runtime Investigation: {{title}}

## Trigger
- runtimeRunId: {{runtimeRunId}}
- triggeredBy: {{triggeredBy}}
- timestamp: {{timestamp}}

## Symptom
{{symptom}}

## Hypotheses
1. {{hypothesis1}}
2. {{hypothesis2}}

## Findings
{{findings}}

## Action
{{action}}

## Status
{{status}}
`;

const EVALUATION_CASE_MD = `# Evaluation Case: {{caseKey}}

## Question
{{question}}

## Expected Answer
{{expectedAnswer}}

## Expected Paths
{{expectedPaths}}

## Source Notes
- {{sourceNotes}}
`;

const GRAPH_CORRECTION_PROPOSAL_MD = `# Graph Correction Proposal: {{title}}

## Affected Entity
- entityKind: {{entityKind}}
- entityId: {{entityId}}

## Current State
{{currentState}}

## Proposed Change
{{proposedChange}}

## Evidence
{{evidence}}

## Reviewer
{{reviewer}}

## Status
{{status}}
`;

const DECISION_RECORD_MD = `# Decision Record: {{title}}

## Status
{{status}}

## Context
{{context}}

## Decision
{{decision}}

## Consequences
{{consequences}}

## Alternatives Considered
{{alternativesConsidered}}

## Date
{{date}}
`;

export const DEFAULT_VAULT_TEMPLATES: readonly VaultTemplateSeed[] = [
  {
    templateKey: "basic_note",
    name: "Basic Note",
    contentMd: BASIC_NOTE_MD,
    frontmatterDefaults: { kind: "note" },
  },
  {
    templateKey: "agent_skill",
    name: "Agent Skill",
    contentMd: AGENT_SKILL_MD,
    frontmatterDefaults: { kind: "agent_skill" },
  },
  {
    templateKey: "cag_block",
    name: "CAG Block",
    contentMd: CAG_BLOCK_MD,
    frontmatterDefaults: { kind: "cag_block" },
  },
  {
    templateKey: "graph_skill_pack",
    name: "Graph Skill Pack",
    contentMd: GRAPH_SKILL_PACK_MD,
    frontmatterDefaults: { kind: "graph_skill_pack" },
  },
  {
    templateKey: "tool_knowledge",
    name: "Tool Knowledge",
    contentMd: TOOL_KNOWLEDGE_MD,
    frontmatterDefaults: { kind: "tool_knowledge" },
  },
  {
    templateKey: "workflow",
    name: "Workflow",
    contentMd: WORKFLOW_MD,
    frontmatterDefaults: { kind: "workflow" },
  },
  {
    templateKey: "policy",
    name: "Policy",
    contentMd: POLICY_MD,
    frontmatterDefaults: { kind: "policy" },
  },
  {
    templateKey: "runtime_investigation",
    name: "Runtime Investigation",
    contentMd: RUNTIME_INVESTIGATION_MD,
    frontmatterDefaults: { kind: "runtime_investigation" },
  },
  {
    templateKey: "evaluation_case",
    name: "Evaluation Case",
    contentMd: EVALUATION_CASE_MD,
    frontmatterDefaults: { kind: "evaluation_case" },
  },
  {
    templateKey: "graph_correction_proposal",
    name: "Graph Correction Proposal",
    contentMd: GRAPH_CORRECTION_PROPOSAL_MD,
    frontmatterDefaults: { kind: "graph_correction_proposal" },
  },
  {
    templateKey: "decision_record",
    name: "Decision Record",
    contentMd: DECISION_RECORD_MD,
    frontmatterDefaults: { kind: "decision_record" },
  },
];
