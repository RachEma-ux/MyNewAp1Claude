/**
 * Native Graph Workspace — projection-intent drain orchestrator.
 *
 * Phase 14 §6/§7 capstone. Ties together the head translator (#466)
 * and the per-edge expanders (#467/#468/#469/#470) into the single
 * surface a Phase 7.5 Neo4j worker calls:
 *
 *   const writes = await buildProjectionWritesForEvent(event)
 *   await repository.applyProjectionJob(writes)
 *
 * Composition by `eventKind`:
 *
 *   runtime_trace:
 *     - translateRuntimeTraceIntent(event)                      // (:RuntimeTrace)
 *     - expandRuntimeSkillPackEdges(runId, loadSkillPackUsages) // USED_GRAPH_SKILL
 *     - expandRuntimeNoteVersionEdges(runId, loadNoteRefs)      // REFERENCES_NOTE_VERSION
 *     - expandRuntimeCagBlockEdges(runId, loadCagBlockUsages)   // USED_CAG_BLOCK
 *
 *   decision_trace:
 *     - translateDecisionTraceIntent(event)                     // (:DecisionTrace) + HAS_DECISION_TRACE
 *     - expandDecisionTraceSteps(graphAgentRunId, loadSteps)    // (:DecisionTraceStep) + HAS_STEP
 *
 * The drain runs the head translator synchronously (pure) and the
 * expanders concurrently (each reads a different table). Any expander
 * read failure throws; the worker catches and calls `markEventFailed`.
 * On the happy path, the worker calls `markEventApplied(id, neo4jRefs)`
 * after `applyProjectionJob` resolves cleanly.
 *
 * Test seam: each loader is injectable via `options.loaders` so the
 * orchestrator can be unit-tested without DB. Default loaders use the
 * `loadXForRun()` functions that already shipped in PRs #467-#470.
 *
 * ADR: docs/architecture/agent-studio-graph-projection-sync.md
 */

import {
  expandDecisionTraceSteps,
  loadDecisionTraceStepsForRun,
  type DecisionTraceStepRow,
} from "./projection-step-expander.js";
import {
  expandRuntimeSkillPackEdges,
  loadRuntimeSkillPackUsagesForRun,
  type RuntimeSkillPackUsageRow,
} from "./projection-skill-pack-expander.js";
import {
  expandRuntimeNoteVersionEdges,
  loadRuntimeNoteReferencesForRun,
  type RuntimeNoteReferenceRow,
} from "./projection-note-version-expander.js";
import {
  expandRuntimeCagBlockEdges,
  loadRuntimeCagBlockUsagesForRun,
  type RuntimeCagBlockUsageRow,
} from "./projection-cag-block-expander.js";
import { translateRuntimeGraphEvent } from "./projection-event-translator.js";
import type { RuntimeGraphEvent } from "./projection-events.js";
import type { ProjectionWrite } from "../graph/repository/types.js";

export interface ProjectionDrainLoaders {
  readonly loadDecisionTraceSteps?: (
    graphAgentRunId: number,
  ) => Promise<readonly DecisionTraceStepRow[]>;
  readonly loadSkillPackUsages?: (
    runtimeRunId: number,
  ) => Promise<readonly RuntimeSkillPackUsageRow[]>;
  readonly loadNoteReferences?: (
    runtimeRunId: number,
  ) => Promise<readonly RuntimeNoteReferenceRow[]>;
  readonly loadCagBlockUsages?: (
    runtimeRunId: number,
  ) => Promise<readonly RuntimeCagBlockUsageRow[]>;
}

export interface BuildProjectionWritesOptions {
  readonly loaders?: ProjectionDrainLoaders;
}

/**
 * Composes the full `ProjectionWrite[]` for a single intent row. The
 * Phase 7.5 worker calls this then passes the result to
 * `repository.applyProjectionJob`. Expander reads run concurrently; the
 * head translator is pure and runs first to fail-fast on shape errors.
 */
export async function buildProjectionWritesForEvent(
  event: RuntimeGraphEvent,
  options: BuildProjectionWritesOptions = {},
): Promise<ProjectionWrite[]> {
  const loaders = options.loaders ?? {};
  const loadSteps =
    loaders.loadDecisionTraceSteps ??
    ((id: number) => loadDecisionTraceStepsForRun(id));
  const loadSkillPacks =
    loaders.loadSkillPackUsages ??
    ((id: number) => loadRuntimeSkillPackUsagesForRun(id));
  const loadNoteRefs =
    loaders.loadNoteReferences ??
    ((id: number) => loadRuntimeNoteReferencesForRun(id));
  const loadCagBlocks =
    loaders.loadCagBlockUsages ??
    ((id: number) => loadRuntimeCagBlockUsagesForRun(id));

  const headWrites = translateRuntimeGraphEvent(event);

  if (event.eventKind === "runtime_trace") {
    const [skillPacks, noteRefs, cagBlocks] = await Promise.all([
      loadSkillPacks(event.runtimeRunId),
      loadNoteRefs(event.runtimeRunId),
      loadCagBlocks(event.runtimeRunId),
    ]);
    return [
      ...headWrites,
      ...expandRuntimeSkillPackEdges(event.runtimeRunId, skillPacks),
      ...expandRuntimeNoteVersionEdges(event.runtimeRunId, noteRefs),
      ...expandRuntimeCagBlockEdges(event.runtimeRunId, cagBlocks),
    ];
  }

  // decision_trace — translator already validated graphAgentRunId is set.
  const steps = await loadSteps(event.graphAgentRunId!);
  return [
    ...headWrites,
    ...expandDecisionTraceSteps(event.graphAgentRunId!, steps),
  ];
}
