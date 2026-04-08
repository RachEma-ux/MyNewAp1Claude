/**
 * AI Agent Studio — Knowledge Source Adapter
 *
 * Returns the list of knowledge sources an agent can attach + a deterministic
 * retrieval preview. This adapter is the SINGLE point where the AI Agent
 * Studio module talks to the platform's knowledge/RAG layer. Today the
 * sources are static and the preview is deterministic; a future revision can
 * swap this body to query the real vector DB / GraphRAG without changing any
 * caller.
 */

export type KnowledgeSourceKind =
  | "wiki"
  | "document_store"
  | "vector"
  | "graph"
  | "api"
  | "filesystem";

export interface KnowledgeSourceEntry {
  key: string;
  name: string;
  description: string;
  kind: KnowledgeSourceKind;
  /** Whether the source supports a freshness filter */
  supportsFreshness: boolean;
  /** Default grounding mode for new bindings */
  defaultGroundingMode: "strict" | "hybrid" | "loose";
}

export interface RetrievalPreviewHit {
  source: string;
  score: number;
  snippet: string;
  uri: string;
}

const SOURCES: KnowledgeSourceEntry[] = [
  {
    key: "wiki",
    name: "Platform Wiki",
    description: "Internal wiki articles and runbooks",
    kind: "wiki",
    supportsFreshness: true,
    defaultGroundingMode: "hybrid",
  },
  {
    key: "documents",
    name: "Document Store",
    description: "Uploaded documents (PDF, DOCX, MD) with chunking",
    kind: "document_store",
    supportsFreshness: false,
    defaultGroundingMode: "hybrid",
  },
  {
    key: "vectordb",
    name: "Vector Database",
    description: "Semantic vector search across embedded corpora",
    kind: "vector",
    supportsFreshness: false,
    defaultGroundingMode: "strict",
  },
  {
    key: "graph",
    name: "Knowledge Graph",
    description: "Entity/relationship graph queries (GraphRAG)",
    kind: "graph",
    supportsFreshness: true,
    defaultGroundingMode: "strict",
  },
  {
    key: "internal_api",
    name: "Internal API",
    description: "Live data from approved internal services",
    kind: "api",
    supportsFreshness: true,
    defaultGroundingMode: "strict",
  },
  {
    key: "code_repo",
    name: "Code Repository",
    description: "Source files from approved git repositories",
    kind: "filesystem",
    supportsFreshness: true,
    defaultGroundingMode: "hybrid",
  },
];

export async function listKnowledgeSources(): Promise<KnowledgeSourceEntry[]> {
  return SOURCES;
}

export async function getKnowledgeSourceByKey(
  key: string
): Promise<KnowledgeSourceEntry | null> {
  return SOURCES.find((s) => s.key === key) ?? null;
}

/**
 * Deterministic retrieval preview. Reads the user query and the agent's
 * configured bindings to produce plausible per-source hits. The hit count
 * is bounded by the binding's `retrievalDepth`. This is NOT a real RAG
 * call — it shows the user what the wiring would look like.
 */
export async function previewRetrieval(input: {
  query: string;
  bindings: Array<{
    sourceKey: string;
    sourceName: string;
    priority: number;
    retrievalDepth: number;
    groundingMode: string;
  }>;
}): Promise<{
  query: string;
  totalHits: number;
  hits: RetrievalPreviewHit[];
  groundingPolicy: string;
}> {
  if (input.bindings.length === 0) {
    return {
      query: input.query,
      totalHits: 0,
      hits: [],
      groundingPolicy: "(no sources configured)",
    };
  }

  const sortedByPriority = [...input.bindings].sort((a, b) => b.priority - a.priority);
  const hits: RetrievalPreviewHit[] = [];

  for (const b of sortedByPriority) {
    const depth = Math.min(Math.max(1, b.retrievalDepth), 10);
    for (let i = 0; i < depth; i++) {
      // Deterministic score: higher priority + earlier index = higher score
      const score = Math.max(
        0.1,
        Math.min(0.99, b.priority / 100 - i * 0.05)
      );
      hits.push({
        source: b.sourceName,
        score: Number(score.toFixed(2)),
        snippet: `[${b.sourceKey}#${i + 1}] preview match for "${input.query}"`,
        uri: `${b.sourceKey}://results/${i + 1}`,
      });
    }
  }
  // Sort by score desc, take top 10 across all sources
  hits.sort((a, b) => b.score - a.score);
  const top = hits.slice(0, 10);

  const dominantMode =
    sortedByPriority[0]?.groundingMode ?? "hybrid";

  return {
    query: input.query,
    totalHits: top.length,
    hits: top,
    groundingPolicy: `${dominantMode} (${input.bindings.length} source${input.bindings.length === 1 ? "" : "s"})`,
  };
}
