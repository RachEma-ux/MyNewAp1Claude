# KGRA Technical Reference

> Knowledge Graph RAG Agent -- complete architecture, data flow, and code reference.
> Use this document to debug, extend, or recover any part of the KGRA pipeline.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [File Inventory](#2-file-inventory)
3. [Data Flow: End-to-End](#3-data-flow-end-to-end)
4. [Backend: Server Endpoints](#4-backend-server-endpoints)
5. [Backend: KGRA Engine Pipeline](#5-backend-kgra-engine-pipeline)
6. [Backend: Actions (Ingest, Build Graph, Stats)](#6-backend-actions)
7. [Backend: tRPC Router](#7-backend-trpc-router)
8. [Database Schema](#8-database-schema)
9. [Frontend: HTML Shell & Tabs](#9-frontend-html-shell--tabs)
10. [Frontend: App.js Functions](#10-frontend-appjs-functions)
11. [Visualization Engine](#11-visualization-engine)
12. [State Management & Tab Persistence](#12-state-management--tab-persistence)
13. [Performance Notes](#13-performance-notes)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. System Overview

KGRA is a self-contained knowledge graph + RAG system embedded in the MyNewAp1Claude platform. It:

1. **Ingests** the project codebase (`.ts`, `.tsx`, `.js`, `.jsx` files)
2. **Chunks** files into `document_chunks` in PostgreSQL
3. **Extracts** entities (pages, components, hooks, routes, tables) and relationships (imports, renders, defines) via regex
4. **Stores** the graph as JSON in `system_settings.kgra_graph_data`
5. **Serves** the graph through REST analytics endpoints
6. **Visualizes** it in an interactive force-directed canvas

```
User Chat Query
     |
     v
/api/kgra-proxy/run  (POST)
     |
     v
12-Node Pipeline (engine.ts)
     |
     +-- detectAllActions() --> ingestProject() + buildKnowledgeGraph()
     |
     +-- synthesizeAnswerNode() --> LLM generates answer
     |
     v
KGRAAnswer response
     |
     v
Frontend: auto-switches to RAG tab, shows ingest result
     |
     +-- "View OmniGraph" --> OmniGraph tab (stats + query)
     +-- "View Visualization" --> Canvas (force-directed graph)
```

---

## 2. File Inventory

### Backend (server/)

| File | Lines | Purpose |
|------|-------|---------|
| `server/kgra-agent/engine.ts` | 193 | Pipeline orchestrator -- runs the 12-node state machine |
| `server/kgra-agent/state.ts` | 252 | KGRAState type + factory (`createInitialState`) |
| `server/kgra-agent/nodes.ts` | 695 | All pipeline node functions (classify, plan, execute, synthesize...) |
| `server/kgra-agent/actions.ts` | 411 | Action executors: `ingestProject()`, `buildKnowledgeGraph()`, `getGraphStats()` |
| `server/kgra-agent/adapter.ts` | 86 | `KGRAAnswer` response type definition |
| `server/kgra-agent/router.ts` | 55 | tRPC router (health, run, evaluateBundle, getReasoningPath) |
| `server/kgra-agent/routing.ts` | 103 | Mode routing helpers (`shouldUseHumanReview`, `getFallbackChain`) |
| `server/_core/index.ts` | ~200 lines (544-746) | REST proxy routes (`/api/kgra-proxy/*`) |

### Frontend (client/public/kgra-ui/)

| File | Lines | Purpose |
|------|-------|---------|
| `index.html` | 120 | Shell layout: titlebar, sidebar rail, tabs, canvas, chat |
| `app.js` | ~2550 | All client logic: tabs, graph viz, chat, filters, force layout |
| `styles.css` | 446 | Full stylesheet (dark theme, responsive) |

### React Loader

| File | Purpose |
|------|---------|
| `client/src/pages/data-analysis/KGRAAgentPage.tsx` | Fetches `/kgra-ui` HTML, injects into React DOM |

---

## 3. Data Flow: End-to-End

### Flow 1: Chat Auto-Ingest

```
1. User opens Chat tab (first time)
   --> switchMainTab('chat')
   --> chatMessages.length === 0 --> renderChatWelcome()

2. User types query, clicks Send
   --> chatSend()
   --> POST /api/kgra-proxy/run  {query}
   --> shows "Searching & generating..." thinking indicator

3. Server receives query
   --> executeKGRARun({query, mode, workspace_id, session_id})
   --> creates KGRAState via createInitialState()

4. Pipeline runs 12 nodes:
   classifyIntentNode --> resolveDomainTermsNode --> loadSchemaSliceNode
   --> chooseModeNode --> planOperationNode --> validateOperationNode
   --> executeRetrievalNode [ACTIONS HAPPEN HERE]
   --> assembleEvidenceGraphNode --> updateTaskMemoryNode
   --> synthesizeAnswerNode

5. Inside executeRetrievalNode:
   --> detectAllActions(query) returns ["ingest_project", "build_graph"]
   --> executeAction("ingest_project"):
       - scanCodeFiles() finds all .ts/.tsx/.js/.jsx <= 60KB
       - INSERT into documents table (one row per file)
       - chunkText() at 2000 chars, first 5 chunks per file
       - INSERT into document_chunks table
   --> executeAction("build_graph"):
       - SELECT first chunk per file from document_chunks (chunk_index=0)
       - Extract entities by path/content regex
       - Extract relationships by import/JSX/route regex
       - UPSERT into system_settings key='kgra_graph_data' as JSON

6. synthesizeAnswerNode calls LLM with platform context + action results

7. Server returns KGRAAnswer:
   {answer, mode, confidence, observed_facts: [...action results...]}

8. Client receives response:
   --> checks observed_facts for 'action_ingest_project' / 'action_build_graph'
   --> if found: switchMainTab('rag'), populate intake-result card
   --> persists result HTML in lastIngestResultHTML
   --> shows buttons: View OmniGraph, View Visualization, Back to Chat
```

### Flow 2: OmniGraph Tab

```
1. User clicks "View OmniGraph" or OmniGraph tab
   --> switchMainTab('graphrag')
   --> renderGraphRAGTab()

2. Renders query interface:
   - Query input + mode buttons (Auto Route, Local, Global, DRIFT, Hybrid)
   - Extraction mode selector
   - Schema selector

3. Calls loadGraphStats():
   --> GET /api/kgra-proxy/graphrag/stats
   --> calls getGraphStats() in actions.ts
   --> reads kgra_graph_data from system_settings
   --> returns {entityCount, relationshipCount, typeCounts}

4. Displays Knowledge Graph card:
   - Entity/relationship/community/report/cache counts
   - "View Graph" button --> switches to Visualization tab
   - "Refresh" button --> reloads stats

5. Services panel: MCP Tools, Workflows, Agents, Analytics, Traces, Contracts
6. Query Router display: 25 rules, 3 stages
```

### Flow 3: Visualization Tab

```
1. User clicks "View Visualization" or Visualization tab
   --> switchMainTab('graph')
   --> renderGraphTab()
   --> initGraphCanvas() + loadGraphData()

2. loadGraphData():
   --> GET /api/kgra-proxy/graphrag/stats
   --> GET /api/kgra-proxy/v1/analytics/entities   (returns all entities)
   --> GET /api/kgra-proxy/v1/analytics/relationships (returns all rels)
   --> if entities > 200: sort by connections DESC, keep top 200
   --> filter edges to only those between visible nodes
   --> build _nodeMap (Map for O(1) lookups)
   --> runForceLayoutAnimated()

3. runForceLayoutAnimated():
   --> iterates via requestAnimationFrame (non-blocking)
   --> each frame: repulsion (O(n^2)), attraction (edges), center gravity
   --> calls drawGraph() each frame
   --> auto-stops after maxIter frames

4. drawGraph():
   --> clears canvas
   --> filters visible nodes/edges through isNodeVisible/isEdgeVisible
   --> draws edges (lines with type labels at midpoint)
   --> draws nodes (circles, sized by connections, colored by TYPE_COLORS)
   --> draws labels, path glows, selection highlights
   --> updates stats overlay: "200/4821 nodes, 1234/14136 edges, 1.0x"

5. User interactions:
   - Pan: click+drag canvas
   - Zoom: scroll wheel
   - Select node: click --> shows detail panel
   - Drag node: click+hold --> repositions
   - Filter: toggle types/rels, adjust weight slider
   - Layout: Force / Hierarchy / Circular
   - Path mode: click source, click target --> highlights shortest path
```

---

## 4. Backend: Server Endpoints

All routes are defined in `server/_core/index.ts` (lines 544-746).

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/kgra-proxy/health` | GET | Returns `{status: "healthy", version: "2.0.0-native", engine: "typescript"}` |
| `/api/kgra-proxy/run` | POST | Execute KGRA query. Body: `{query, mode?}`. Returns `KGRAAnswer`. |
| `/api/kgra-proxy/graphrag/stats` | GET | Graph statistics via `getGraphStats()` |
| `/api/kgra-proxy/graphrag/query/:mode` | POST | GraphRAG query in specific mode (local/global/drift/hybrid) |
| `/api/kgra-proxy/graph/data` | GET | Raw graph nodes/edges from `ragdb` |
| `/api/kgra-proxy/pipelines/` | GET | Returns hardcoded pipeline definition |
| `/api/kgra-proxy/intake` | POST | Ingest files via `ingestProject()` |
| `/api/kgra-proxy/v1/analytics/entities?hub_count=N` | GET | Server-filtered entities from `ragdb` (hub+neighbor, default 10 hubs, max 300 nodes) |
| `/api/kgra-proxy/v1/analytics/relationships` | GET | All relationships from `ragdb` |
| `/api/kgra-proxy/v1/analytics/summary` | GET | Summary stats for OmniGraph panel |
| `/api/kgra-proxy/v1/mcp/tools` | GET | 5 MCP tools: query_kgra, get_reasoning_path, etc. |
| `/api/kgra-proxy/v1/workflows` | GET | Available workflows list |
| `/api/kgra-proxy/lineage` | GET | Traces/events (stub, returns empty) |
| `/api/kgra-proxy/demo/load` | POST | Load demo data (A Christmas Carol) |

### Analytics Endpoint Detail

**`/v1/analytics/entities?hub_count=N`**:
```
Database: ragdb (dedicated RAG Knowledge Graph DB)
Tables: kgra_entities + kgra_relationships

1. Query all entities with connection degree (in+out from kgra_relationships)
2. If total <= 300: return all
3. Otherwise: hub+neighbor strategy:
   - Pick top N hubs by connection count (default N=10, range 5-50)
   - Find all neighbors of hubs via kgra_relationships
   - If neighbors > 300: trim by connection count, keep hubs
4. Returns: { id: name, name: shortName, type, connections, community }
```

**`/v1/analytics/relationships`**:
```
Database: ragdb
SELECT from kgra_relationships JOIN kgra_entities (source + target)
Returns: { source_id, target_id, source_name, target_name, type, weight }
Client filters to only edges where both endpoints are in the visible entity set.
```

---

## 5. Backend: KGRA Engine Pipeline

**File:** `server/kgra-agent/engine.ts`

The engine runs a 12-node sequential pipeline with conditional routing:

```
executeKGRARun(params)
  |
  createInitialState(query, runId, requestId)
  |
  runPipeline(state)
  |
  +-- 1. classifyIntentNode(state)       // Regex intent detection
  +-- 2. resolveDomainTermsNode(state)   // Extract capitalized terms
  +-- 3. loadSchemaSliceNode(state)      // Load schema metadata
  +-- 4. chooseModeNode(state)           // Select runtime mode
  |
  +-- [if mode === 'bundle_evaluation'] --> runBundleSubgraph()
  +-- [if mode === 'human_review']      --> humanReviewNode()
  +-- [else]                            --> runMainFlow()
  |
  runMainFlow(state):
    +-- 5. planOperationNode(state)        // Plan retrieval strategy
    +-- 6. validateOperationNode(state)    // Validate query safety
    +-- [if !validated, try fallback chain]
    +-- 7. executeRetrievalNode(state)     // ASYNC: runs actions + DB queries
    +-- 8. expandRankPathsNode(state)      // Only if path_reasoning mode
    +-- 9. assembleEvidenceGraphNode(state) // Build evidence graph
    +-- 10. updateTaskMemoryNode(state)    // Log memory
    +-- 11. synthesizeAnswerNode(state)    // ASYNC: calls LLM
    +-- 12. humanReviewNode(state)         // Conditional
  |
  stateToAnswer(state) --> KGRAAnswer
```

### State Type: `KGRAState`

Defined in `server/kgra-agent/state.ts`. Key fields:

| Field | Type | Description |
|-------|------|-------------|
| `query` | string | User's input |
| `intent` | IntentType | Classified intent (factual, comparative, learning_request, etc.) |
| `mode` | RuntimeMode | Execution mode (direct_query, path_reasoning, graphrag_local, etc.) |
| `observed_facts` | `{id, label, sourceRef}[]` | Facts discovered during execution |
| `evidence_nodes` | `EvidenceNode[]` | Evidence graph nodes |
| `evidence_edges` | `EvidenceEdge[]` | Evidence graph edges |
| `answer` | string | Final synthesized answer |
| `confidence` | number | Answer confidence (0-1) |
| `cost` | CostTracker | Token/query/MCP cost tracking |
| `completed_nodes` | string[] | Pipeline nodes that ran |

### Intent Types

```
factual | comparative | exploratory | temporal | hypothetical
learning_request | research_directive | ontology_design
contradiction_resolution | cross_agent_collaboration
reasoning_path_reuse | self_evaluation | bundle_evaluation
```

### Runtime Modes

```
direct_query | path_reasoning | graphrag_local | graphrag_global
drift | basic_rag | human_review | self_learning
expertise_building | research_mode | cross_agent_collaboration
reasoning_path_reuse | bundle_evaluation
```

---

## 6. Backend: Actions

**File:** `server/kgra-agent/actions.ts`

### `detectAllActions(query)` (line 45)

Tests query against regex patterns and returns matching action names:
- `/ingest|scan|import|load.*files/i` --> `"ingest_project"`
- `/build.*graph|knowledge.*graph|create.*graph/i` --> `"build_graph"`
- `/graph.*stat|show.*graph|graph.*info/i` --> `"graph_stats"`
- `/query.*graph|search.*graph|find.*in.*graph/i` --> `"query_graph"`

Auto-chains: if ingest detected + query contains "graph/rag/knowledge", adds `"build_graph"`.

### `ingestProject(folderPath?)` (line 105)

1. Calls `scanCodeFiles(PROJECT_ROOT)`:
   - Recursively walks directories
   - Skips: `node_modules`, `.git`, `dist`, `.next`, `.cache`, `__tests__`
   - Accepts: `.ts`, `.tsx`, `.js`, `.jsx` files <= 60KB
2. For each file:
   - Creates document record in `documents` table
   - Chunks at 2000 chars via `chunkText()`, keeps first 5 chunks
   - Inserts chunks into `document_chunks` table
3. Returns summary: `"Ingested N docs, M chunks, X KB"`

### `buildKnowledgeGraph()` (line 181)

1. Reads first chunk per file (`chunk_index = 0`) from `document_chunks` (max 2000)
2. **Entity extraction** by filename/path analysis:
   - `/pages/` --> type `"page"`
   - `/components/` --> type `"component"`
   - `/hooks/` or `use[A-Z]` --> type `"hook"`
   - `router` in name --> type `"router"`
   - `drizzle/` or `schema` --> type `"schema"`
   - `pgTable("name")` in content --> type `"db_table"`
3. **Relationship extraction** via regex on chunk content:
   - `import {...} from "..."` --> `imports` relationship
   - `<ComponentName` in JSX --> `renders` relationship
   - `path="/route"` --> `routes_to` relationship
   - `trpc.router.method` --> `calls_api` relationship
   - `export function name` --> `exports` relationship
4. Writes to `ragdb` (dedicated RAG database):
   - DELETE old data from `kgra_relationships`, `kgra_entities`, `kgra_build_runs`
   - Batch INSERT entities (500/batch) into `kgra_entities`
   - Build name-to-id map from RETURNING clause
   - Batch INSERT relationships into `kgra_relationships`
   - INSERT build metadata into `kgra_build_runs`

### `getGraphStats()` (line 349)

Queries `kgra_build_runs` in ragdb (latest build), returns entity/relationship counts + type breakdown.

---

## 7. Backend: tRPC Router

**File:** `server/kgra-agent/router.ts`

```typescript
kgraAgentRouter = router({
  health:           protectedProcedure.query(...)         // Health check
  run:              protectedProcedure.mutation(...)       // Execute KGRA query
  evaluateBundle:   protectedProcedure.mutation(...)       // Bundle evaluation
  getReasoningPath: protectedProcedure.query(...)          // Get reasoning path
})
```

All procedures require authentication (`protectedProcedure`).

---

## 8. Database Schema

### Database Architecture

```
mynewap1claude (main DB)          ragdb (dedicated RAG DB)
├── documents                     ├── kgra_entities
├── document_chunks               ├── kgra_relationships
├── system_settings               └── kgra_build_runs
└── 248 other app tables

Flow: ingestProject() writes to main DB (documents, chunks)
      buildKnowledgeGraph() reads chunks from main DB, writes graph to ragdb
      Visualization reads from ragdb via /v1/analytics/* endpoints
```

**Connection:** `server/rag/connection.ts` exports `getRagDb()` (lazy Drizzle instance)
**Seed:** `server/rag/seed.ts` creates tables + migrates JSON blob on first run
**Schema:** `drizzle/tables/ragdb.ts` defines table types

### `kgra_entities` table (ragdb)

| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | Auto-increment |
| name | text | Full entity name (e.g., `"server/chat/page.tsx"`) |
| short_name | varchar(500) | Display label (e.g., `"page.tsx"`) |
| entity_type | varchar(50) | `"page"`, `"component"`, `"hook"`, `"route"`, `"db_table"`, `"file"`, etc. |
| mentions | integer | Mention count |
| directory | varchar(500) | Directory grouping |
| source_doc_id | integer | Reference to documents.id in main DB (not a FK) |
| build_id | varchar(100) | Groups rows by build run |
| created_at | timestamp | Creation time |

Indexes: `name`, `entity_type`, `build_id`

### `kgra_relationships` table (ragdb)

| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | Auto-increment |
| source_entity_id | integer FK | References kgra_entities.id (CASCADE delete) |
| target_entity_id | integer FK | References kgra_entities.id (CASCADE delete) |
| relationship_type | varchar(50) | `"imports"`, `"renders"`, `"defines"`, `"routes_to"`, etc. |
| weight | integer | Edge weight (default 1) |
| build_id | varchar(100) | Groups rows by build run |
| created_at | timestamp | Creation time |

Indexes: `source_entity_id`, `target_entity_id`, `relationship_type`, `build_id`

### `kgra_build_runs` table (ragdb)

| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | Auto-increment |
| build_id | varchar(100) UNIQUE | Build timestamp |
| entity_count | integer | Total entities in this build |
| relationship_count | integer | Total relationships |
| chunk_count | integer | Chunks processed |
| type_counts | jsonb | Entity type breakdown |
| status | varchar(50) | `"completed"` |
| built_at | timestamp | Build time |

### `documents` table (main DB)

| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | Auto-increment |
| workspaceId | integer | Always 1 for KGRA |
| filename | varchar | e.g., `"KGRAAgentPage.tsx"` |
| fileType | varchar | `"ts"`, `"tsx"`, `"js"`, `"jsx"` |
| fileSize | integer | Bytes |
| fileUrl | varchar | `"file://path/to/file"` |
| fileKey | varchar | Relative path from project root |
| status | varchar | `"processed"` |
| title | varchar | Filename |
| wordCount | integer | Approximate word count |

### `document_chunks` table

| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | Auto-increment |
| documentId | integer FK | References documents.id |
| content | text | Chunk text (up to 2000 chars) |
| chunkIndex | integer | 0-4 per document |
| heading | varchar | File path used as heading |

---

## 9. Frontend: HTML Shell & Tabs

**File:** `client/public/kgra-ui/index.html`

```
+-------------------------------------------+
|  KGRA Agent         API Docs  ReDoc  [cam] |  <-- titlebar
+------+------------------------------------+
|      |  [RAG] [OmniGraph] [Viz] [Chat]    |  <-- main-tabs
| Rail |                                     |
|  +   |  main-body  (or chat-body)         |  <-- content area
| Panel|                                     |
|      |                                     |
+------+------------------------------------+
|  status dot  ·  v2.0.0  ·  Healthy        |  <-- footer
+-------------------------------------------+
```

**Tab HTML** (lines 72-77):
```html
<button class="main-tab active" data-tab="rag" onclick="switchMainTab('rag')">RAG</button>
<button class="main-tab" data-tab="graphrag" onclick="switchMainTab('graphrag')">OmniGraph</button>
<button class="main-tab" data-tab="graph" onclick="switchMainTab('graph')">Visualization</button>
<button class="main-tab" data-tab="chat" onclick="switchMainTab('chat')">Chat</button>
```

The Chat tab uses a separate `chat-body` div; all other tabs render into `main-body`.

---

## 10. Frontend: App.js Functions

**File:** `client/public/kgra-ui/app.js`

### Global State Variables (top of file)

| Variable | Type | Purpose |
|----------|------|---------|
| `activePipeline` | string/null | Currently selected pipeline |
| `currentPage` | string | Current page: `'home'` or pipeline name |
| `pipelines` | array | Pipeline list from `/api/kgra-proxy/pipelines/` |
| `activeMainTab` | string | Active tab: `'rag'`/`'graphrag'`/`'graph'`/`'chat'` |
| `chatMessages` | array | Chat message history |
| `healthData` | object/null | Last health check response |
| `lastIngestResultHTML` | string/null | Persisted auto-ingest result card HTML |
| `graphViz` | object | Full visualization state (nodes, edges, canvas, filters, etc.) |

### Key Functions

| Function | Line | Description |
|----------|------|-------------|
| `switchMainTab(tab)` | 794 | Tab switching -- updates active class, shows/hides content areas |
| `renderHome()` | 265 | RAG tab home: pipelines, intake form, adapters |
| `renderGraphRAGTab()` | 821 | OmniGraph tab: query interface, stats, services |
| `renderGraphTab()` | 1060 | Visualization tab: canvas, toolbar, filters |
| `loadGraphData()` | 1460 | Fetches entities/rels, caps to 200 nodes, starts layout |
| `runForceLayoutAnimated()` | after 1488 | Non-blocking force layout via requestAnimationFrame |
| `drawGraph()` | 1322 | Canvas render: edges, nodes, labels, stats overlay |
| `chatSend()` | ~1989 | Send chat message, POST to /run, handle response |
| `renderChatWelcome()` | ~1948 | Initial chat welcome message |
| `loadGraphStats()` | varies | Fetch graph stats for OmniGraph panel |
| `initGraphCanvas()` | 1162 | Set up canvas, resize handler, mouse events |
| `buildFilterUI()` | varies | Populate filter checkboxes from graph data |
| `applyFilters()` | varies | Apply type/rel/weight/community filters |
| `searchAndFocusEntity()` | 1490 | Search + pan to entity by name |
| `loadDemo()` | 1548 | Load "A Christmas Carol" demo dataset |
| `runForceLayout(iterations)` | 1419 | Blocking force layout (used by Demo) |

---

## 11. Visualization Engine

### graphViz Object

```javascript
const graphViz = {
  nodes: [],          // {id, label, type, connections, community, x, y, radius}
  edges: [],          // {source, target, sourceLabel, targetLabel, type, weight}
  _nodeMap: Map,      // id --> node (O(1) lookup, built in loadGraphData)
  canvas: null,       // <canvas> element
  ctx: null,          // CanvasRenderingContext2D
  width: 0, height: 0,
  offsetX: 0, offsetY: 0,  // pan offset
  scale: 1,                  // zoom level
  dragging: null,            // node being dragged
  panning: false,
  selected: null,            // selected node
  layout: 'force',           // 'force' | 'hierarchy' | 'circular'
  filters: { types, relTypes, weightMin, community },
  pathMode: false,           // shortest path mode
  pathSource: null, pathTarget: null,
  pathNodes: Set, pathEdges: Set,
  colorMode: 'type',         // 'type' | 'community'
  expansions: Map,
  comments: {},
};
```

### Type Colors

```javascript
const TYPE_COLORS = {
  FILE: '#3b82f6',       // blue
  PAGE: '#8b5cf6',       // purple
  COMPONENT: '#10b981',  // green
  HOOK: '#f59e0b',       // amber
  ROUTE: '#ef4444',      // red
  TABLE: '#06b6d4',      // cyan
  MODULE: '#6366f1',     // indigo
  ENTITY: '#888',        // gray (default)
  PERSON: '#6366f1', ORG: '#4caf50', PRODUCT: '#f59e0b',
  PROJECT: '#ef4444', CONCEPT: '#06b6d4', LOCATION: '#a855f7',
  EVENT: '#ec4899', REGULATORY_TERM: '#f97316',
};
```

### Node Cap & Performance

When entity count exceeds `MAX_VIS_NODES` (200):
- Entities sorted by `connections` DESC
- Top 200 kept
- Edges filtered to only include those where both source and target are in the visible set
- Stats overlay shows: `"Showing top 200 of 4821 entities (1234 edges)"`

### Force Layout (Animated)

`runForceLayoutAnimated()`:
- Uses `requestAnimationFrame` (non-blocking)
- Max iterations: `min(120, max(40, 8000 / nodeCount))`
- Repulsion: O(n^2) all-pairs with decaying force
- Attraction: spring force on edges via `_nodeMap` (O(1) lookup)
- Center gravity: 0.995 dampening
- Calls `drawGraph()` each frame for real-time animation

### Coordinate System

```
toScreen(worldX, worldY):
  screenX = (worldX + offsetX) * scale + width/2
  screenY = (worldY + offsetY) * scale + height/2

toWorld(screenX, screenY):
  worldX = (screenX - width/2) / scale - offsetX
  worldY = (screenY - height/2) / scale - offsetY
```

---

## 12. State Management & Tab Persistence

### Problem Solved

Switching away from the RAG tab and back caused the auto-ingest result to disappear because `renderHome()` rebuilds all HTML from scratch.

### Solution

- `lastIngestResultHTML` (global variable) stores the ingest result card HTML
- After auto-ingest completes, the HTML is saved to this variable
- `renderHome()` checks `lastIngestResultHTML` and re-injects it into `#intake-result`
- Also restores `#intake-source` value to `'file://MyNewAp1Claude/**'`

### Chat State

- `chatMessages[]` persists across tab switches (global array)
- Chat body is a separate `<div id="chat-body">` that is shown/hidden, not re-rendered

### Graph State

- `graphViz` object persists across tab switches (global)
- However, `renderGraphTab()` re-creates the canvas and calls `loadGraphData()` each time
- This means switching to Viz tab always reloads data and re-runs layout

---

## 13. Performance Notes

| Concern | Mitigation |
|---------|------------|
| 4821 entities too many for canvas | Capped to top 200 by connection count |
| O(n^2) force repulsion | Max 200 nodes = 20K pairs (fast) |
| O(n) edge lookups in drawGraph | Replaced `.find()` with `Map.get()` via `_nodeMap` |
| Blocking force layout | `runForceLayoutAnimated()` uses `requestAnimationFrame` |
| 1.7MB JSON graph data | Single DB read, parsed once server-side |
| 14136 relationships fetch | Filtered client-side to visible-node edges only |

---

## 14. Troubleshooting

### Visualization shows nothing

1. Check `kgra_graph_data` exists:
   ```sql
   SELECT length("settingValue"::text) FROM system_settings
   WHERE "settingKey" = 'kgra_graph_data';
   ```
   Should return > 0. If 0 or missing, re-run ingest.

2. Check analytics endpoints return data:
   ```bash
   curl -s http://localhost:3000/api/kgra-proxy/v1/analytics/entities | python3 -c "import sys,json; print(len(json.load(sys.stdin)))"
   ```
   Should print entity count (e.g., 4821).

3. Check browser console for errors in `loadGraphData()` or `drawGraph()`.

### RAG tab loses ingest result

If `lastIngestResultHTML` is `null`, the ingest either hasn't run or the page was fully reloaded. Re-trigger ingest from Chat tab or use the Ingest button on the RAG tab.

### OmniGraph stats show 0

Graph data hasn't been built yet. Either:
- Send a query in Chat that triggers auto-ingest
- POST to `/api/kgra-proxy/intake` manually
- Then hit the "Refresh" button on the OmniGraph tab

### Graph entities have wrong types

Entity types are extracted by filename path patterns in `buildKnowledgeGraph()` (actions.ts line 181+). If a file is miscategorized, check the regex patterns:
- Pages: `/pages/` in path
- Components: `/components/` in path
- Hooks: `/hooks/` in path or `use[A-Z]` in filename

### Force layout too slow

Reduce `MAX_VIS_NODES` in `loadGraphData()` (currently 200). For very large graphs (>5000 entities), consider 100 or fewer.

### Chat auto-ingest not triggering

The `detectAllActions()` function in actions.ts uses regex to detect ingest/graph keywords. Queries like "show me the codebase" or "create a RAG" trigger it. Plain questions like "what is X?" do not trigger ingest.
