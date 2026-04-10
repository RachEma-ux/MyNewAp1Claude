/**
 * KGIA Domain — Value Objects & Entity Types
 *
 * Core domain model for the Knowledge Graph Interpretation Agent.
 * These types flow through the runtime pipeline and are serialized
 * into the AnswerEnvelope persisted in kgia_answers.
 */

// ── Graph Source ─────────────────────────────────────────────────

export interface GraphSource {
  id: number;
  name: string;
  type: "neo4j" | "sparql" | "neptune_cypher" | "neptune_sparql";
  endpoint: string;
  allowlisted: boolean;
  maxHops: number;
  maxRows: number;
  readOnly: boolean;
}

// ── Schema Slice ─────────────────────────────────────────────────

export interface SchemaNode {
  label: string;
  properties: string[];
}

export interface SchemaRelationship {
  type: string;
  fromLabel: string;
  toLabel: string;
  properties: string[];
}

export interface SchemaSlice {
  nodes: SchemaNode[];
  relationships: SchemaRelationship[];
  sourceId: number;
  generatedAt: string;
}

// ── Query Planning ───────────────────────────────────────────────

export type IntentClass =
  | "entity_lookup"
  | "relationship_query"
  | "path_traversal"
  | "aggregation"
  | "pattern_match"
  | "temporal_query"
  | "comparison"
  | "unknown";

export interface QueryPlan {
  intent: IntentClass;
  schemaSlice: SchemaSlice;
  queryLanguage: "cypher" | "sparql" | "hybrid";
  queryText: string;
  validated: boolean;
  validationErrors: string[];
  repairAttempts: number;
}

// ── Evidence Graph ───────────────────────────────────────────────

export interface EvidenceNode {
  id: string;
  nodeType: "entity" | "literal" | "claim";
  label: string;
  properties: Record<string, unknown>;
  sourceRef?: string;
  confidence: number;
}

export interface EvidenceEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relationshipType: string;
  properties: Record<string, unknown>;
  confidence: number;
}

export interface EvidenceGraph {
  nodes: EvidenceNode[];
  edges: EvidenceEdge[];
}

// ── Path Reasoning ───────────────────────────────────────────────

export interface PathCandidate {
  id: string;
  nodes: EvidenceNode[];
  edges: EvidenceEdge[];
  score: number;
  hops: number;
  explanation: string;
}

// ── Provenance & Temporal Claims ─────────────────────────────────

export interface ProvenanceRef {
  sourceId: number;
  sourceName: string;
  queryText?: string;
  resultIndex?: number;
  timestamp: string;
}

export interface TemporalClaim {
  claim: string;
  validFrom?: string;
  validTo?: string;
  confidence: number;
  source: ProvenanceRef;
}

// ── Safety & Governance ──────────────────────────────────────────

export interface SafetyVerdict {
  safe: boolean;
  readOnly: boolean;
  violations: string[];
  blockedPatterns: string[];
  reviewRequired: boolean;
}

export interface Confidence {
  overall: number;
  dataCompleteness: number;
  pathStrength: number;
  sourceTrust: number;
}

// ── Answer Envelope ──────────────────────────────────────────────

export type KgiaMode = "direct_query" | "graph_rag" | "memory" | "hybrid";

export interface AnswerEnvelope {
  answer: string;
  selectedMode: KgiaMode;
  confidence: Confidence;
  observedFacts: string[];
  inferredClaims: string[];
  evidenceGraph: EvidenceGraph;
  provenanceRefs: ProvenanceRef[];
  temporalValidity: TemporalClaim[];
  missingKnowledge: string[];
  governanceVerdict: SafetyVerdict;
}

// ── Memory Graph ─────────────────────────────────────────────────

export type MemoryNodeType =
  | "observed_fact"
  | "inferred_claim"
  | "contradiction"
  | "unresolved_entity"
  | "hypothesis"
  | "query_attempt"
  | "accepted_hypothesis"
  | "rejected_hypothesis";

export interface MemoryNode {
  id: string;
  nodeType: MemoryNodeType;
  label: string;
  content: string;
  status: "active" | "rejected" | "superseded";
  confidence: number;
  evidenceRunId?: number;
}

export interface MemoryEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relationshipType: string;
}

export interface TaskMemoryGraph {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
}

// ── Runtime State ────────────────────────────────────────────────

export type RuntimeNodeName =
  | "classifyIntent"
  | "loadSchemaSlice"
  | "chooseMode"
  | "planQuery"
  | "validateQuery"
  | "executeReadQuery"
  | "expandPaths"
  | "runGraphRagRetrieval"
  | "updateTaskMemory"
  | "assembleEvidence"
  | "synthesizeAnswer"
  | "requestHumanReview";

export type SubgraphName =
  | "directQuery"
  | "pathReasoning"
  | "graphRag"
  | "memoryGraph";

export interface RuntimeState {
  runId: number;
  sessionId: number;
  workspaceId: number;
  question: string;
  sources: GraphSource[];
  intent?: IntentClass;
  schemaSlice?: SchemaSlice;
  selectedMode?: KgiaMode;
  queryPlan?: QueryPlan;
  safetyVerdict?: SafetyVerdict;
  queryResults?: Record<string, unknown>[];
  pathCandidates?: PathCandidate[];
  evidenceGraph?: EvidenceGraph;
  memoryGraph?: TaskMemoryGraph;
  envelope?: AnswerEnvelope;
  currentNode?: RuntimeNodeName;
  completedNodes: RuntimeNodeName[];
  errors: string[];
}
