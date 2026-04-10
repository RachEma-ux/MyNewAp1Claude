/**
 * KGIA Runtime Node — Update Task Memory
 *
 * Persists run findings into the session's task memory graph.
 */

import type { RuntimeState } from "../../domain/types";
import { updateTaskMemory, getSessionMemory } from "../../services/memory-manager";
import { advanceNode } from "../state";

export async function updateTaskMemoryNode(
  state: RuntimeState
): Promise<RuntimeState> {
  if (!state.envelope) {
    return advanceNode(state, "updateTaskMemory");
  }

  await updateTaskMemory(state.sessionId, state.workspaceId, state.envelope);
  const memoryGraph = await getSessionMemory(state.sessionId);

  return advanceNode(
    { ...state, memoryGraph },
    "updateTaskMemory"
  );
}
