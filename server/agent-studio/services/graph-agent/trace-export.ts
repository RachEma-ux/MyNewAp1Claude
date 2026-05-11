/**
 * Graph Agent Lite — decision-trace Markdown export.
 *
 * Phase 14 §1. Generates a Markdown blob from a decision-trace
 * ledger row (the same one §3 surfaces via
 * `agentStudio.graphAgent.explain`) so operators can drop a run's
 * "Why This Answer?" report into a vault note, share it in an
 * investigation thread, or attach it to a postmortem.
 *
 * The function is read-only — it does NOT write to `ags_vault_notes`.
 * Persisting the export as a vault note is a separate step the
 * caller can take with the Markdown blob this function returns.
 *
 * Failure modes match the §3 explain reader:
 *   - ASDB unavailable → returns `null`.
 *   - Unknown runtimeRunId → returns `null`.
 *
 * The caller (tRPC procedure) maps `null` to a 404-shaped response.
 *
 * ADR: docs/architecture/agent-studio-graph-agent-runtime.md §1.5
 */

import {
  getExplanationForRun,
  type GetExplanationOptions,
  type GraphAgentExplanation,
  type GraphAgentExplanationStep,
} from "./explain-reader.js";
import { redactExplanationSteps } from "./redaction.js";
import {
  getGraphSkillSourceNoteRefsForRun,
  type GraphSkillSourceNoteRef,
} from "./graph-skill-source-note-refs-reader.js";

export interface DecisionTraceMarkdown {
  readonly runtimeRunId: number;
  readonly graphAgentRunId: number;
  readonly markdown: string;
}

export interface ExportDecisionTraceOptions extends GetExplanationOptions {
  /** Heading prefix; defaults to "Graph Agent Run". */
  readonly title?: string;
  /**
   * Phase 14 §4 — apply sensitive-payload redaction to step
   * inputs/outputs before rendering. Defaults to `true` because the
   * primary consumer (vault-note exports) leaves the trace in
   * operator-readable form for sharing. Callers that need raw
   * payloads (deep debugging) can set this to `false`.
   */
  readonly redact?: boolean;
  /**
   * Phase 14 §6 — read Graph Skill source-note refs for the trace
   * (via `ags_graph_skill_runtime_usages` → pack versions →
   * `sourceNoteVersionId` → vault note). Defaults to `true`; the
   * resolver is injectable for unit tests.
   */
  readonly includeGraphSkillRefs?: boolean;
  readonly getGraphSkillRefs?: (
    runtimeRunId: number,
  ) => Promise<GraphSkillSourceNoteRef[]>;
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toISOString();
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function renderStep(step: GraphAgentExplanationStep): string {
  const lines: string[] = [
    `### Step ${step.stepIndex} · \`${step.stepKind}\``,
    "",
    `- **Duration:** ${formatDuration(step.durationMs)}`,
    `- **Recorded:** ${formatDate(step.createdAt)}`,
  ];

  if (step.stepInput && Object.keys(step.stepInput).length > 0) {
    lines.push("", "**Input:**", "", "```json");
    lines.push(JSON.stringify(step.stepInput, null, 2));
    lines.push("```");
  }
  if (step.stepOutput && Object.keys(step.stepOutput).length > 0) {
    lines.push("", "**Output:**", "", "```json");
    lines.push(JSON.stringify(step.stepOutput, null, 2));
    lines.push("```");
  }
  return lines.join("\n");
}

function renderGraphSkillRefs(refs: GraphSkillSourceNoteRef[]): string[] {
  if (refs.length === 0) return [];
  const lines: string[] = ["## Graph Skill References", ""];
  for (const r of refs) {
    const noteSegment =
      r.sourceNoteId !== null && r.sourceNoteTitle !== null
        ? ` — source note: \`${r.sourceNoteSlug ?? "(no-slug)"}\` "${r.sourceNoteTitle}"${r.sourceNoteVersion !== null ? ` v${r.sourceNoteVersion}` : ""}`
        : " — _no source note attached_";
    lines.push(
      `- **${r.packName}** (\`${r.packKey}\` v${r.packVersion}, packVersionId=${r.packVersionId})${noteSegment}`,
    );
  }
  return lines;
}

function renderMarkdown(
  explanation: GraphAgentExplanation,
  titlePrefix: string,
  graphSkillRefs: GraphSkillSourceNoteRef[],
): string {
  const sections: string[] = [
    `# ${titlePrefix} #${explanation.runtimeRunId}`,
    "",
    `> **Query:** ${explanation.userQuery}`,
    "",
    `- **Agent:** \`${explanation.agentKey}\``,
    `- **Status:** \`${explanation.status}\``,
    `- **Graph Agent run id:** ${explanation.graphAgentRunId}`,
    `- **Started:** ${formatDate(explanation.startedAt)}`,
    `- **Completed:** ${formatDate(explanation.completedAt)}`,
    `- **Total duration:** ${formatDuration(explanation.durationMs)}`,
    `- **Steps:** ${explanation.steps.length}`,
  ];

  if (explanation.errorMessage) {
    sections.push("", `> ⚠️ **Error:** ${explanation.errorMessage}`);
  }

  const skillRefLines = renderGraphSkillRefs(graphSkillRefs);
  if (skillRefLines.length > 0) {
    sections.push("", ...skillRefLines);
  }

  sections.push("", "## Decision Trace", "");

  if (explanation.steps.length === 0) {
    sections.push("_No steps recorded._");
  } else {
    for (const step of explanation.steps) {
      sections.push(renderStep(step), "");
    }
  }

  // Trailing footer makes it easy to grep exports out of a note vault.
  sections.push(
    "---",
    `_Exported from Native Graph Workspace decision-trace ledger (runtimeRunId=${explanation.runtimeRunId})._`,
  );

  return sections.join("\n");
}

export async function exportDecisionTraceAsMarkdown(
  runtimeRunId: number,
  options: ExportDecisionTraceOptions = {},
): Promise<DecisionTraceMarkdown | null> {
  const explanation = await getExplanationForRun(runtimeRunId, options);
  if (!explanation) return null;

  // Phase 14 §4 — redact-by-default. Operators who want raw
  // payloads (deep debugging) explicitly opt out via redact: false.
  const shouldRedact = options.redact !== false;
  const renderInput: GraphAgentExplanation = shouldRedact
    ? { ...explanation, steps: redactExplanationSteps(explanation.steps) }
    : explanation;

  // Phase 14 §6 — Graph Skill source-note refs. Default on; reader
  // returns [] when ASDB is unavailable or the trace touched no skill
  // packs, so the resulting markdown simply omits the section.
  const includeRefs = options.includeGraphSkillRefs !== false;
  const refResolver =
    options.getGraphSkillRefs ?? getGraphSkillSourceNoteRefsForRun;
  const graphSkillRefs = includeRefs
    ? await refResolver(explanation.runtimeRunId)
    : [];

  return {
    runtimeRunId: explanation.runtimeRunId,
    graphAgentRunId: explanation.graphAgentRunId,
    markdown: renderMarkdown(
      renderInput,
      options.title ?? "Graph Agent Run",
      graphSkillRefs,
    ),
  };
}
