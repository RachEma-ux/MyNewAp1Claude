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

function renderMarkdown(
  explanation: GraphAgentExplanation,
  titlePrefix: string,
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

  return {
    runtimeRunId: explanation.runtimeRunId,
    graphAgentRunId: explanation.graphAgentRunId,
    markdown: renderMarkdown(renderInput, options.title ?? "Graph Agent Run"),
  };
}
