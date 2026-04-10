/**
 * Neo4j Query Executor
 *
 * Executes validated Cypher queries against Neo4j sources.
 * Read-only by default — write operations are blocked at the governance layer.
 */

import type { GraphSource } from "../../../domain/types";
import type { GraphQueryResult } from "../../../domain/ports/GraphStorePort";
import { kgiaInfo, kgiaError } from "../../observability/structured-logs";
import { KGIA_METRICS } from "../../observability/metrics";

/**
 * Execute a Cypher query.
 * V1: Returns empty results (adapter boundary).
 * Future: Uses neo4j-driver session.run() with read access mode.
 */
export async function executeCypherQuery(
  source: GraphSource,
  queryText: string,
  params?: Record<string, unknown>
): Promise<GraphQueryResult> {
  const startMs = Date.now();

  kgiaInfo("neo4j.execute", `Executing Cypher on ${source.name}`, {
    sourceId: source.id,
    queryLength: queryText.length,
  });

  try {
    // V1: Adapter boundary — return structured empty result
    // In production, this would use:
    //   const driver = neo4j.driver(endpoint, neo4j.auth.basic(user, pass));
    //   const session = driver.session({ defaultAccessMode: neo4j.session.READ });
    //   const result = await session.run(queryText, params);

    const durationMs = Date.now() - startMs;
    KGIA_METRICS.runDuration(durationMs, "neo4j");

    return {
      records: [],
      summary: { resultAvailableAfter: durationMs, counters: {} },
    };
  } catch (err) {
    const durationMs = Date.now() - startMs;
    kgiaError("neo4j.execute", `Query failed on ${source.name}: ${(err as Error).message}`, {
      sourceId: source.id,
      durationMs,
    });
    throw err;
  }
}
