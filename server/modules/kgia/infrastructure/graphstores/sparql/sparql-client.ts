/**
 * SPARQL Client
 *
 * HTTP-based SPARQL query executor for RDF endpoints.
 * Supports SELECT, CONSTRUCT, ASK query forms (read-only).
 */

import type { GraphSource } from "../../../domain/types";
import type { SparqlQueryResult } from "../../../domain/ports/RdfStorePort";
import { kgiaInfo, kgiaError } from "../../observability/structured-logs";

/**
 * Execute a SPARQL query via HTTP POST.
 * V1: Returns empty results (adapter boundary).
 * Future: fetch() to source.endpoint with Accept: application/sparql-results+json
 */
export async function executeSparqlQuery(
  source: GraphSource,
  queryText: string
): Promise<SparqlQueryResult> {
  const startMs = Date.now();

  kgiaInfo("sparql.execute", `Executing SPARQL on ${source.name}`, {
    sourceId: source.id,
    queryLength: queryText.length,
  });

  try {
    // V1: Adapter boundary — return structured empty result
    // In production:
    //   const response = await fetch(source.endpoint, {
    //     method: "POST",
    //     headers: { "Content-Type": "application/sparql-query", "Accept": "application/sparql-results+json" },
    //     body: queryText,
    //   });
    //   const json = await response.json();
    //   return parseSparqlResults(json);

    const durationMs = Date.now() - startMs;

    return {
      bindings: [],
      variables: [],
      resultCount: 0,
      durationMs,
    };
  } catch (err) {
    kgiaError("sparql.execute", `Query failed on ${source.name}: ${(err as Error).message}`, {
      sourceId: source.id,
    });
    throw err;
  }
}

/**
 * Parse SPARQL JSON results format.
 */
export function parseSparqlJsonResults(json: unknown): SparqlQueryResult {
  const data = json as any;
  const variables = data?.head?.vars ?? [];
  const bindings = (data?.results?.bindings ?? []).map((b: any) => {
    const row: Record<string, unknown> = {};
    for (const v of variables) {
      row[v] = b[v]?.value ?? null;
    }
    return row;
  });

  return { bindings, variables, resultCount: bindings.length, durationMs: 0 };
}
