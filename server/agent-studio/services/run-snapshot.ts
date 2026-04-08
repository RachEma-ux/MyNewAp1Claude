/**
 * AI Agent Studio — Run Snapshot / Resume / Compact
 *
 * Phase 11 of the Agent Studio remaining-phases plan. Lets users take a
 * completed runtime run and use it as the starting state for a new run.
 *
 * Two operations:
 *   - resume: take a prior run + new input → new run that "continues
 *     where the old one left off". The prior run's input/output/tools
 *     are serialized as context preamble for the new input.
 *   - compact: take a prior run → new run with the same input but with
 *     a summarized version of the old run's history as context. Useful
 *     when the original conversation grew too long for the model.
 *
 * Why preamble-based instead of WS-level resume:
 *   The Phase 11 plan section noted Decision #6 — investigate whether
 *   openllm-agent2's WS protocol supports `{type:"resume"}`. We don't
 *   have evidence it does; rather than block on upstream investigation,
 *   we ship the preamble fallback now. The preamble is a structured
 *   string injected ahead of the user's new input — completely
 *   provider-agnostic and works with any model.
 *
 * Both operations preserve the lineage chain via the new
 * resumedFromRunId / compactedFromRunId columns on agsRuntimeRuns,
 * so the runs page can render hierarchical "this run came from #N"
 * relationships.
 */

import * as repo from "../repository";
import { runSimulation } from "./simulation";

// ── Snapshot ────────────────────────────────────────────────────────────────

/**
 * Read everything we need to faithfully reconstruct a prior run as
 * preamble. Returns null when the source run doesn't exist.
 */
export async function snapshotRun(runId: number) {
  const run = await repo.getRuntimeRunById(runId);
  if (!run) return null;
  const [steps, toolCalls, memoryEvents, policyEvents] = await Promise.all([
    repo.listRuntimeRunSteps(runId),
    repo.listRuntimeToolCalls(runId),
    repo.listRuntimeMemoryEvents(runId),
    repo.listRuntimePolicyEvents(runId),
  ]);
  return { run, steps, toolCalls, memoryEvents, policyEvents };
}

// ── Preamble builders ──────────────────────────────────────────────────────

const PREAMBLE_MAX_CHARS = 8_000;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…[truncated ${s.length - max} chars]`;
}

/**
 * Build a structured preamble string from a snapshot. Designed to drop
 * straight into a new run's input prompt as context. Includes:
 *   - the original input
 *   - a transcript of tool calls (key + verdict, no payloads)
 *   - the original output text (truncated to PREAMBLE_MAX_CHARS / 2)
 */
export function buildResumePreamble(snapshot: NonNullable<Awaited<ReturnType<typeof snapshotRun>>>): string {
  const { run, toolCalls } = snapshot;
  const lines: string[] = [];
  lines.push(`# Resumed from run #${run.id}`);
  lines.push("");

  // Original input
  const originalInput = run.inputPayload ?? {};
  const promptish =
    typeof (originalInput as any).prompt === "string"
      ? (originalInput as any).prompt
      : typeof (originalInput as any).query === "string"
        ? (originalInput as any).query
        : JSON.stringify(originalInput);
  lines.push("## Original input");
  lines.push(truncate(String(promptish), 1_000));
  lines.push("");

  // Tool calls
  if (toolCalls.length > 0) {
    lines.push("## Prior tool calls");
    for (const tc of toolCalls.slice(0, 30)) {
      lines.push(`- ${tc.toolKey} → ${tc.verdict ?? "?"} (${tc.durationMs ?? 0}ms)`);
    }
    lines.push("");
  }

  // Output text — extract from outputPayload.responsePreview when present
  const out = (run.outputPayload ?? {}) as Record<string, unknown>;
  const responseText =
    typeof out.responsePreview === "string"
      ? out.responsePreview
      : run.summary ?? "";
  if (responseText) {
    lines.push("## Prior response");
    lines.push(truncate(responseText, PREAMBLE_MAX_CHARS / 2));
    lines.push("");
  }

  return truncate(lines.join("\n"), PREAMBLE_MAX_CHARS);
}

/**
 * Build a *compacted* preamble: summary instead of full transcript. The
 * compact form drops the per-tool-call list and keeps only the response
 * + a count. Used by /compact and the compact API.
 */
