# KGRA User Guide

> How to use the Knowledge Graph RAG Agent to ingest, explore, query, and visualize your codebase.

---

## Getting Started

The KGRA Agent is accessed from the app's navigation menu. It has four tabs:

| Tab | Purpose |
|-----|---------|
| **RAG** | Ingest files, manage pipelines, view intake results |
| **OmniGraph** | Query your knowledge graph, view stats and services |
| **Visualization** | Interactive force-directed graph canvas |
| **Chat** | Conversational AI that can auto-ingest and answer questions |

---

## Step 1: Ingest Your Codebase

There are two ways to ingest:

### Option A: Chat Auto-Ingest (Recommended)

1. Open the **Chat** tab
2. Type a query like `"create a RAG"` or `"ingest my codebase"`
3. The system will automatically:
   - Scan all `.ts`, `.tsx`, `.js`, `.jsx` files in the project
   - Chunk and store them in the database
   - Build a knowledge graph (entities + relationships)
   - Switch to the RAG tab showing the result

You'll see a card like:

```
KGRA Auto-Ingest                    [completed]
Source: MyNewAp1Claude/
Ingested 1512 code files (5026 chunks, 12232KB)
Built knowledge graph: 4821 entities, 14136 relationships

[View OmniGraph]  [View Visualization]  [Back to Chat]
```

### Option B: Manual Ingest

1. Open the **RAG** tab
2. In the **Source URI** field, enter a path (e.g., `./` for the project root)
3. Click **Ingest**
4. Or use **Browse files** to pick specific files

---

## Step 2: Explore the OmniGraph

Click the **OmniGraph** tab (or the "View OmniGraph" button after ingest).

### Query Your Graph

1. Type a question in the query box (e.g., `"What components use the Shell layout?"`)
2. Choose a query mode:

| Mode | Best For |
|------|----------|
| **Auto Route** | Let the system pick the best mode |
| **Local** | Questions about specific entities and their neighbors |
| **Global** | Corpus-wide summaries and overviews |
| **DRIFT** | Iterative follow-up questions |
| **Hybrid** | Combined local + global search |

3. Click the mode button to run the query

### Graph Statistics

The **Knowledge Graph** card shows:
- Entity count (total nodes)
- Relationship count (total edges)
- Community count (groups of related entities)
- Cache hits and staleness

Click **Refresh** to update stats. Click **View Graph** to open the Visualization tab.

### Services Panel

Quick access to:
- **MCP Tools** -- 5 built-in tools for querying and managing the graph
- **Workflows** -- LangGraph workflow pipelines
- **Agents** -- AutoGen agent configurations
- **Analytics** -- Export graph data
- **Traces** -- Audit trail of queries
- **Contracts** -- Abstract base class contracts (23 ABCs)

### Query Router

Shows the 3-stage routing system:
1. **Stage 1:** 25 YAML regex patterns classify your query
2. **Stage 2:** BERT classifier (MiniLM-L6) refines classification
3. **Stage 3:** Dynamic overrides based on coverage, ACL, budget, load, cache, feedback

---

## Step 3: Visualize the Knowledge Graph

Click the **Visualization** tab (or "View Visualization" after ingest).

### What You See

A force-directed graph where:
- **Nodes** = entities (files, pages, components, hooks, routes, tables)
- **Edges** = relationships (imports, renders, defines, routes_to, calls_api)
- **Node size** = number of connections (more connections = bigger)
- **Node color** = entity type (see color legend in top-right)

### Color Legend

| Color | Entity Type |
|-------|-------------|
| Blue | File |
| Purple | Page |
| Green | Component |
| Amber | Hook |
| Red | Route |
| Cyan | Table |
| Indigo | Module |

### Navigation

| Action | How |
|--------|-----|
| **Pan** | Click and drag the canvas background |
| **Zoom** | Scroll wheel (up = zoom in, down = zoom out) |
| **Select node** | Click on a node -- details appear at bottom |
| **Drag node** | Click and hold a node, then drag to reposition |

### Toolbar

