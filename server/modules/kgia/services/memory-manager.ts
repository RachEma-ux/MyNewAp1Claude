/**
 * KGIA — Task Memory Manager
 *
 * Manages session-scoped task memory: observed facts, inferred claims,
 * contradictions, evidence links. Memory is NOT enterprise truth —
 * it's run-local reasoning context that accumulates within a session.
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../../../db/connection";
import {
  kgiaMemoryNodes,
  kgiaMemoryEdges,
} from "../schema";
import type { AnswerEnvelope, TaskMemoryGraph, MemoryNode, MemoryEdge } from "../domain/types";

/**
 * Extract facts and claims from an AnswerEnvelope and persist them
 * as memory nodes in the session's task memory graph.
 */
export async function updateTaskMemory(
  sessionId: number,
  workspaceId: number,
  envelope: AnswerEnvelope
): Promise<void> {
  const db = getDb();
  if (!db) return;

  // Extract observed facts → memory nodes
  for (const fact of envelope.observedFacts ?? []) {
    await db.insert(kgiaMemoryNodes).values({
      workspaceId,
      sessionId,
      nodeType: "observed_fact",
      label: typeof fact === "string" ? fact : (fact as any).label ?? String(fact),
      content: typeof fact === "string" ? fact : JSON.stringify(fact),
      status: "active",
      confidence: envelope.confidence?.overall ?? null,
      metadata: { source: "run", mode: envelope.selectedMode },
    });
  }

  // Extract inferred claims → memory nodes
  for (const claim of envelope.inferredClaims ?? []) {
    await db.insert(kgiaMemoryNodes).values({
      workspaceId,
      sessionId,
      nodeType: "inferred_claim",
      label: typeof claim === "string" ? claim : (claim as any).text ?? String(claim),
      content: typeof claim === "string" ? claim : JSON.stringify(claim),
      status: "active",
      confidence: envelope.confidence?.overall ?? null,
      metadata: { source: "inference", mode: envelope.selectedMode },
    });
  }

  // Extract missing knowledge → memory nodes
  if (envelope.missingKnowledge && Array.isArray(envelope.missingKnowledge)) {
    for (const gap of envelope.missingKnowledge) {
      await db.insert(kgiaMemoryNodes).values({
        workspaceId,
        sessionId,
        nodeType: "unresolved_entity",
        label: typeof gap === "string" ? gap : String(gap),
        content: typeof gap === "string" ? gap : JSON.stringify(gap),
        status: "active",
        metadata: { source: "gap_detection" },
      });
    }
  }
}

/**
 * Load the full task memory graph for a session.
 */
export async function getSessionMemory(
  sessionId: number
): Promise<TaskMemoryGraph> {
  const db = getDb();
  if (!db) return { nodes: [], edges: [] };

  const nodes = await db
    .select()
    .from(kgiaMemoryNodes)
    .where(eq(kgiaMemoryNodes.sessionId, sessionId));

  const edges = await db
    .select()
    .from(kgiaMemoryEdges)
    .where(eq(kgiaMemoryEdges.sessionId, sessionId));

  return {
    nodes: nodes.map((n) => ({
      id: String(n.id),
      nodeType: n.nodeType as MemoryNode["nodeType"],
      label: n.label,
      content: n.content ?? undefined,
      status: n.status as MemoryNode["status"],
      confidence: n.confidence ?? undefined,
      evidenceRunId: n.evidenceRunId ?? undefined,
    })),
    edges: edges.map((e) => ({
      id: String(e.id),
      fromNodeId: String(e.fromNodeId),
      toNodeId: String(e.toNodeId),
      relationshipType: e.relationshipType,
    })),
  };
}

/**
 * Detect contradictions between new facts and existing memory.
 * Returns array of contradiction descriptions.
 */
export async function detectContradictions(
  sessionId: number,
  newFacts: string[]
): Promise<string[]> {
  const db = getDb();
  if (!db) return [];

  const existing = await db
    .select()
    .from(kgiaMemoryNodes)
    .where(
      and(
        eq(kgiaMemoryNodes.sessionId, sessionId),
        eq(kgiaMemoryNodes.status, "active")
      )
    );

  const contradictions: string[] = [];

  for (const fact of newFacts) {
    const lower = fact.toLowerCase();
    for (const node of existing) {
      const existingLower = node.label.toLowerCase();
      // Simple negation detection
      if (
        (lower.includes("not ") && existingLower.replace(/\bnot\b/g, "").trim() === lower.replace(/\bnot\b/g, "").trim()) ||
        (existingLower.includes("not ") && lower.replace(/\bnot\b/g, "").trim() === existingLower.replace(/\bnot\b/g, "").trim())
      ) {
        contradictions.push(`Contradiction: "${fact}" vs existing "${node.label}"`);

        // Mark existing as superseded
        await db
          .update(kgiaMemoryNodes)
          .set({ status: "superseded", updatedAt: new Date() })
          .where(eq(kgiaMemoryNodes.id, node.id));
      }
    }
  }

  return contradictions;
}
