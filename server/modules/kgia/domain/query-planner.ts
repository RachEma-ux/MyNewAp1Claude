/**
 * KGIA Domain — Query Planner
 *
 * Translates natural language into safe graph operations.
 * Schema-slice-aware: only generates queries using entities/relationships
 * present in the loaded schema slice.
 */

import type {
  IntentClass,
  QueryPlan,
  SchemaSlice,
  GraphSource,
} from "./types";

// ── Intent Classification ────────────────────────────────────────

const INTENT_PATTERNS: Array<{ pattern: RegExp; intent: IntentClass }> = [
  { pattern: /\b(who|what|which|where)\b.*\b(is|are|was|were)\b/i, intent: "entity_lookup" },
  { pattern: /\b(connect|relate|link|between|relationship)\b/i, intent: "relationship_query" },
  { pattern: /\b(path|route|shortest|hop|reach|traverse)\b/i, intent: "path_traversal" },
  { pattern: /\b(count|how many|total|sum|average|max|min)\b/i, intent: "aggregation" },
  { pattern: /\b(pattern|match|like|similar)\b/i, intent: "pattern_match" },
  { pattern: /\b(when|before|after|during|timeline|history|date)\b/i, intent: "temporal_query" },
  { pattern: /\b(compare|versus|vs|differ|same)\b/i, intent: "comparison" },
];

export function classifyIntent(question: string): IntentClass {
  const lower = question.toLowerCase();
  for (const { pattern, intent } of INTENT_PATTERNS) {
    if (pattern.test(lower)) return intent;
  }
  return "entity_lookup"; // default to simplest form
}

// ── Schema Slice Loading ─────────────────────────────────────────

export function extractRelevantSchemaSlice(
  fullSchema: Record<string, unknown>,
  question: string,
  source: GraphSource
): SchemaSlice {
  const nodes = (fullSchema.nodes as Array<{ label: string; properties: string[] }>) ?? [];
  const rels = (fullSchema.relationships as Array<{
    type: string;
    fromLabel: string;
    toLabel: string;
    properties: string[];
  }>) ?? [];

  const questionLower = question.toLowerCase();

  // Score each node label by keyword overlap with the question
  const relevantNodes = nodes.filter((n) => {
    const labelWords = n.label.toLowerCase().split(/[_\s]+/);
    return labelWords.some((w) => questionLower.includes(w));
  });

  // Include all relationships connecting relevant nodes
  const relevantLabels = new Set(relevantNodes.map((n) => n.label));
  const relevantRels = rels.filter(
    (r) => relevantLabels.has(r.fromLabel) || relevantLabels.has(r.toLabel)
  );

  // If nothing matched, return the first 10 nodes as a fallback slice
  if (relevantNodes.length === 0) {
    return {
      nodes: nodes.slice(0, 10).map((n) => ({ label: n.label, properties: n.properties })),
      relationships: rels.slice(0, 20).map((r) => ({
        type: r.type,
        fromLabel: r.fromLabel,
        toLabel: r.toLabel,
        properties: r.properties,
      })),
      sourceId: source.id,
      generatedAt: new Date().toISOString(),
    };
  }

  return {
    nodes: relevantNodes.map((n) => ({ label: n.label, properties: n.properties })),
    relationships: relevantRels.map((r) => ({
      type: r.type,
      fromLabel: r.fromLabel,
      toLabel: r.toLabel,
      properties: r.properties,
    })),
    sourceId: source.id,
    generatedAt: new Date().toISOString(),
  };
}

// ── Query Generation ─────────────────────────────────────────────

export function generateCypherQuery(
  intent: IntentClass,
  slice: SchemaSlice,
  question: string
): string {
  const primaryNode = slice.nodes[0]?.label ?? "Node";
  const primaryRel = slice.relationships[0];

  switch (intent) {
    case "entity_lookup":
      return `MATCH (n:${primaryNode}) RETURN n LIMIT 25`;

    case "relationship_query":
      if (primaryRel) {
        return `MATCH (a:${primaryRel.fromLabel})-[r:${primaryRel.type}]->(b:${primaryRel.toLabel}) RETURN a, r, b LIMIT 25`;
      }
      return `MATCH (n:${primaryNode})-[r]->(m) RETURN n, type(r), m LIMIT 25`;

    case "path_traversal":
      if (slice.nodes.length >= 2) {
        return `MATCH p = shortestPath((a:${slice.nodes[0].label})-[*..${4}]-(b:${slice.nodes[1].label})) RETURN p LIMIT 10`;
      }
      return `MATCH p = (n:${primaryNode})-[*..3]->(m) RETURN p LIMIT 10`;

    case "aggregation":
      return `MATCH (n:${primaryNode}) RETURN count(n) AS total`;

    case "temporal_query":
      return `MATCH (n:${primaryNode}) WHERE n.createdAt IS NOT NULL RETURN n ORDER BY n.createdAt DESC LIMIT 25`;

    case "comparison":
      return `MATCH (n:${primaryNode}) RETURN n LIMIT 50`;

    case "pattern_match":
    default:
      return `MATCH (n:${primaryNode}) RETURN n LIMIT 25`;
  }
}

export function generateSparqlQuery(
  intent: IntentClass,
  slice: SchemaSlice,
  question: string
): string {
  const primaryNode = slice.nodes[0]?.label ?? "Thing";

  switch (intent) {
    case "entity_lookup":
      return `SELECT ?s ?p ?o WHERE { ?s a <${primaryNode}> . ?s ?p ?o } LIMIT 25`;

    case "relationship_query":
      return `SELECT ?s ?p ?o WHERE { ?s ?p ?o . FILTER(isURI(?o)) } LIMIT 25`;

    case "aggregation":
      return `SELECT (COUNT(?s) AS ?count) WHERE { ?s a <${primaryNode}> }`;

    default:
      return `SELECT ?s ?p ?o WHERE { ?s a <${primaryNode}> . ?s ?p ?o } LIMIT 25`;
  }
}

// ── Query Plan Builder ───────────────────────────────────────────

export function buildQueryPlan(
  question: string,
  source: GraphSource,
  schema: Record<string, unknown>
): QueryPlan {
  const intent = classifyIntent(question);
  const schemaSlice = extractRelevantSchemaSlice(schema, question, source);

  const isSparql = source.type === "sparql" || source.type === "neptune_sparql";
  const queryLanguage = isSparql ? "sparql" as const : "cypher" as const;

  const queryText = isSparql
    ? generateSparqlQuery(intent, schemaSlice, question)
    : generateCypherQuery(intent, schemaSlice, question);

  return {
    intent,
    schemaSlice,
    queryLanguage,
    queryText,
    validated: false,
    validationErrors: [],
    repairAttempts: 0,
  };
}
