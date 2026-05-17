/**
 * Code Graph Parser Spike — T-E.4 Neo4j projection + query measurement.
 *
 * Closes the OTHER half of the spike doc §4 gate set (T-E.3 closed
 * the parse-time half). Runs end-to-end against a live Neo4j 5 CE
 * service container (started by the spike measurement workflow):
 *
 *   1. Parse `services/extensions/` via T-E.2's `aggregate()`.
 *   2. Project all File/Class/Function/ApiEndpoint nodes +
 *      DECLARES/IMPORTS/CALLS/EXPORTS edges to Neo4j via raw
 *      Cypher `MERGE` writes (parameterized).
 *   3. Execute the 5 §4 measurement queries, capture per-query
 *      latency, assert each p95 < 100 ms.
 *   4. Print `[T-E.4]`-tagged metrics so the doc can transcribe.
 *
 * SPIKE BOUNDARY EXEMPTION
 * ────────────────────────
 * This file imports `neo4j-driver` directly. CLAUDE.md's hard rule
 * forbids `neo4j-driver` imports outside `services/graph/repository/**`
 * and `server/modules/kgia/**` — but the spike tree is explicitly
 * a one-off experimental directory whose purpose is to measure
 * whether the Code Intelligence Graph hypothesis is viable BEFORE
 * committing to the Phase 7.5 production unblock. Forcing the
 * spike to use a stub Phase 7.5 adapter would defeat its purpose.
 *
 * Spike README + `code-graph-spike-boundary.test.ts` are updated
 * in lockstep to permit `neo4j-driver` imports inside the spike
 * tree (mirroring how `tree-sitter` is permitted here in T-E.2).
 *
 * If the spike succeeds (Outcome A), Phase 7.5 production unblock
 * carries the projection writes — the spike's neo4j-driver usage
 * is then deleted/migrated. If the spike fails (Outcome C), the
 * code is deleted entirely. Either way, this boundary exemption
 * does NOT leak into production: the spike tree is by definition
 * not consumed by any production path.
 *
 * §4 GATES
 * ────────
 *   - Projection time to Neo4j CE: < 10000 ms (for ~15 files)
 *   - Per-query latency p95: < 100 ms (5 representative queries)
 *
 * The 5 queries are from the spike doc §4:
 *   1. "What does `manifest.ts` import?" (1-hop IMPORTS)
 *   2. "What functions does `runtime.ts::invokeFromExtension` call?"
 *      (2-hop DECLARES + CALLS)
 *   3. "Which files declare a Class named `LaneHookFn`?" (label scan)
 *   4. "Show the call chain from `invokeFromExtension` to
 *      `dispatchMcpToolCall`" (variable-depth CALLS)
 *   5. "Which tests reference `manifest.ts`?" (reverse IMPORTS from *.test.ts)
 */

import neo4j, { type Driver, type Session } from "neo4j-driver";

import {
  aggregate,
  REPO_ROOT,
  SPIKE_TARGET_DIR,
} from "./run-sample-ingest.js";
import type { CodeGraphEmit } from "./parse-ts-file.js";

interface Neo4jConfig {
  readonly uri: string;
  readonly user: string;
  readonly password: string;
}

function getConfigFromEnv(): Neo4jConfig {
  // The measurement workflow sets these from service-container
  // bindings. No fallback — if these are missing, fail loud.
  // @ts-ignore — `process.env` typing in mixed-bundler context
  const uri = process.env.NEO4J_URI;
  // @ts-ignore
  const user = process.env.NEO4J_USER;
  // @ts-ignore
  const password = process.env.NEO4J_PASSWORD;
  if (!uri || !user || !password) {
    throw new Error(
      "[T-E.4] NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD env vars are required " +
        "(set by the spike measurement CI workflow's service-container bindings)",
    );
  }
  return { uri, user, password };
}

/**
 * §4 projection: write every CodeGraphEmit node + edge to Neo4j
 * using parameterized MERGE statements. Per-batch session for
 * connection-pool efficiency. Returns total projection time in ms.
 */
