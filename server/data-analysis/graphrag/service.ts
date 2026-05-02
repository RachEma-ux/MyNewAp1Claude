/**
 * GraphRAG Service
 *
 * Central service layer for GraphRAG operations.
 * Enforces module isolation, delegates to jobs/worker.
 */

import { getDataAnalysisDb as getDb } from "../connection";
import { eq, and, desc } from "drizzle-orm";
import {
  graphragSources,
  graphragSyncRuns,
  graphragIndexRuns,
  graphragQueryRuns,
  graphragArtifactRegistry,
} from "../../../drizzle/schema";
import {
  registerSourceAdapter,
  getSourceAdapter,
  listSourceAdapters,
  validateModuleScope,
} from "./source-registry";
import { runSyncJob, runIndexJob, runQueryJob } from "./jobs";
import { checkWorkerHealth } from "./worker-client";
import type { GraphRagSourceAdapter, GraphRagQueryMethod } from "./types";
import { publishEvent, makeEnvelope } from "../../platform/events";
import { DATA_ANALYSIS_EVENTS } from "../events";

// ── Source Management ────────────────────────────────────────────────────────

export async function registerSource(adapter: GraphRagSourceAdapter) {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  // Register in-memory adapter
  registerSourceAdapter(adapter);

  // Persist to DB (upsert-like: check existing)
  const existing = await db
    .select()
    .from(graphragSources)
    .where(
      and(
        eq(graphragSources.moduleSlug, adapter.moduleSlug),
        eq(graphragSources.datasetKey, adapter.datasetKey)
      )
    )
    .limit(1);

  if (existing.length === 0) {
    const [created] = await db
      .insert(graphragSources)
      .values({
        moduleSlug: adapter.moduleSlug,
        datasetKey: adapter.datasetKey,
        displayName: adapter.displayName,
        description: adapter.description,
        adapterType: adapter.constructor?.name || "custom",
        enabled: true,
      })
      .returning();
    try {
      await publishEvent(
        makeEnvelope({
          eventType: DATA_ANALYSIS_EVENTS.graphRagSourceRegistered,
          sourceModule: "dataAnalysis",
          payload: {
            sourceId: created.id,
            moduleSlug: created.moduleSlug,
            datasetKey: created.datasetKey,
          },
        }),
      );
    } catch {
      /* event bus failure must not mask the primary write */
    }
    return created;
  }

  return existing[0];
}

export async function listSources() {
  const db = getDb();
  if (!db) return [];
  return db.select().from(graphragSources).orderBy(desc(graphragSources.createdAt));
}

export async function getSource(id: number) {
  const db = getDb();
  if (!db) return null;
  const [source] = await db
    .select()
    .from(graphragSources)
    .where(eq(graphragSources.id, id))
    .limit(1);
  return source ?? null;
}

// ── Sync Operations ──────────────────────────────────────────────────────────

export async function syncSource(sourceId: number) {
  return runSyncJob(sourceId);
}

export async function listSyncRuns(sourceId?: number) {
  const db = getDb();
  if (!db) return [];

  if (sourceId) {
    return db
      .select()
      .from(graphragSyncRuns)
      .where(eq(graphragSyncRuns.sourceId, sourceId))
      .orderBy(desc(graphragSyncRuns.createdAt));
  }

  return db
    .select()
    .from(graphragSyncRuns)
    .orderBy(desc(graphragSyncRuns.createdAt))
    .limit(100);
}

// ── Index Operations ─────────────────────────────────────────────────────────

export async function buildIndex(sourceId: number, syncRunId?: number) {
  return runIndexJob(sourceId, syncRunId);
}

export async function listIndexRuns(sourceId?: number) {
  const db = getDb();
  if (!db) return [];

  if (sourceId) {
    return db
      .select()
      .from(graphragIndexRuns)
      .where(eq(graphragIndexRuns.sourceId, sourceId))
      .orderBy(desc(graphragIndexRuns.createdAt));
  }

  return db
    .select()
    .from(graphragIndexRuns)
    .orderBy(desc(graphragIndexRuns.createdAt))
    .limit(100);
}

export async function getIndexRun(id: number) {
  const db = getDb();
  if (!db) return null;
  const [run] = await db
    .select()
    .from(graphragIndexRuns)
    .where(eq(graphragIndexRuns.id, id))
    .limit(1);
  return run ?? null;
}

// ── Query Operations ─────────────────────────────────────────────────────────

/**
 * Execute a GraphRAG query against a single module's dataset.
 * Enforces module isolation: moduleSlug must match source's module.
 */
