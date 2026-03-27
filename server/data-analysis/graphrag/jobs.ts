/**
 * GraphRAG Job Orchestration
 *
 * Manages the lifecycle of sync, index, and query jobs.
 * Enforces concurrency limits, timeouts, and module isolation.
 */

import { getDb } from "../../db/connection";
import { eq, and, desc } from "drizzle-orm";
import {
  graphragSources,
  graphragSyncRuns,
  graphragIndexRuns,
  graphragQueryRuns,
} from "../../../drizzle/schema";
import { getSourceAdapter } from "./source-registry";
import { submitIndexJob, submitQueryJob, generateSettingsYaml } from "./worker-client";
import {
  DEFAULT_COST_CONTROLS,
  DEFAULT_WORKER_SETTINGS,
  type GraphRagQueryMethod,
  type RunStatus,
} from "./types";

// Active job tracking for concurrency control
const activeJobs = new Map<string, number>(); // moduleSlug → count

function getActiveCount(moduleSlug: string): number {
  return activeJobs.get(moduleSlug) ?? 0;
}

function incrementActive(moduleSlug: string): void {
  activeJobs.set(moduleSlug, getActiveCount(moduleSlug) + 1);
}

function decrementActive(moduleSlug: string): void {
  const count = getActiveCount(moduleSlug);
  if (count > 0) activeJobs.set(moduleSlug, count - 1);
}

/**
 * Run a sync job: export documents from a module adapter into a snapshot.
 */
export async function runSyncJob(sourceId: number): Promise<{
  syncRunId: number;
  status: RunStatus;
  documentCount: number;
  error?: string;
}> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  // Fetch source
  const [source] = await db
    .select()
    .from(graphragSources)
    .where(eq(graphragSources.id, sourceId))
    .limit(1);

  if (!source) throw new Error(`Source not found: ${sourceId}`);

  // Get adapter
  const adapter = getSourceAdapter(source.moduleSlug, source.datasetKey);
  if (!adapter) {
    throw new Error(
      `No adapter registered for ${source.moduleSlug}:${source.datasetKey}`
    );
  }

  // Check concurrency
  if (getActiveCount(source.moduleSlug) >= DEFAULT_COST_CONTROLS.maxConcurrentJobs) {
    throw new Error(
      `Concurrency limit reached for module "${source.moduleSlug}". ` +
        `Max ${DEFAULT_COST_CONTROLS.maxConcurrentJobs} concurrent jobs.`
    );
  }

  // Create sync run record
  const [syncRun] = await db
    .insert(graphragSyncRuns)
    .values({
      sourceId: source.id,
      moduleSlug: source.moduleSlug,
      datasetKey: source.datasetKey,
      status: "running",
      startedAt: new Date(),
    })
    .returning();

  incrementActive(source.moduleSlug);

  try {
    // Export documents from adapter
    const docs = await adapter.exportDocuments({
      sinceCursor: source.lastSyncCursor ?? undefined,
      limit: DEFAULT_COST_CONTROLS.maxDocumentsPerSync,
    });

    // Build snapshot path
    const snapshotPath = `graphrag/${source.moduleSlug}/${source.datasetKey}/snapshots/${syncRun.id}`;

    // Update sync run with results
    const lastDocId = docs.length > 0 ? docs[docs.length - 1].id : undefined;

    await db
      .update(graphragSyncRuns)
      .set({
        status: "completed",
        documentCount: docs.length,
        snapshotPath,
        syncCursor: lastDocId,
        completedAt: new Date(),
      })
      .where(eq(graphragSyncRuns.id, syncRun.id));

    // Update source cursor
    if (lastDocId) {
      await db
        .update(graphragSources)
        .set({
          lastSyncCursor: lastDocId,
          lastSyncAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(graphragSources.id, source.id));
    }

    decrementActive(source.moduleSlug);

    return {
      syncRunId: syncRun.id,
      status: "completed",
      documentCount: docs.length,
    };
  } catch (err: any) {
    decrementActive(source.moduleSlug);

    await db
      .update(graphragSyncRuns)
      .set({
        status: "failed",
        errorMessage: err.message,
        completedAt: new Date(),
      })
      .where(eq(graphragSyncRuns.id, syncRun.id));

    return {
      syncRunId: syncRun.id,
      status: "failed",
      documentCount: 0,
      error: err.message,
    };
  }
}

/**
 * Run an index job: send snapshot to GraphRAG worker for indexing.
 */