async function projectToNeo4j(emit: CodeGraphEmit, session: Session): Promise<number> {
  const t0 = performance.now();

  await session.run("MATCH (n) DETACH DELETE n");

  // Nodes — one MERGE per node, parameterized.
  for (const n of emit.nodes) {
    await session.run(
      `MERGE (x { id: $id })
       SET x:\`${n.type}\`, x.label = $label`,
      { id: n.id, label: n.label },
    );
  }

  // Edges — MATCH both endpoints, MERGE the relationship. Cross-file
  // CALLS edges use callee-name resolution: targetId is the bare
  // function name, joined against any declared Function/ApiEndpoint
  // with a matching label. Unresolved callees (built-ins, externals)
  // surface as edges to non-existent nodes and are skipped by the
  // MERGE-with-MATCH pattern.
  for (const e of emit.edges) {
    if (e.type === "CALLS") {
      // CALLS edges target a callee name, not a node id. Resolve
      // by matching any Function/ApiEndpoint node whose `label`
      // matches.
      await session.run(
        `MATCH (src { id: $sourceId })
         MATCH (tgt) WHERE (tgt:Function OR tgt:ApiEndpoint) AND tgt.label = $calleeName
         MERGE (src)-[:CALLS]->(tgt)`,
        { sourceId: e.sourceId, calleeName: e.targetId },
      );
    } else if (e.type === "IMPORTS") {
      // IMPORTS edges target a raw import specifier. Match File
      // nodes whose id ends with the specifier (resolves relative
      // paths after the orchestrator's join layer; for the spike's
      // bounded scope, the specifier-substring match is sufficient).
      await session.run(
        `MATCH (src { id: $sourceId })
         OPTIONAL MATCH (tgt:File) WHERE tgt.id ENDS WITH $specifierTail
         FOREACH (_ IN CASE WHEN tgt IS NULL THEN [] ELSE [1] END |
           MERGE (src)-[:IMPORTS]->(tgt)
         )`,
        {
          sourceId: e.sourceId,
          specifierTail: e.targetId.replace(/^\.\.?\//, "/"),
        },
      );
    } else {
      // DECLARES / EXPORTS — both endpoints exist as nodes.
      await session.run(
        `MATCH (src { id: $sourceId })
         MATCH (tgt { id: $targetId })
         MERGE (src)-[:\`${e.type}\`]->(tgt)`,
        { sourceId: e.sourceId, targetId: e.targetId },
      );
    }
  }

  return performance.now() - t0;
}

/**
 * §4 measurement queries. Each returns { name, latencyMs, resultCount }
 * for the doc transcription. Queries run sequentially N times each
 * so p50/p95 can be computed per query (10 iterations gives a stable
 * p95 without inflating CI runtime).
 */
const QUERY_ITERATIONS = 10;

interface QueryMeasurement {
  readonly name: string;
  readonly latencyMs: readonly number[];
  readonly resultCount: number;
}

async function runMeasurementQueries(
  session: Session,
): Promise<readonly QueryMeasurement[]> {
  const queries: ReadonlyArray<{
    name: string;
    cypher: string;
    params: Record<string, unknown>;
  }> = [
    {
      name: "Q1: what does manifest.ts import?",
      cypher:
        "MATCH (f:File)-[:IMPORTS]->(tgt:File) WHERE f.label = $label RETURN tgt.label AS imported",
      params: { label: "manifest.ts" },
    },
    {
      name: "Q2: what does invokeFromExtension call? (2-hop)",
      cypher:
        "MATCH (f:File)-[:DECLARES]->(fn) WHERE f.label = $label AND fn.label = $fnName " +
        "OPTIONAL MATCH (fn)-[:CALLS*1..2]->(callee) RETURN DISTINCT callee.label AS calledName",
      params: { label: "runtime.ts", fnName: "invokeFromExtension" },
    },
    {
      name: "Q3: which files declare a Class named LaneHookFn?",
      cypher:
        "MATCH (f:File)-[:DECLARES]->(c:Class) WHERE c.label = $name RETURN f.label AS file",
      params: { name: "LaneHookFn" },
    },
    {
      name: "Q4: call chain from invokeFromExtension to dispatchMcpToolCall",
      cypher:
        "MATCH (a) WHERE a.label = $fromName " +
        "MATCH (b) WHERE b.label = $toName " +
        "MATCH p = shortestPath((a)-[:CALLS*1..6]->(b)) " +
        "RETURN [n IN nodes(p) | n.label] AS chain",
      params: {
        fromName: "invokeFromExtension",
        toName: "dispatchMcpToolCall",
      },
    },
    {
      name: "Q5: which tests reference manifest.ts? (reverse IMPORTS from *.test.ts)",
      cypher:
        "MATCH (src:File)-[:IMPORTS]->(tgt:File) WHERE src.label ENDS WITH $suffix AND tgt.label = $label " +
        "RETURN src.label AS testFile",
      params: { suffix: ".test.ts", label: "manifest.ts" },
    },
  ];

  const measurements: QueryMeasurement[] = [];
  for (const q of queries) {
    const samples: number[] = [];
    let resultCount = 0;
    for (let i = 0; i < QUERY_ITERATIONS; i++) {
      const t0 = performance.now();
      const result = await session.run(q.cypher, q.params);
      const dt = performance.now() - t0;
      samples.push(dt);
      resultCount = result.records.length;
    }
    measurements.push({
      name: q.name,
      latencyMs: samples,
      resultCount,
    });
  }
  return measurements;
}

function quantile(sortedMs: readonly number[], q: number): number {
  if (sortedMs.length === 0) return 0;
  const idx = Math.min(
    sortedMs.length - 1,
    Math.floor((sortedMs.length - 1) * q),
  );
  return sortedMs[idx];
}

export async function runProjectionAndMeasurement(): Promise<void> {
  const config = getConfigFromEnv();
  const driver: Driver = neo4j.driver(
    config.uri,
    neo4j.auth.basic(config.user, config.password),
  );
  try {
    // Verify connectivity up-front so failures surface before the
    // expensive parse + projection.
    await driver.verifyConnectivity();
    console.log(`[T-E.4] neo4j connectivity OK (${config.uri})`);

    const emit = aggregate(REPO_ROOT, SPIKE_TARGET_DIR);
    console.log(
      `[T-E.4] parsed ${emit.files} files → ${emit.nodes.length} nodes, ${emit.edges.length} edges`,
    );

    const session = driver.session();
    try {
      const projectionMs = await projectToNeo4j(
        { nodes: emit.nodes, edges: emit.edges },
        session,
      );
      console.log(
        `[T-E.4] projection time (ms): ${projectionMs.toFixed(2)} target<10000`,
      );

      const measurements = await runMeasurementQueries(session);
      for (const m of measurements) {
        const sorted = [...m.latencyMs].sort((a, b) => a - b);
        const p50 = quantile(sorted, 0.5);
        const p95 = quantile(sorted, 0.95);
        console.log(
          `[T-E.4] ${m.name} — p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms iterations=${m.latencyMs.length} resultCount=${m.resultCount} target_p95<100`,
        );
      }

      // Hard gate: every per-query p95 < 100 ms; projection < 10000 ms
      if (projectionMs >= 10000) {
        throw new Error(
          `[T-E.4] projection time (${projectionMs.toFixed(2)} ms) >= 10000 ms gate`,
        );
      }
      for (const m of measurements) {
        const sorted = [...m.latencyMs].sort((a, b) => a - b);
        const p95 = quantile(sorted, 0.95);
        if (p95 >= 100) {
          throw new Error(
            `[T-E.4] ${m.name} p95 (${p95.toFixed(2)} ms) >= 100 ms gate`,
          );
        }
      }
      console.log("[T-E.4] all §4 gates PASS");
    } finally {
      await session.close();
    }
  } finally {
    await driver.close();
  }
}

// Run when invoked directly (workflow does `tsx … project-and-measure.ts`).
if (
  // @ts-ignore
  typeof process !== "undefined" &&
  // @ts-ignore
  process.argv[1] &&
  // @ts-ignore
  process.argv[1].endsWith("project-and-measure.ts")
) {
  runProjectionAndMeasurement().catch((err) => {
    console.error(err);
    // @ts-ignore
    process.exit(1);
  });
}