| Button | Action |
|--------|--------|
| **Search** | Find and focus on a specific entity by name |
| **Reload** | Re-fetch graph data from the server |
| **Demo** | Load a demo dataset (A Christmas Carol) |
| **Filter** | Open/close the filter panel |
| **Layout** | Switch between Force, Hierarchy, and Circular layouts |
| **Color** | Switch between Type-based and Community-based coloring |
| **Path** | Enable path mode to find shortest path between two nodes |

### Filter Panel

Click the **Filter** button to open. You can filter by:
- **Entity Types** -- Toggle which types are visible (Page, Component, Hook, etc.)
- **Relationships** -- Toggle which relationship types are shown
- **Weight** -- Minimum edge weight slider
- **Community** -- Show only a specific community
- Click **Reset** to clear all filters

### Path Mode

1. Click the **Path** button to enable path mode
2. Click a **source node** (highlighted)
3. Click a **target node**
4. The shortest path between them is highlighted in blue
5. Click Path again to exit path mode

### Performance Note

For large codebases (thousands of entities), the visualization shows the **top 200 most-connected entities** for smooth interaction. The stats overlay shows the ratio (e.g., `200/4821 nodes`).

---

## Step 4: Chat with Your Knowledge Graph

The **Chat** tab provides a conversational interface over your ingested data.

### How It Works

1. Type a question and press Enter or click Send
2. The system runs a 12-node reasoning pipeline:
   - Classifies your intent
   - Plans a retrieval strategy
   - Queries the knowledge graph + database
   - Synthesizes an answer with an LLM
3. The response includes:
   - **Answer** -- The main response
   - **Evidence** -- Facts and claims that support the answer
   - **Provenance** -- Where the information came from
   - **Confidence** -- How confident the system is (0-100%)
   - **Cost** -- Token usage and estimated cost

### Example Queries

| Query | What Happens |
|-------|-------------|
| `"create a RAG"` | Triggers auto-ingest + graph build |
| `"what pages use the Shell component?"` | Queries the knowledge graph |
| `"how many database tables exist?"` | Queries platform metadata |
| `"explain the chat streaming architecture"` | Hybrid RAG + LLM synthesis |
| `"show me the import graph for server/agents"` | Graph traversal query |

### Chat Toolbar

At the bottom of the chat input:
- **RAG** -- Toggle RAG mode
- **OmniGraph** -- Toggle graph-enhanced queries
- **Hybrid** -- Toggle hybrid mode (both)

---

## Tips

1. **First time?** Start with Chat and type `"create a RAG"` to auto-ingest
2. **After code changes**, re-ingest to update the graph (it overwrites previous data)
3. **Use the OmniGraph tab** for structured queries with specific modes
4. **Use the Visualization tab** to understand your codebase structure at a glance
5. **Use filters** in Visualization to focus on specific entity types (e.g., only Pages + Components)
6. **Use Path mode** to trace how two parts of your codebase connect
7. **The graph is stored in PostgreSQL** -- it persists across server restarts

---

## Quick Reference: Entity Types in Your Graph

| Type | Source | Example |
|------|--------|---------|
| page | Files in `/pages/` | `KGRAAgentPage.tsx` |
| component | Files in `/components/` | `Shell.tsx`, `Button.tsx` |
| hook | Files in `/hooks/` or named `use*` | `useAuth.ts`, `useTRPC.ts` |
| route | `path="/..."` patterns in code | `/data-analysis/kgra-agent` |
| db_table | `pgTable("name")` in drizzle schema | `documents`, `system_settings` |
| module | Import paths | `../db/connection`, `@/lib/trpc` |
| router | Files with `router` in name | `kgraAgentRouter` |
| file | All other code files | `engine.ts`, `actions.ts` |

## Quick Reference: Relationship Types

| Type | Meaning | Example |
|------|---------|---------|
| imports | File imports a module | `engine.ts` imports `./state` |
| renders | File renders a component (JSX) | `App.tsx` renders `<Shell>` |
| defines | File defines a function/component/hook | `actions.ts` defines `ingestProject` |
| exports | File exports a function | `router.ts` exports `kgraAgentRouter` |
| routes_to | File defines a URL route | `App.tsx` routes to `/chat` |
| calls_api | File calls a tRPC method | `ChatPage` calls `trpc.chat.send` |