export function buildCompactPreamble(snapshot: NonNullable<Awaited<ReturnType<typeof snapshotRun>>>): string {
  const { run, toolCalls, steps } = snapshot;
  const lines: string[] = [];
  lines.push(`# Compacted from run #${run.id}`);
  lines.push("");
  lines.push(`Steps: ${steps.length}, Tool calls: ${toolCalls.length}`);
  lines.push("");

  const out = (run.outputPayload ?? {}) as Record<string, unknown>;
  const responseText =
    typeof out.responsePreview === "string"
      ? out.responsePreview
      : run.summary ?? "";
  if (responseText) {
    lines.push("## Summary of prior conversation");
    lines.push(truncate(responseText, 2_000));
  }
  return truncate(lines.join("\n"), PREAMBLE_MAX_CHARS / 2);
}

// ── Resume / Compact entry points ──────────────────────────────────────────

/**
 * Resume a prior run with new input. Creates a fresh runtime run that
 * starts from a preamble built from the source. Returns the new run id.
 *
 * Lineage is recorded by stamping `resumedFromRunId` on the new run row
 * after the simulation completes (we can't pass it through runSimulation
 * directly without changing its signature, so we patch after the fact).
 */
export async function resumeRun(input: {
  sourceRunId: number;
  newInput: string;
  triggeredBy?: number;
}): Promise<{ newRunId: number; sourceRunId: number; preambleChars: number }> {
  const snapshot = await snapshotRun(input.sourceRunId);
  if (!snapshot) {
    throw new Error(`Source run ${input.sourceRunId} not found`);
  }
  const preamble = buildResumePreamble(snapshot);
  const composedPrompt = `${preamble}\n\n# New input\n${input.newInput}`;
  const result = await runSimulation({
    agentId: snapshot.run.agentId,
    inputPayload: { prompt: composedPrompt, resumedFromRunId: input.sourceRunId },
    triggeredBy: input.triggeredBy,
    toggles: { mockedTools: false },
  });
  // Stamp the lineage column on the new runtime run row. The
  // runSimulation result returns the simulation run id; we need the
  // runtime run id, which is in the result's output object.
  const runtimeRunId = (result.output as any).runtimeRunId;
  if (typeof runtimeRunId === "number") {
    await repo.updateRuntimeRun(runtimeRunId, {
      resumedFromRunId: input.sourceRunId,
    });
  }
  return {
    newRunId: typeof runtimeRunId === "number" ? runtimeRunId : result.runId,
    sourceRunId: input.sourceRunId,
    preambleChars: preamble.length,
  };
}

/**
 * Compact a prior run. Creates a fresh runtime run that uses a
 * summarized version of the source as its starting context. The new
 * input is the source's *original* input — compact is for refreshing
 * the conversation, not for changing the question.
 */
export async function compactRun(input: {
  sourceRunId: number;
  triggeredBy?: number;
}): Promise<{ newRunId: number; sourceRunId: number; preambleChars: number }> {
  const snapshot = await snapshotRun(input.sourceRunId);
  if (!snapshot) {
    throw new Error(`Source run ${input.sourceRunId} not found`);
  }
  const preamble = buildCompactPreamble(snapshot);
  // Pull the original prompt from the source's inputPayload
  const sourceInput = snapshot.run.inputPayload ?? {};
  const originalPrompt =
    typeof (sourceInput as any).prompt === "string"
      ? (sourceInput as any).prompt
      : typeof (sourceInput as any).query === "string"
        ? (sourceInput as any).query
        : JSON.stringify(sourceInput);
  const composedPrompt = `${preamble}\n\n# Continuing\n${originalPrompt}`;
  const result = await runSimulation({
    agentId: snapshot.run.agentId,
    inputPayload: {
      prompt: composedPrompt,
      compactedFromRunId: input.sourceRunId,
    },
    triggeredBy: input.triggeredBy,
    toggles: { mockedTools: false },
  });
  const runtimeRunId = (result.output as any).runtimeRunId;
  if (typeof runtimeRunId === "number") {
    await repo.updateRuntimeRun(runtimeRunId, {
      compactedFromRunId: input.sourceRunId,
    });
  }
  return {
    newRunId: typeof runtimeRunId === "number" ? runtimeRunId : result.runId,
    sourceRunId: input.sourceRunId,
    preambleChars: preamble.length,
  };
}
