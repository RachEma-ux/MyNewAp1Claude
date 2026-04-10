/**
 * KGIA Runtime — Orchestrator
 *
 * Executes a full KGIA run: intent classification → schema loading →
 * mode selection → query planning → safety gate → execution →
 * path expansion → evidence assembly → answer synthesis.
 *
 * All query execution is gated by governance/safety (non-bypassable).
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../../../db/connection";
import {
  kgiaSources,
  kgiaSessions,
  kgiaRuns,
  kgiaQueryPlans,
  kgiaQueryExecutions,
  kgiaAnswers,
  kgiaEvidenceNodes,
  kgiaEvidenceEdges,
} from "../schema";

import type {
  RuntimeState,
  GraphSource,
  KgiaMode,
  AnswerEnvelope,
  EvidenceGraph,
  PathCandidate,
  ProvenanceRef,
  TemporalClaim,
  SafetyVerdict,
} from "../domain/types";

import { classifyIntent, buildQueryPlan, extractRelevantSchemaSlice } from "../domain/query-planner";
import { expandPaths, rankPaths, prunePaths, assembleEvidenceFromPaths } from "../domain/path-reasoning";
import {
  assembleEvidenceFromResults,
  mergeEvidenceGraphs,
  incorporatePathEvidence,
  extractTemporalClaims,
  extractObservedFacts,
  identifyMissingKnowledge,
} from "../domain/evidence-assembler";
import { synthesizeAnswerEnvelope } from "../domain/answer-synthesizer";
import { gateQueryExecution, logAuditBundle } from "../governance/safety";
import { executeNeo4jQuery, readNeo4jSchema } from "../infrastructure/neo4j-adapter";
import { executeSparqlQuery, readSparqlSchema } from "../infrastructure/sparql-adapter";

// ── Create Session ──────────────────────────────────────────────

export async function createSession(params: {
  workspaceId: number;
  userId?: number;
  title?: string;
  config?: Record<string, unknown>;
}): Promise<number | null> {
  const db = getDb();
  if (!db) return null;

  const [row] = await db
    .insert(kgiaSessions)
    .values({
      workspaceId: params.workspaceId,
      userId: params.userId ?? null,
      title: params.title ?? "New KGIA Session",
      config: params.config ?? null,
    })
    .returning({ id: kgiaSessions.id });

  return row?.id ?? null;
}

// ── Execute Run ─────────────────────────────────────────────────

export async function executeRun(params: {
  workspaceId: number;
  sessionId: number;
  question: string;
  sourceIds?: number[];
  mode?: KgiaMode;
  actorId?: number;
}): Promise<{ runId: number; envelope: AnswerEnvelope } | { runId: number; error: string }> {
  const db = getDb();
  if (!db) return { runId: 0, error: "Database unavailable" };

  const startTime = Date.now();

  // 1. Create run record
  const [run] = await db
    .insert(kgiaRuns)
    .values({
      workspaceId: params.workspaceId,
      sessionId: params.sessionId,
      question: params.question,
      mode: params.mode ?? null,
      status: "running",
      startedAt: new Date(),
    })
    .returning({ id: kgiaRuns.id });

  const runId = run.id;

  try {
    // 2. Load sources
    const sources = await loadSources(db, params.workspaceId, params.sourceIds);
    if (sources.length === 0) {
      return await failRun(db, runId, "No active graph sources found for this workspace");
    }

    // 3. Classify intent
    const intent = classifyIntent(params.question);

    // 4. Choose mode
    const selectedMode: KgiaMode = params.mode ?? chooseMode(intent, sources);

    // 5. For each source: plan → gate → execute → collect evidence
    const allEvidence: EvidenceGraph[] = [];
    const allProvenance: ProvenanceRef[] = [];
    const allPaths: PathCandidate[] = [];
    const allErrors: string[] = [];

    for (const source of sources) {
      const result = await executeSourceQuery({
        db,
        workspaceId: params.workspaceId,
        sessionId: params.sessionId,
        runId,
        question: params.question,
        source,
        intent,
        actorId: params.actorId,
      });

      if (result.evidence) allEvidence.push(result.evidence);
      if (result.provenance) allProvenance.push(...result.provenance);
      if (result.paths) allPaths.push(...result.paths);
      if (result.error) allErrors.push(result.error);
    }

    // 6. Merge evidence, rank paths
    const mergedEvidence = allEvidence.length > 0
      ? mergeEvidenceGraphs(...allEvidence)
      : { nodes: [], edges: [] };

    const rankedPaths = prunePaths(rankPaths(allPaths));
    const finalEvidence = incorporatePathEvidence(mergedEvidence, rankedPaths);

    // 7. Extract temporal claims
    const temporalClaims = sources.length > 0
      ? extractTemporalClaims(finalEvidence, sources[0])
      : [];

    // 8. Build safety verdict summary
    const safetyVerdict: SafetyVerdict = {
      safe: allErrors.length === 0,
      readOnly: true,
      violations: allErrors,
      blockedPatterns: [],
      reviewRequired: false,
    };

    // 9. Synthesize answer envelope
    const envelope = synthesizeAnswerEnvelope({
      question: params.question,
      selectedMode,
      evidenceGraph: finalEvidence,
      pathCandidates: rankedPaths,
      provenanceRefs: allProvenance,
      temporalClaims,
      safetyVerdict,
      queryErrors: allErrors,
    });

    // 10. Persist answer
    const durationMs = Date.now() - startTime;
    await persistRunResult(db, runId, params.workspaceId, envelope, durationMs);

    // 11. Persist evidence nodes/edges
    await persistEvidence(db, params.workspaceId, runId, finalEvidence);

    // 12. Audit log
    await logAuditBundle({
      workspaceId: params.workspaceId,
      sessionId: params.sessionId,
      runId,
      question: params.question,
      selectedMode,
      resultCount: finalEvidence.nodes.length,
      durationMs,
      verdict: safetyVerdict,
      actorId: params.actorId,
    });

    return { runId, envelope };
  } catch (err) {
    const errorMsg = (err as Error).message;
    return await failRun(db, runId, errorMsg);
  }
}

// ── Internal: Execute query against a single source ─────────────

async function executeSourceQuery(params: {
  db: NonNullable<ReturnType<typeof getDb>>;
  workspaceId: number;
  sessionId: number;
  runId: number;
  question: string;
  source: GraphSource;
  intent: string;
  actorId?: number;
}): Promise<{
  evidence?: EvidenceGraph;
  provenance?: ProvenanceRef[];
  paths?: PathCandidate[];
  error?: string;
}> {
  const { db, workspaceId, sessionId, runId, question, source, actorId } = params;

  // Load schema
  const isSparql = source.type === "sparql" || source.type === "neptune_sparql";
  const schema = isSparql
    ? await readSparqlSchema(source)
    : await readNeo4jSchema(source);

  // Build query plan
  const plan = buildQueryPlan(question, source, schema);

  // Persist plan
  const [planRow] = await db
    .insert(kgiaQueryPlans)
    .values({
      workspaceId,
      runId,
      intent: plan.intent,
      schemaSlice: plan.schemaSlice as any,
      queryLanguage: plan.queryLanguage,
      queryText: plan.queryText,
      validated: plan.validated,
      validationErrors: plan.validationErrors,
      repairAttempts: plan.repairAttempts,
    })
    .returning({ id: kgiaQueryPlans.id });

  // Safety gate — non-bypassable
  const verdict = await gateQueryExecution({
    workspaceId,
    runId,
    sessionId,
    queryText: plan.queryText,
    source,
    actorId,
  });

  if (!verdict.safe) {
    // Persist failed execution
    await db.insert(kgiaQueryExecutions).values({
      workspaceId,
      runId,
      planId: planRow.id,
      sourceId: source.id,
      queryText: plan.queryText,
      status: "blocked",
      errorMessage: verdict.violations.join("; "),
    });
    return { error: `Source "${source.name}" blocked: ${verdict.violations.join("; ")}` };
  }

  // Execute query
  const execStart = Date.now();
  let records: Record<string, unknown>[] = [];

  try {
    if (isSparql) {
      const result = await executeSparqlQuery(source, plan.queryText);
      records = result.bindings;
    } else {
      const result = await executeNeo4jQuery(source, plan.queryText);
      records = result.records;
    }
  } catch (err) {
    const errMsg = (err as Error).message;
    await db.insert(kgiaQueryExecutions).values({
      workspaceId,
      runId,
      planId: planRow.id,
      sourceId: source.id,
      queryText: plan.queryText,
      status: "error",
      durationMs: Date.now() - execStart,
      errorMessage: errMsg,
    });
    return { error: `Source "${source.name}" error: ${errMsg}` };
  }

  // Persist execution
  await db.insert(kgiaQueryExecutions).values({
    workspaceId,
    runId,
    planId: planRow.id,
    sourceId: source.id,
    queryText: plan.queryText,
    resultCount: records.length,
    resultData: { records: records.slice(0, 100) } as any,
    durationMs: Date.now() - execStart,
    status: "completed",
  });

  // Assemble evidence
  const { graph, provenance } = assembleEvidenceFromResults(records, source, plan.queryText);

  // Expand paths
  const paths = expandPaths(records, source);

  return { evidence: graph, provenance, paths };
}

// ── Internal: Load sources ──────────────────────────────────────

async function loadSources(
  db: NonNullable<ReturnType<typeof getDb>>,
  workspaceId: number,
  sourceIds?: number[]
): Promise<GraphSource[]> {
  let rows;
  if (sourceIds && sourceIds.length > 0) {
    rows = await db
      .select()
      .from(kgiaSources)
      .where(and(eq(kgiaSources.workspaceId, workspaceId), eq(kgiaSources.status, "active")));
    rows = rows.filter((r) => sourceIds.includes(r.id));
  } else {
    rows = await db
      .select()
      .from(kgiaSources)
      .where(and(eq(kgiaSources.workspaceId, workspaceId), eq(kgiaSources.status, "active")));
  }

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type as GraphSource["type"],
    endpoint: r.endpoint,
    allowlisted: r.allowlisted,
    maxHops: r.maxHops,
    maxRows: r.maxRows,
    readOnly: r.readOnly,
  }));
}

// ── Internal: Choose mode ───────────────────────────────────────

function chooseMode(intent: string, sources: GraphSource[]): KgiaMode {
  if (sources.length === 0) return "memory";
  if (intent === "path_traversal" || intent === "relationship_query") return "hybrid";
  return "direct_query";
}

// ── Internal: Fail run ──────────────────────────────────────────

async function failRun(
  db: NonNullable<ReturnType<typeof getDb>>,
  runId: number,
  errorMessage: string
): Promise<{ runId: number; error: string }> {
  await db
    .update(kgiaRuns)
    .set({ status: "error", errorMessage, completedAt: new Date() })
    .where(eq(kgiaRuns.id, runId));
  return { runId, error: errorMessage };
}

// ── Internal: Persist run result ────────────────────────────────

async function persistRunResult(
  db: NonNullable<ReturnType<typeof getDb>>,
  runId: number,
  workspaceId: number,
  envelope: AnswerEnvelope,
  durationMs: number
): Promise<void> {
  await db
    .update(kgiaRuns)
    .set({
      status: "completed",
      answer: envelope.answer,
      confidence: envelope.confidence.overall,
      selectedMode: envelope.selectedMode,
      governanceVerdict: envelope.governanceVerdict.safe ? "allow" : "deny",
      envelope: envelope as any,
      durationMs,
      completedAt: new Date(),
    })
    .where(eq(kgiaRuns.id, runId));

  // Also persist to kgiaAnswers
  await db.insert(kgiaAnswers).values({
    workspaceId,
    runId,
    answer: envelope.answer,
    confidence: envelope.confidence.overall,
    selectedMode: envelope.selectedMode,
    observedFacts: envelope.observedFacts,
    inferredClaims: envelope.inferredClaims,
    provenanceRefs: envelope.provenanceRefs as any,
    temporalValidity: envelope.temporalValidity as any,
    missingKnowledge: envelope.missingKnowledge,
    governanceVerdict: envelope.governanceVerdict as any,
  });
}

// ── Internal: Persist evidence graph ────────────────────────────

async function persistEvidence(
  db: NonNullable<ReturnType<typeof getDb>>,
  workspaceId: number,
  runId: number,
  graph: EvidenceGraph
): Promise<void> {
  if (graph.nodes.length === 0) return;

  // Persist nodes (limit to 200 to avoid huge inserts)
  const nodeIdMap = new Map<string, number>();
  for (const node of graph.nodes.slice(0, 200)) {
    const [row] = await db
      .insert(kgiaEvidenceNodes)
      .values({
        workspaceId,
        runId,
        nodeType: node.nodeType,
        label: node.label.slice(0, 500),
        properties: node.properties as any,
        sourceRef: node.sourceRef ?? null,
        confidence: node.confidence,
      })
      .returning({ id: kgiaEvidenceNodes.id });
    if (row) nodeIdMap.set(node.id, row.id);
  }

  // Persist edges
  for (const edge of graph.edges.slice(0, 500)) {
    const fromId = nodeIdMap.get(edge.fromNodeId);
    const toId = nodeIdMap.get(edge.toNodeId);
    if (fromId && toId) {
      await db.insert(kgiaEvidenceEdges).values({
        workspaceId,
        runId,
        fromNodeId: fromId,
        toNodeId: toId,
        relationshipType: edge.relationshipType,
        properties: edge.properties as any,
        confidence: edge.confidence,
      });
    }
  }
}