export async function runIndexJob(
  sourceId: number,
  syncRunId?: number
): Promise<{
  indexRunId: number;
  status: RunStatus;
  error?: string;
}> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [source] = await db
    .select()
    .from(graphragSources)
    .where(eq(graphragSources.id, sourceId))
    .limit(1);

  if (!source) throw new Error(`Source not found: ${sourceId}`);

  // Check concurrency
  if (getActiveCount(source.moduleSlug) >= DEFAULT_COST_CONTROLS.maxConcurrentJobs) {
    throw new Error(
      `Concurrency limit reached for module "${source.moduleSlug}"`
    );
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runKey = `${source.moduleSlug}:${source.datasetKey}:${timestamp}`;
  const workspacePath = `graphrag/${source.moduleSlug}/${source.datasetKey}`;
  const artifactPath = `graphrag/${source.moduleSlug}/${source.datasetKey}/${runKey}`;

  // Resolve snapshot path from sync run
  let snapshotPath = workspacePath + "/snapshots/latest";
  if (syncRunId) {
    const [syncRun] = await db
      .select()
      .from(graphragSyncRuns)
      .where(eq(graphragSyncRuns.id, syncRunId))
      .limit(1);
    if (syncRun?.snapshotPath) {
      snapshotPath = syncRun.snapshotPath;
    }
  }

  const [indexRun] = await db
    .insert(graphragIndexRuns)
    .values({
      sourceId: source.id,
      syncRunId: syncRunId ?? null,
      moduleSlug: source.moduleSlug,
      datasetKey: source.datasetKey,
      runKey,
      status: "running",
      workspacePath,
      artifactPath,
      startedAt: new Date(),
    })
    .returning();

  incrementActive(source.moduleSlug);

  try {
    const result = await submitIndexJob({
      jobType: "index",
      moduleSlug: source.moduleSlug,
      datasetKey: source.datasetKey,
      runKey,
      snapshotPath,
      workspacePath,
      settings: DEFAULT_WORKER_SETTINGS,
    });

    const finalStatus: RunStatus = result.success ? "completed" : "failed";

    await db
      .update(graphragIndexRuns)
      .set({
        status: finalStatus,
        entityCount: result.entityCount,
        relationshipCount: result.relationshipCount,
        communityCount: result.communityCount,
        tokenUsage: result.tokenUsage,
        artifactPath: result.artifactPath || artifactPath,
        errorMessage: result.error,
        completedAt: new Date(),
      })
      .where(eq(graphragIndexRuns.id, indexRun.id));

    decrementActive(source.moduleSlug);

    return {
      indexRunId: indexRun.id,
      status: finalStatus,
      error: result.error,
    };
  } catch (err: any) {
    decrementActive(source.moduleSlug);

    await db
      .update(graphragIndexRuns)
      .set({
        status: "failed",
        errorMessage: err.message,
        completedAt: new Date(),
      })
      .where(eq(graphragIndexRuns.id, indexRun.id));

    return {
      indexRunId: indexRun.id,
      status: "failed",
      error: err.message,
    };
  }
}

/**
 * Run a query against a module's GraphRAG index.
 */
export async function runQueryJob(args: {
  sourceId: number;
  method: GraphRagQueryMethod;
  question: string;
  indexRunId?: number;
}): Promise<{
  queryRunId: number;
  answer: string;
  status: RunStatus;
  error?: string;
}> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [source] = await db
    .select()
    .from(graphragSources)
    .where(eq(graphragSources.id, args.sourceId))
    .limit(1);

  if (!source) throw new Error(`Source not found: ${args.sourceId}`);

  const workspacePath = `graphrag/${source.moduleSlug}/${source.datasetKey}`;

  const [queryRun] = await db
    .insert(graphragQueryRuns)
    .values({
      sourceId: source.id,
      indexRunId: args.indexRunId ?? null,
      moduleSlug: source.moduleSlug,
      datasetKey: source.datasetKey,
      method: args.method,
      question: args.question,
      status: "running",
    })
    .returning();

  const startTime = Date.now();

  try {
    const result = await submitQueryJob({
      jobType: "query",
      moduleSlug: source.moduleSlug,
      datasetKey: source.datasetKey,
      method: args.method,
      question: args.question,
      workspacePath,
    });

    const latencyMs = Date.now() - startTime;
    const finalStatus: RunStatus = result.success ? "completed" : "failed";

    await db
      .update(graphragQueryRuns)
      .set({
        status: finalStatus,
        answer: result.answer,
        context: result.context,
        tokenUsage: result.tokenUsage,
        latencyMs,
        errorMessage: result.error,
      })
      .where(eq(graphragQueryRuns.id, queryRun.id));

    return {
      queryRunId: queryRun.id,
      answer: result.answer || "",
      status: finalStatus,
      error: result.error,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;

    await db
      .update(graphragQueryRuns)
      .set({
        status: "failed",
        latencyMs,
        errorMessage: err.message,
      })
      .where(eq(graphragQueryRuns.id, queryRun.id));

    return {
      queryRunId: queryRun.id,
      answer: "",
      status: "failed",
      error: err.message,
    };
  }
}