export async function query(args: {
  moduleSlug: string;
  datasetKey: string;
  method: GraphRagQueryMethod;
  question: string;
  runId?: number;
}) {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  // Find source
  const [source] = await db
    .select()
    .from(graphragSources)
    .where(
      and(
        eq(graphragSources.moduleSlug, args.moduleSlug),
        eq(graphragSources.datasetKey, args.datasetKey)
      )
    )
    .limit(1);

  if (!source) {
    throw new Error(
      `No GraphRAG source found for ${args.moduleSlug}:${args.datasetKey}`
    );
  }

  // Enforce module isolation
  validateModuleScope(args.moduleSlug, source.moduleSlug);

  return runQueryJob({
    sourceId: source.id,
    method: args.method,
    question: args.question,
    indexRunId: args.runId,
  });
}

export async function listQueryRuns(sourceId?: number) {
  const db = getDb();
  if (!db) return [];

  if (sourceId) {
    return db
      .select()
      .from(graphragQueryRuns)
      .where(eq(graphragQueryRuns.sourceId, sourceId))
      .orderBy(desc(graphragQueryRuns.createdAt));
  }

  return db
    .select()
    .from(graphragQueryRuns)
    .orderBy(desc(graphragQueryRuns.createdAt))
    .limit(100);
}

// ── Graph Data (entities, relationships, communities) ────────────────────────
// These come from indexed artifacts. In a full implementation,
// they would be read from the worker's Parquet/JSON outputs.
// For now, we return placeholder structures indicating worker status.

export async function listEntities(moduleSlug: string, datasetKey: string) {
  // Would read from worker artifacts at:
  // graphrag/{moduleSlug}/{datasetKey}/output/entities.parquet
  return {
    available: false,
    message: "Entity data available after successful index run with active worker",
    entities: [] as Array<{ id: string; name: string; type: string; description: string }>,
  };
}

export async function listRelationships(moduleSlug: string, datasetKey: string) {
  return {
    available: false,
    message: "Relationship data available after successful index run with active worker",
    relationships: [] as Array<{
      id: string;
      source: string;
      target: string;
      type: string;
      weight: number;
    }>,
  };
}

export async function listCommunities(moduleSlug: string, datasetKey: string) {
  return {
    available: false,
    message: "Community data available after successful index run with active worker",
    communities: [] as Array<{
      id: string;
      title: string;
      summary: string;
      level: number;
      entityCount: number;
    }>,
  };
}

export async function listCommunityReports(moduleSlug: string, datasetKey: string) {
  return {
    available: false,
    message: "Community reports available after successful index run with active worker",
    reports: [] as Array<{
      communityId: string;
      title: string;
      summary: string;
      findings: string[];
      level: number;
    }>,
  };
}

// ── Worker Health ────────────────────────────────────────────────────────────

export async function getWorkerStatus() {
  const healthy = await checkWorkerHealth();
  return {
    healthy,
    url: process.env.GRAPHRAG_WORKER_URL || "http://localhost:8484",
    message: healthy
      ? "GraphRAG worker is running and accepting jobs"
      : "GraphRAG worker is not available. Start the Python worker service to enable indexing and querying.",
  };
}

// ── Initialize pilot adapters ────────────────────────────────────────────────

export async function initializeAdapters() {
  // 1. Documents pilot adapter (always registered)
  try {
    const { documentsGraphRagAdapter } = await import("./adapters/documents-adapter");
    await registerSource(documentsGraphRagAdapter);
    console.log("[GraphRAG] Documents pilot adapter initialized and registered");
  } catch (err: any) {
    console.warn("[GraphRAG] Failed to init documents adapter:", err.message);
  }

  // 2. Sample datasets (dev/test only — never in production)
  if (process.env.NODE_ENV !== "production") {
    try {
      const { sampleDatasetAdapters } = await import("./adapters/sample-datasets-adapter");
      let registered = 0;
      for (const adapter of sampleDatasetAdapters) {
        try {
          await registerSource(adapter);
          registered++;
          console.log(
            `[GraphRAG:SampleSeed] Registered sample dataset: ${adapter.moduleSlug}:${adapter.datasetKey} ("${adapter.displayName}")`
          );
        } catch (adapterErr: any) {
          console.warn(
            `[GraphRAG:SampleSeed] Failed to register ${adapter.datasetKey}:`,
            adapterErr.message
          );
        }
      }
      console.log(
        `[GraphRAG:SampleSeed] Sample dataset seeding complete: ${registered}/${sampleDatasetAdapters.length} registered`
      );
    } catch (err: any) {
      console.warn("[GraphRAG:SampleSeed] Sample adapter import failed:", err.message);
    }
  }
}
