/**
 * AI Agent Studio — Subagent Runner
 *
 * Phase 8 of the Agent Studio remaining-phases plan. Lets a parent
 * runtime run invoke an agsDraftSubagents row as a child run. The child
 * run is fully traced just like any normal run; the only difference is
 * its `parentRunId` column points back at the parent.
 *
 * How it's invoked:
 *   - Most common path: openllm-agent2's agent loop emits a Task /
 *     subagent_invoke tool call. Phase 7's MCP work or a future
 *     openllm-agent2 message handler calls into here.
 *   - Manual path: the runs page surfaces a "spawn child" button on
 *     a parent run that lets a human kick off a subagent for testing.
 *
 * Lookup semantics:
 *   - Subagents are scoped to a draft. We resolve `name` against the
 *     parent run's agent's current draft via `repo.listSubagents`.
 *   - Multiple subagents with the same name → return the first match.
 *
 * Recursion safeguard:
 *   - We walk the parentRunId chain back from the current run. If the
 *     depth exceeds MAX_RECURSION_DEPTH, we refuse to spawn — prevents
 *     a subagent loop from blowing up the dev server.
 *
 * Subagent overrides:
 *   - The subagent row's `prompt`, `tools`, `model`, `effort`,
 *     `permissionMode`, etc. don't currently override the live runtime
 *     because Studio doesn't yet have a per-run draft override
 *     mechanism. For Phase 8, the subagent's prompt is prepended to the
 *     parent's input as a "you are now running as <subagent name>"
 *     preamble — works with any provider, no upstream changes needed.
 */

import * as repo from "../repository";
import { runSimulation } from "./simulation";

const MAX_RECURSION_DEPTH = 3;

export interface InvokeSubagentInput {
  /** Parent runtime run id — child's parentRunId will point here */
  parentRunId: number;
  /** Subagent name to look up against the parent's current draft */
  subagentName: string;
  /** Input to pass to the subagent (string) */
  input: string;
  /** User who triggered the invocation (carried into the child run) */
  triggeredBy?: number;
}

export interface InvokeSubagentResult {
  ok: boolean;
  /** New runtime run id created for the child */
  childRunId?: number;
  /** Reason when ok=false */
  error?: string;
}

/**
 * Walk the parentRunId chain to compute how deep this subagent invocation
 * would land. Returns 0 for a top-level run.
 */
async function computeDepth(runId: number): Promise<number> {
  let depth = 0;
  let current: number | null = runId;
  // Cap iterations to MAX_RECURSION_DEPTH * 2 to prevent infinite loops on
  // corrupted data.
  for (let i = 0; i < MAX_RECURSION_DEPTH * 2 + 2; i++) {
    if (current == null) break;
    const row = await repo.getRuntimeRunById(current);
    if (!row) break;
    const parent = (row as any).parentRunId as number | null | undefined;
    if (parent == null) break;
    depth++;
    current = parent;
  }
  return depth;
}

export async function invokeSubagent(
  input: InvokeSubagentInput
): Promise<InvokeSubagentResult> {
  // Resolve the parent run + its agent
  const parentRun = await repo.getRuntimeRunById(input.parentRunId);
  if (!parentRun) {
    return { ok: false, error: `Parent run ${input.parentRunId} not found` };
  }
  const draft = await repo.getCurrentDraft(parentRun.agentId);
  if (!draft) {
    return {
      ok: false,
      error: `Parent run's agent ${parentRun.agentId} has no current draft`,
    };
  }

  // Look up the subagent row by name
  const subagents = await repo.listSubagents(draft.id);
  const subagent = subagents.find((s) => s.name === input.subagentName);
  if (!subagent) {
    return {
      ok: false,
      error: `Subagent "${input.subagentName}" not found on agent ${parentRun.agentId}`,
    };
  }

  // Recursion check
  const currentDepth = await computeDepth(input.parentRunId);
  if (currentDepth >= MAX_RECURSION_DEPTH) {
    return {
      ok: false,
      error: `Subagent recursion limit reached (depth ${currentDepth} >= ${MAX_RECURSION_DEPTH})`,
    };
  }

  // Compose the child input: subagent's prompt as preamble + caller input
  const composedPrompt = [
    `# You are operating as the "${subagent.name}" subagent`,
    subagent.description ? `Description: ${subagent.description}` : null,
    "",
    "## Subagent prompt",
    subagent.prompt,
    "",
    "## Task",
    input.input,
  ]
    .filter(Boolean)
    .join("\n");

  // Run the simulation against the parent's agent (subagents share the
  // parent agent's draft state in this phase). The parentRunId column is
  // stamped on the new runtime run row after the simulation creates it.
  let result;
  try {
    result = await runSimulation({
      agentId: parentRun.agentId,
      inputPayload: {
        prompt: composedPrompt,
        subagentName: subagent.name,
        invokedBy: "subagent_runner",
      },
      triggeredBy: input.triggeredBy,
      toggles: { mockedTools: false },
    });
  } catch (e) {
    return {
      ok: false,
      error: `Subagent run failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // Stamp parentRunId on the child runtime run row
  const childRunId = (result.output as any).runtimeRunId as number | undefined;
  if (typeof childRunId === "number") {
    await repo.updateRuntimeRun(childRunId, {
      parentRunId: input.parentRunId,
    });
  }

  return {
    ok: true,
    childRunId: childRunId ?? result.runId,
  };
}

/**
 * Recursive run tree node. Declared as a named interface so the
 * recursive `children: RunTreeNode[]` reference type-checks (an inline
 * `Awaited<ReturnType<typeof getRunTree>>` self-reference is illegal).
 */
export interface RunTreeNode {
  run: NonNullable<Awaited<ReturnType<typeof repo.getRuntimeRunById>>>;
  children: RunTreeNode[];
}

/**
 * Build a hierarchical run tree starting from a root run. Each entry has
 * its direct children attached. Used by the runs page to render nested
 * subagent invocations under their parent.
 */
export async function getRunTree(runId: number): Promise<RunTreeNode | null> {
  const run = await repo.getRuntimeRunById(runId);
  if (!run) return null;
  const children = await repo.listChildRuntimeRuns(runId);
  const childTrees: RunTreeNode[] = [];
  for (const child of children) {
    const tree = await getRunTree(child.id);
    if (tree) childTrees.push(tree);
  }
  return { run, children: childTrees };
}
