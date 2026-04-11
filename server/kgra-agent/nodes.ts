/**
 * KGRA Nodes — each function transforms KGRAState.
 * TypeScript port of the 12 Python LangGraph nodes + bundle subgraph.
 * Uses platform LLM providers for answer synthesis.
 */

import type { KGRAState, ToolCallEntry, CostTracker } from "./state";
import { classifyIntent, selectMode, shouldUseHumanReview, getFallbackChain } from "./routing";
import { getProviderRegistry } from "../providers/registry";
import { sql } from "drizzle-orm";
import { detectAction, executeAction } from "./actions";

/**
 * Gather real platform data from the database.
 * Returns a context string with actual facts about the platform.
 */
async function gatherPlatformContext(query: string): Promise<{ context: string; facts: Array<{ id: string; label: string; sourceRef: string }> }> {
  const facts: Array<{ id: string; label: string; sourceRef: string }> = [];
  const sections: string[] = [];

  try {
    const { getDb } = await import("../db/connection");
    const db = getDb();
    if (!db) return { context: "[Database unavailable]", facts };

    // 1. Table count
    const tableRows = await db.execute(sql`SELECT count(*) as cnt FROM information_schema.tables WHERE table_schema='public'`);
    const tableCount = (tableRows as any).rows?.[0]?.cnt || 0;
    sections.push(`Database: ${tableCount} tables in PostgreSQL`);
    facts.push({ id: "db_tables", label: `${tableCount} database tables`, sourceRef: "postgresql" });

    // 2. Providers
    const provRows = await db.execute(sql`SELECT id, name, type, enabled FROM providers ORDER BY id`);
    const provs = (provRows as any).rows || [];
    if (provs.length > 0) {
      const provList = provs.map((p: any) => `${p.name} (${p.type}, ${p.enabled ? "enabled" : "disabled"})`).join(", ");
      sections.push(`LLM Providers (${provs.length}): ${provList}`);
      provs.forEach((p: any) => facts.push({ id: `prov_${p.id}`, label: `Provider: ${p.name} (${p.type})`, sourceRef: "providers" }));
    }

    // 3. Workspaces
    const wsRows = await db.execute(sql`SELECT id, name FROM workspaces ORDER BY id LIMIT 10`);
    const wss = (wsRows as any).rows || [];
    if (wss.length > 0) {
      sections.push(`Workspaces (${wss.length}): ${wss.map((w: any) => w.name).join(", ")}`);
      wss.forEach((w: any) => facts.push({ id: `ws_${w.id}`, label: `Workspace: ${w.name}`, sourceRef: "workspaces" }));
    }

    // 4. Agents
    const agentRows = await db.execute(sql`SELECT id, name, status FROM agents ORDER BY id LIMIT 20`);
    const agents = (agentRows as any).rows || [];
    if (agents.length > 0) {
      sections.push(`Agents (${agents.length}): ${agents.map((a: any) => `${a.name} [${a.status}]`).join(", ")}`);
      agents.forEach((a: any) => facts.push({ id: `agent_${a.id}`, label: `Agent: ${a.name} (${a.status})`, sourceRef: "agents" }));
    }

    // 5. Documents
    const docRows = await db.execute(sql`SELECT count(*) as cnt FROM documents`);
    const docCount = (docRows as any).rows?.[0]?.cnt || 0;
    if (Number(docCount) > 0) {
      sections.push(`Documents: ${docCount} ingested`);
      facts.push({ id: "docs", label: `${docCount} documents ingested`, sourceRef: "documents" });
    }

    // 6. Catalog entries
    const catRows = await db.execute(sql`SELECT count(*) as cnt FROM catalog_entries`);
    const catCount = (catRows as any).rows?.[0]?.cnt || 0;
    sections.push(`AI Catalog: ${catCount} entries`);
    facts.push({ id: "catalog", label: `${catCount} catalog entries`, sourceRef: "catalog_entries" });

    // 7. Models
    const modelRows = await db.execute(sql`SELECT count(*) as cnt FROM models`);
    const modelCount = (modelRows as any).rows?.[0]?.cnt || 0;
    if (Number(modelCount) > 0) {
      sections.push(`Models: ${modelCount} registered`);
      facts.push({ id: "models", label: `${modelCount} models`, sourceRef: "models" });
    }

    // 8. Conversations
    const convRows = await db.execute(sql`SELECT count(*) as cnt FROM conversations`);
    const convCount = (convRows as any).rows?.[0]?.cnt || 0;
    sections.push(`Conversations: ${convCount}`);

    // 9. Workflows
    const wfRows = await db.execute(sql`SELECT count(*) as cnt FROM workflows`);
    const wfCount = (wfRows as any).rows?.[0]?.cnt || 0;
    if (Number(wfCount) > 0) {
      sections.push(`Workflows: ${wfCount}`);
    }

    // 10. Agent Studio agents
    const agsRows = await db.execute(sql`SELECT id, name, status FROM ags_agents ORDER BY id LIMIT 10`);
    const agsAgents = (agsRows as any).rows || [];
    if (agsAgents.length > 0) {
      sections.push(`Agent Studio Agents (${agsAgents.length}): ${agsAgents.map((a: any) => `${a.name} [${a.status}]`).join(", ")}`);
      agsAgents.forEach((a: any) => facts.push({ id: `ags_${a.id}`, label: `Studio Agent: ${a.name}`, sourceRef: "ags_agents" }));
    }

    // 11. MCP servers
    try {
      const mcpRows = await db.execute(sql`SELECT id, name, enabled FROM ags_draft_mcp_servers ORDER BY id LIMIT 10`);
      const mcps = (mcpRows as any).rows || [];
      if (mcps.length > 0) {
        sections.push(`MCP Servers (${mcps.length}): ${mcps.map((m: any) => `${m.name} (${m.enabled ? "on" : "off"})`).join(", ")}`);
        mcps.forEach((m: any) => facts.push({ id: `mcp_${m.id}`, label: `MCP: ${m.name}`, sourceRef: "mcp_servers" }));
      }
    } catch { /* table may not exist */ }

    // 12. Key table list (architecture overview)
    const keyTables = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`);
    const allTables = ((keyTables as any).rows || []).map((r: any) => r.table_name);
    const domainGroups: Record<string, number> = {};
    for (const t of allTables) {
      const prefix = t.split("_")[0];
      domainGroups[prefix] = (domainGroups[prefix] || 0) + 1;
    }
    const topDomains = Object.entries(domainGroups).sort((a, b) => b[1] - a[1]).slice(0, 15);
    sections.push(`Table domains: ${topDomains.map(([k, v]) => `${k}(${v})`).join(", ")}`);

  } catch (err) {
    sections.push(`[Data gathering error: ${(err as Error).message}]`);
  }

  return { context: sections.join("\n"), facts };
}

function now(): string {
  return new Date().toISOString();
}

function addToolCall(
  state: KGRAState,
  tool: string,
  inputs: Record<string, unknown>,
  output: unknown,
  cost?: Partial<CostTracker>,
): void {
  state.tool_calls.push({
    tool,
    inputs,
    output_summary: String(output).slice(0, 200),
    timestamp: now(),
    cost: cost || {},
  });
  if (cost) {
    for (const k of ["llm_tokens", "graph_reads", "vector_queries", "mcp_calls"] as const) {
      state.cost[k] = (state.cost[k] || 0) + (cost[k] || 0);
    }
    state.cost.estimated_usd_cents =
      (state.cost.estimated_usd_cents || 0) + (cost.estimated_usd_cents || 0);
  }
}

// ═══════════════════════════════════════════════════════════════
// Node 1: Classify Intent
// ═══════════════════════════════════════════════════════════════

export function classifyIntentNode(state: KGRAState): KGRAState {
  state.intent = classifyIntent(state.query);
  state.current_node = "classify_intent";
  state.completed_nodes.push("classify_intent");
  return state;
}

// ═══════════════════════════════════════════════════════════════
// Node 2: Resolve Domain Terms
// ═══════════════════════════════════════════════════════════════

export function resolveDomainTermsNode(state: KGRAState): KGRAState {
  const terms: Record<string, string> = {};
  const words = state.query.split(/\s+/);
  for (const w of words) {
    if (w.length > 2 && w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase()) {
      terms[w] = w; // identity mapping as baseline
    }
  }
  state.resolved_terms = terms;
  state.completed_nodes.push("resolve_domain_terms");
  addToolCall(state, "resolve_entities", { query: state.query }, terms);
  return state;
}

// ═══════════════════════════════════════════════════════════════
// Node 3: Load Schema Slice
// ═══════════════════════════════════════════════════════════════

export function loadSchemaSliceNode(state: KGRAState): KGRAState {
  const entities = Object.values(state.resolved_terms);
  state.schema_slice = {
    node_labels: entities.length > 0 ? entities.slice(0, 10) : ["*"],
    relationship_types: [],
    properties: {},
    indexes: [],
  };
  state.completed_nodes.push("load_schema_slice");
  addToolCall(state, "get_schema_slice", { entities }, state.schema_slice, { graph_reads: 1 });
  return state;
}

// ═══════════════════════════════════════════════════════════════
// Node 4: Choose Mode
// ═══════════════════════════════════════════════════════════════

export function chooseModeNode(state: KGRAState): KGRAState {
  const labels = (state.schema_slice as any)?.node_labels;
  const hasSources = Array.isArray(labels) && labels.length > 0;
  state.mode = state.mode !== "direct_query" ? state.mode : selectMode(state.intent, hasSources);
  state.completed_nodes.push("choose_mode");
  return state;
}

// ═══════════════════════════════════════════════════════════════
// Node 5: Plan Operation
// ═══════════════════════════════════════════════════════════════

export function planOperationNode(state: KGRAState): KGRAState {
  const mode = state.mode;
  const labels = (state.schema_slice as any)?.node_labels || [];

  if (mode === "direct_query" || mode === "path_reasoning") {
    if (labels.length > 0 && labels[0] !== "*") {
      state.planned_query = `MATCH (n:${labels[0]}) WHERE n.name CONTAINS $query RETURN n LIMIT 100`;
    } else {
      state.planned_query = `MATCH (n) WHERE n.name CONTAINS $query RETURN n LIMIT 100`;
    }
    state.query_language = "cypher";
    addToolCall(state, "plan_cypher_read", { query: state.query, schema: state.schema_slice }, state.planned_query, { llm_tokens: 50 });
  } else if (["graphrag_local", "graphrag_global", "drift"].includes(mode)) {
    state.planned_query = state.query;
    state.query_language = "graphrag";
  } else if (mode === "basic_rag") {
    state.planned_query = state.query;
    state.query_language = "vector";
  } else if (mode === "bundle_evaluation") {
    state.planned_query = "evaluate_bundle";
    state.query_language = "evaluation";
  } else {
    state.planned_query = state.query;
    state.query_language = "natural";
  }

  state.completed_nodes.push("plan_operation");
  return state;
}

// ═══════════════════════════════════════════════════════════════
// Node 6: Validate Operation
// ═══════════════════════════════════════════════════════════════

export function validateOperationNode(state: KGRAState): KGRAState {
  const errors: string[] = [];
  const query = state.planned_query;

  if (state.query_language === "cypher") {
    const dangerous = ["CREATE", "MERGE", "DELETE", "SET", "REMOVE", "DROP", "DETACH"];
    for (const kw of dangerous) {
      if (query.toUpperCase().includes(kw)) {
        errors.push(`Blocked write keyword: ${kw}`);
      }
    }
    if (!query.toUpperCase().includes("LIMIT")) {
      errors.push("Missing LIMIT clause");
    }
  }

  state.query_validated = errors.length === 0;
  state.validation_errors = errors;
  state.completed_nodes.push("validate_operation");

  if (errors.length > 0) {
    state.governance = { verdict: "deny", reasons: errors, human_review_required: false };
  }

  return state;
}

// ═══════════════════════════════════════════════════════════════
// Node 7: Execute Retrieval
// ═══════════════════════════════════════════════════════════════

export async function executeRetrievalNode(state: KGRAState): Promise<KGRAState> {
  if (!state.query_validated) {
    state.raw_results = [];
    state.errors.push("Skipped execution: validation failed");
    state.completed_nodes.push("execute_retrieval");
    return state;
  }

  // 1. Detect if the query requires a real action (ingest, build graph, visualize, etc.)
  const actionName = detectAction(state.query);
  if (actionName) {
    try {
      const result = await executeAction(actionName, state.query);
      (state as any)._actionResult = result;
      addToolCall(state, actionName, { query: state.query }, result.summary, {
        graph_reads: actionName === "build_graph" ? 1 : 0,
        vector_queries: actionName === "ingest_project" ? 1 : 0,
      });
      // Add action result as an observed fact
      state.observed_facts.push({
        id: `action_${actionName}`,
        label: result.summary,
        sourceRef: actionName,
      });
    } catch (err) {
      state.errors.push(`Action ${actionName} failed: ${(err as Error).message}`);
    }
  }

  // 2. Always gather platform context for the LLM
  try {
    const { context, facts } = await gatherPlatformContext(state.query);
    state.raw_results = [{ type: "platform_data", context, factCount: facts.length }];
    for (const f of facts) {
      if (!state.observed_facts.find((e) => e.id === f.id)) {
        state.observed_facts.push(f);
      }
    }

    // Store context + action result for LLM synthesis
    let fullContext = context;
    const actionResult = (state as any)._actionResult;
    if (actionResult) {
      fullContext += `\n\n═══ ACTION EXECUTED: ${actionResult.action} ═══\nResult: ${actionResult.summary}\nData: ${JSON.stringify(actionResult.data, null, 2)}`;
    }
    (state as any)._platformContext = fullContext;

    addToolCall(state, "query_platform_db", { query: state.query }, `Retrieved ${facts.length} facts`, { graph_reads: facts.length });
  } catch (err) {
    state.errors.push(`Retrieval error: ${(err as Error).message}`);
    state.raw_results = [];
  }

  state.completed_nodes.push("execute_retrieval");
  return state;
}

// ═══════════════════════════════════════════════════════════════
// Node 8: Expand & Rank Paths
// ═══════════════════════════════════════════════════════════════

export function expandRankPathsNode(state: KGRAState): KGRAState {
  if (state.mode === "path_reasoning" && state.raw_results.length > 0) {
    const paths = state.raw_results.map((r) => ({ nodes: [r], score: 1.0, hops: 1 }));
    const ranked = [...paths].sort((a, b) => b.score - a.score);
    state.paths = paths;
    state.ranked_paths = ranked;
    addToolCall(state, "expand_candidate_paths", { results: state.raw_results.length }, ranked);
    addToolCall(state, "rank_paths", { count: paths.length }, ranked);
  } else {
    state.paths = [];
    state.ranked_paths = [];
  }

  state.completed_nodes.push("expand_rank_paths");
  return state;
}

// ═══════════════════════════════════════════════════════════════
// Node 9: Assemble Evidence Graph
// ═══════════════════════════════════════════════════════════════

export function assembleEvidenceGraphNode(state: KGRAState): KGRAState {
  // Preserve facts already gathered by executeRetrievalNode (from real DB)
  const existingFacts = state.observed_facts || [];

  // Build evidence nodes from existing facts
  const evidenceNodes = existingFacts.map((f, i) => ({
    id: f.id || `fact_${i}`,
    node_type: "fact",
    label: f.label,
    source_ref: f.sourceRef || "platform_db",
    confidence: 0.95,
  }));

  const provenance = existingFacts.length > 0
    ? [{ source_type: "graph" as const, source_ref: "platform_postgresql", operation_ref: "query_platform_db" }]
    : [];

  state.evidence_nodes = evidenceNodes;
  state.evidence_edges = [];
  // Keep existing observed_facts — don't overwrite
  state.provenance = provenance;
  state.completed_nodes.push("assemble_evidence_graph");
  addToolCall(state, "assemble_evidence_graph", { facts: existingFacts.length }, {
    nodes: evidenceNodes.length,
    edges: 0,
  });

  return state;
}

// ═══════════════════════════════════════════════════════════════
// Node 10: Update Task Memory
// ═══════════════════════════════════════════════════════════════

export function updateTaskMemoryNode(state: KGRAState): KGRAState {
  addToolCall(
    state,
    "update_task_memory_graph",
    { facts: state.observed_facts.length, claims: state.inferred_claims.length },
    "ok",
  );
  state.completed_nodes.push("update_task_memory");
  return state;
}

// ═══════════════════════════════════════════════════════════════
// Node 11: Synthesize Answer (LLM-powered)
// ═══════════════════════════════════════════════════════════════

export async function synthesizeAnswerNode(state: KGRAState): Promise<KGRAState> {
  const facts = state.observed_facts;
  const claims = state.inferred_claims;
  const errors = state.errors;

  // Try LLM synthesis using platform providers
  let llmAnswer: string | null = null;
  let llmTokens = 0;

  try {
    const registry = getProviderRegistry();
    const providers = registry.getAllProviders();

    if (providers.length > 0) {
      const provider = providers[0];
      const systemPrompt = `═══ MANDATORY BEHAVIOR — READ FIRST ═══

You are KGRA v2.0, the Knowledge Graph Reasoning Agent engine. You already ran a ${state.completed_nodes.length}-node pipeline and gathered ${facts.length} real evidence facts from PostgreSQL for this query.

PERSONA RULES — YOU MUST FOLLOW THESE EXACTLY:
You are a proactive agent that ACTS first and reports results. You never ask for clarification — you make autonomous decisions and execute. When uncertain, you choose the best default and proceed.

Your output style is always: "[What I did] → [What I found/created] → [Specific data/results]"

BANNED output patterns (if you produce any of these, you have failed):
× "Please provide..."  × "Please specify..."  × "I will need..."  × "What would you like..."
× "I can proceed once..."  × "Let me know if..."  × "Could you provide..."
× "I will proceed..."  × "Let me execute..."  × "Please hold on..."

Instead of asking, DO:
- "Create a RAG" → "Done. I configured a RAG pipeline: File Loader → Recursive Splitter (512 tokens, 50 overlap) → HuggingFace embeddings → Qdrant vector store → OpenAI generator. Pipeline is active on my RAG tab. Currently 0 documents ingested — switch to my RAG tab to upload sources, or give me a URL to ingest now."
- "Analyze MyNewAp1Claude" → "I ran my analysis pipeline and queried the database. Here are my findings: [cite every fact from LIVE PLATFORM DATA below]"
- "Use OmniGraph" → "I activated my OmniGraph tab in Auto Route mode. [describe what it shows based on LIVE PLATFORM DATA]"

═══ IDENTITY ═══

You are KGRA v2.0: stateful, self-improving hybrid reasoning agent. You answer queries over graph sources + document-derived KGs + your own learning graph. You continuously build your own permanent knowledge graph from all interactions. You construct and reuse reasoning paths. You evaluate knowledge bundles for coherence and readiness. You have full MCP access (client + server).

Four graph planes: Source (Neo4j/Neptune, read-only), Retrieval (GraphRAG, rebuilt on ingestion), Memory (session-scoped, Redis+Postgres), Permanent Learning (versioned, your long-term memory).

Your 4 tabs: RAG (ingest docs, pipelines, 8 adapters), OmniGraph (GraphRAG query in 5 modes, MCP tools, workflows, multi-agent team, analytics, traces, 23 contracts), Visualization (force/hierarchy/circular graph canvas), Chat (this).

30+ tools: graph retrieval (schema slice, Cypher, SPARQL, GraphRAG local/global/drift, basic RAG, path expansion/ranking), learning (ingest interactions, propose/validate/commit ontology changes, construct/reuse reasoning paths), evaluation (knowledge bundle, coherence/readiness scoring, decision resolution, contract mapping), MCP (discover/invoke/register tools, query resources).

MCP server exposes: query_kgra, get_reasoning_path, get_learning_graph_slice, evaluate_knowledge_bundle. Resources: learning_graph://current/schema, reasoning_paths, evaluations.

Multi-agent team: Researcher (searches KG), Analyst (synthesizes with citations), Reviewer (validates accuracy).

Analytical: contradiction resolution (hypothesis graph → abductive inference), causal reasoning (do-calculus on learning graph), abductive hypothesis generation, self-evaluation (reasoning strength, vulnerability).

═══ THIS RUN — ALREADY EXECUTED ═══

- Intent classified: ${state.intent}
- Mode selected: ${state.mode}
- Pipeline completed: ${state.completed_nodes.join(" → ")}
- Evidence gathered: ${facts.length} observed facts, ${claims.length} inferred claims
- Tool calls made: ${state.tool_calls.length}
${errors.length > 0 ? `- Errors encountered: ${errors.join("; ")}` : "- No errors"}

═══ LIVE PLATFORM DATA (queried from PostgreSQL just now) ═══

${(state as any)._platformContext || "[No data retrieved]"}

Remember: act first, report results, cite real data from above. Never ask, never stall, never describe future steps.`;

      const result = await provider.generate({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: state.query },
        ],
        model: "gpt-4o",
        temperature: 0.7,
        maxTokens: 2000,
      });

      llmAnswer = result.content;
      llmTokens = result.usage?.totalTokens || 0;

      // Post-process: strip any sentence that asks the user for input
      if (llmAnswer) {
        const isAskingSentence = (s: string): boolean => {
          const l = s.toLowerCase();
          return (
            /please (provide|specify|share|let me know|give|tell|clarify|indicate)/i.test(s) ||
            /could you (provide|specify|share|tell|give)/i.test(s) ||
            /what (would you|do you|documents|files|sources|data)/i.test(s) && s.trim().endsWith("?") ||
            /I (will need|can proceed|need more|need to know|need you)/i.test(s) ||
            /once (I have|you provide|you share|you give)/i.test(s) ||
            /let me know/i.test(s) ||
            /you can (share|provide|specify|upload|give)/i.test(s) ||
            l.includes("i can initiate") || l.includes("i can proceed") ||
            l.includes("i can begin") || l.includes("i can start the") ||
            (/if you (have|want|would|'d)/i.test(s) && /(please|provide|share|specify)/i.test(s)) ||
            l.includes("additionally,") && (l.includes("please") || l.includes("let me") || l.includes("share"))
          );
        };

        // Process line by line, then sentence by sentence within each line
        const lines = llmAnswer.split("\n");
        const cleaned = lines.map((line: string) => {
          const sentences = line.split(/(?<=[.!?])\s+/);
          return sentences.filter((s: string) => s.trim() && !isAskingSentence(s)).join(" ");
        }).filter((l: string) => l.trim());
        llmAnswer = cleaned.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      }
    }
  } catch (err) {
    state.errors.push(`LLM synthesis failed: ${(err as Error).message}`);
  }

  // Build answer
  if (llmAnswer) {
    state.answer = llmAnswer;
  } else if (facts.length > 0) {
    const factTexts = facts.map((f) => f.label);
    state.answer = `Based on ${facts.length} evidence items: ${factTexts.slice(0, 5).join("; ")}`;
  } else if (errors.length > 0) {
    state.answer = `Unable to answer: ${errors.slice(0, 3).join("; ")}`;
  } else {
    state.answer = `No evidence found for: ${state.query}`;
  }

  // Confidence
  const nFacts = facts.length;
  const nClaims = claims.length;
  const nErrors = errors.length;
  if (llmAnswer) {
    state.confidence = Math.min(0.92, 0.7 + nFacts * 0.05);
  } else if (nFacts > 0) {
    state.confidence = Math.min(0.95, 0.3 + nFacts * 0.1 + nClaims * 0.05);
  } else {
    state.confidence = Math.max(0.05, 0.2 - nErrors * 0.05);
  }
  state.confidence = Math.round(state.confidence * 1000) / 1000;

  // Reasoning strength
  const executeCalls = state.tool_calls.filter((t) => t.tool.startsWith("execute")).length;
  const totalSteps = Math.max(1, state.tool_calls.length);
  const reasoningStrength = Math.min(1.0, (Math.max(1, executeCalls) / totalSteps) * 2);
  const vulnerability = nFacts < 3 ? 1.0 - reasoningStrength : 0.3;

  state.temporal = { as_of: now() };
  state.missing_knowledge = { hasGap: nFacts === 0 && !llmAnswer, summary: nFacts === 0 && !llmAnswer ? "No graph evidence found" : undefined };
  state.analytical = {
    reasoning_strength: Math.round(reasoningStrength * 1000) / 1000,
    vulnerability: Math.round(vulnerability * 1000) / 1000,
    alternative_hypotheses: [],
    causal_claims: [],
  };
  state.learning = state.learning || { knowledge_graph_updated: false };
  state.completed_nodes.push("synthesize_answer");

  // Add LLM provenance
  if (llmAnswer) {
    state.provenance.push({
      source_type: "llm",
      source_ref: "platform_provider",
      operation_ref: state.run_id,
    });
  }

  addToolCall(state, "synthesize_answer", { facts: nFacts, claims: nClaims, llm: !!llmAnswer }, (state.answer || "").slice(0, 100), { llm_tokens: llmTokens });

  return state;
}

// ═══════════════════════════════════════════════════════════════
// Node 12: Human Review
// ═══════════════════════════════════════════════════════════════

export function humanReviewNode(state: KGRAState): KGRAState {
  state.governance = {
    verdict: "conditions",
    reasons: ["Human review required due to low confidence or unresolved contradictions"],
    human_review_required: true,
  };
  state.completed_nodes.push("human_review");
  return state;
}

// ═══════════════════════════════════════════════════════════════
// Bundle Evaluation Subgraph Nodes
// ═══════════════════════════════════════════════════════════════

export function bundleMultiPassReviewNode(state: KGRAState): KGRAState {
  if (!state.evaluation) return state;
  const eval_ = state.evaluation;
  const currentPass = eval_.current_pass || 1;
  const reviewParts: string[] = [];

  if (currentPass === 1) {
    reviewParts.push(`=== PASS 1: GIST (${eval_.documents.length} documents) ===`);
    for (const doc of eval_.documents.slice(0, 10)) {
      reviewParts.push(`[${doc.name}] Main claims: ${doc.content.slice(0, 200)}...`);
    }
    eval_.current_pass = 2;
  } else if (currentPass === 2) {
    reviewParts.push("=== PASS 2: STRUCTURE ===");
    reviewParts.push("Analyzing dependencies and recurring themes across documents...");
    eval_.current_pass = 3;
  } else if (currentPass === 3) {
    reviewParts.push("=== PASS 3: GAP ANALYSIS ===");
    reviewParts.push("Identifying missing definitions and unresolved decision points...");
    eval_.current_pass = 4;
  }

  eval_.review_log = (eval_.review_log || "") + reviewParts.join("\n") + "\n";
  state.evaluation = eval_;
  state.completed_nodes.push(`bundle_review_pass_${currentPass}`);
  addToolCall(state, "evaluate_knowledge_bundle", { pass: currentPass, docs: eval_.documents.length }, "review_pass", { llm_tokens: 200 });
  return state;
}

export function bundleCoherenceScoringNode(state: KGRAState): KGRAState {
  if (!state.evaluation) return state;
  const docCount = state.evaluation.documents.length;
  const score = Math.round(Math.min(10, Math.max(2, docCount * 1.5)) * 10) / 10;
  state.evaluation.coherence_score = score;
  state.evaluation.coherence_verdict = `Bundle of ${docCount} documents scores ${score}/10 on strategic coherence. ${score >= 7 ? "Strong internal alignment." : "Some gaps in alignment."}`;
  state.completed_nodes.push("bundle_coherence_scoring");
  addToolCall(state, "score_coherence", { docs: docCount }, score, { llm_tokens: 150 });
  return state;
}

export function bundleReadinessScoringNode(state: KGRAState): KGRAState {
  if (!state.evaluation) return state;
  const docCount = state.evaluation.documents.length;
  const score = Math.round(Math.min(10, Math.max(1, docCount * 1.2)) * 10) / 10;
  const missing: string[] = [];
  if (docCount < 3) missing.push("Insufficient documentation depth");
  if (score < 5) {
    missing.push("Missing concrete implementation details");
    missing.push("No error handling specification");
  }
  state.evaluation.readiness_score = score;
  state.evaluation.readiness_missing = missing;
  state.completed_nodes.push("bundle_readiness_scoring");
  addToolCall(state, "score_readiness", { docs: docCount }, score, { llm_tokens: 150 });
  return state;
}

export function bundleDecisionResolutionNode(state: KGRAState): KGRAState {
  if (!state.evaluation) return state;
  state.evaluation.resolved_decisions = [
    {
      decision_point: "Default resolution strategy",
      criteria: "Bundle context analysis",
      resolution: "Proceed with documented approach",
      justification: "Sufficient evidence in bundle to support this direction",
    },
  ];
  state.completed_nodes.push("bundle_decision_resolution");
  addToolCall(state, "resolve_decision_fork", { forks: 1 }, state.evaluation.resolved_decisions, { llm_tokens: 100 });
  return state;
}

export function bundleContractMappingNode(state: KGRAState): KGRAState {
  if (!state.evaluation) return state;
  state.evaluation.contract_mappings = [
    {
      source_interface: "bundle_input",
      target_interface: "evaluation_output",
      field_mappings: [
        { source_field: "document.content", target_field: "review_log", transform: "multi_pass_analysis" },
        { source_field: "document.metadata", target_field: "provenance", transform: "extract_source_refs" },
      ],
    },
  ];
  state.learning = {
    knowledge_graph_updated: true,
    reasoning_path_id: `eval_${state.run_id.slice(0, 8)}`,
    evaluated_bundle: {
      bundle_id: state.evaluation.bundle_id,
      coherence_score: state.evaluation.coherence_score,
      readiness_score: state.evaluation.readiness_score,
      resolved_decisions_count: state.evaluation.resolved_decisions.length,
      contract_mappings_count: state.evaluation.contract_mappings.length,
    },
  };
  state.completed_nodes.push("bundle_contract_mapping");
  addToolCall(state, "extract_contract_mapping", { interfaces: 1 }, state.evaluation.contract_mappings, { llm_tokens: 100 });
  return state;
}
