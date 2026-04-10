/**
 * Port: Memory Store — abstract interface for task memory graph persistence.
 * Stores session-scoped reasoning memory (facts, claims, contradictions).
 */
import type { TaskMemoryGraph, MemoryNode, MemoryEdge } from "../types";

export interface MemoryStorePort {
  /** Load the full memory graph for a session */
  getGraph(sessionId: number): Promise<TaskMemoryGraph>;

  /** Add a memory node */
  addNode(sessionId: number, workspaceId: number, node: Omit<MemoryNode, "id">): Promise<string>;

  /** Add a memory edge */
  addEdge(sessionId: number, workspaceId: number, edge: Omit<MemoryEdge, "id">): Promise<string>;

  /** Update node status (active → superseded/rejected) */
  updateNodeStatus(nodeId: string, status: MemoryNode["status"]): Promise<void>;

  /** Prune old memory nodes beyond a limit */
  prune(sessionId: number, maxNodes: number): Promise<number>;
}
