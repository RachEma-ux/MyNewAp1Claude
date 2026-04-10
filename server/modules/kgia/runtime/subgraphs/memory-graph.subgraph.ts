/**
 * KGIA Subgraph: Memory Graph
 *
 * Composes: updateTaskMemory (post-answer)
 * Used to persist run findings into session-scoped task memory,
 * enabling multi-turn reasoning and contradiction detection.
 */

import type { RuntimeState } from "../../domain/types";
import { updateTaskMemoryNode } from "../nodes/update-task-memory";

export async function runMemoryGraphSubgraph(
  state: RuntimeState
): Promise<RuntimeState> {
  return updateTaskMemoryNode(state);
}
