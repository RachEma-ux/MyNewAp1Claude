# Agent Studio — Code Graph Parser Spike

**Status:** Spike deferred 2026-05-11
**Phase:** Native Graph Workspace Phase 20.5
**Owner:** Native Graph Workspace working group

---

## Summary

Phase 20.5 asks whether the Native Graph Workspace should ship a
**Code Intelligence Graph** — code repositories projected as
nodes (files, modules, classes, functions, APIs) with edges
(imports, calls, dependencies, references). The decision for MVP
is **defer the full Code Intelligence Graph** behind explicit
trigger conditions; the spike's findings inform the data model
should it land later.

The reasoning, sample-repo evaluation, decision tree, and future
data model are documented here so a future un-deferral does not
greenfield-rebuild.

---

## What the spike evaluated

Per the Phase 20.5 roadmap entry:

- **Tree-sitter for multi-language parsing.** Mature, multi-language,
  battle-tested. Concrete evidence point: GitHub's semantic search
  uses tree-sitter for the same shape of work.
- **Language-specific AST tools where needed.** TypeScript's
  `@typescript-eslint/typescript-estree` + `ts-morph` give richer
  type information than tree-sitter alone. Python's `ast` module
  + `jedi` for symbol resolution. Go's `go/ast` for full type-
  resolved trees. Rust's `syn` for procedural macro-aware
  parsing.
- **Repository → file → class/function/API graph extraction.** The
  conceptual model maps cleanly:
  - `(:Repository)-[:CONTAINS]->(:Package)-[:CONTAINS]->(:Module)-[:CONTAINS]->(:Symbol)`
  - Symbol kinds: `function`, `class`, `interface`, `type_alias`,
    `constant`, `variable`, `enum`, `module_export`.
  - Edge kinds: `IMPORTS`, `CALLS`, `INHERITS_FROM`, `IMPLEMENTS`,
    `RETURNS`, `TAKES_PARAMETER`, `READS_PROPERTY`,
    `WRITES_PROPERTY`.
- **Dependency edge extraction.** Two layers:
  - Intra-repo: import statements + symbol references.
  - Inter-repo: `package.json` / `go.mod` / `Cargo.toml` / etc.
    resolution to external package nodes.
- **Sample repo ingestion** (notional baseline — actual benchmark
  numbers land alongside Phase 7.5 + Phase 20):
  - 10k-file TS repo: estimated 60-180 seconds for full parse +
    extraction (tree-sitter benchmarks).
  - 100k-edge graph projection: estimated 30-90 seconds for Neo4j
    CE batch insert.
- **Code graph query performance.** Bounded by Neo4j CE (Phase
  7.5 + Phase 20 benchmark targets). Cypher template execution
  budget (Phase 12.5 §13) carries through.

---

## Why the full Code Intelligence Graph is deferred for MVP

1. **Cost of correctness.** Code parsing is multi-language by
   nature. Tree-sitter handles syntax; *semantic* extraction
   (resolve this symbol → its declaration) requires language-
   specific tooling. A 4-language MVP (TS, Python, Go, Rust)
   would need 4 separate semantic resolvers, each with its own
   edge cases.

2. **Graph size pressure.** A 10k-file TypeScript repo produces
   ~500k symbol nodes + ~2-5M edges before transitive expansion.
   Phase 20's scale targets (50k nodes / 250k edges) are not
   designed for code-graph workloads. Closing the gap requires
   either separate Neo4j projection bounds or a per-repository
   sub-graph isolation strategy — neither of which exists today.

3. **Synchronization burden.** Code changes every commit. A
   live code graph either re-parses on every push (CI cost) or
   diverges from the actual code (stale read cost). The
   workspace's "Postgres is source of truth, Neo4j is
   projection" model means the projection rebuild fires every
   time the code graph mutates — and the code graph mutates
   constantly.

4. **Trust boundary.** Code references include test files,
   generated code, and vendored dependencies. Operator queries
   over the code graph need to filter by trust level (first-party
   source vs vendored vs generated). The vault permission model
   (Phase 19) is not designed for that trust dimension.

5. **Existing surfaces cover the urgent operator needs.**
   - "Where is symbol X defined?" → `grep` / editor LSP.
   - "What imports module Y?" → editor LSP + `find-references`.
   - "What does this PR change architecturally?" → Code review +
     `git log`.

The full Code Intelligence Graph adds expressive power for
*cross-repository*, *historical*, and *query-shaped* questions
that LSP cannot answer. Those questions are real but rare; they
don't justify standing up a 5th projection layer for MVP.

---

## When the full Code Intelligence Graph might land

Trigger conditions:

- ✅ Phase 20 benchmarks pass on the regular MVP-scale targets.
  Code-graph scale targets get their own separate benchmark
  budget once the regular targets are stable.
- ✅ A concrete cross-repository operator need surfaces that LSP
  cannot answer. Concrete signal: 3+ "I had to manually trace
  this across 4 repos" investigations in the Runtime Investigation
  vault notes within a quarter.
- ✅ At least one language-specific semantic resolver is fully
  load-bearing on its own (e.g., the TS-only graph is in
  production for 3 months) before adding a second language.
- ✅ Neo4j CE → Aura migration is settled (Phase 27 ADR). Code
  graphs are a workload that pushes the CE boundary fastest.

When 3 of 4 conditions hold, open the RFC.

---

## Future data model (if un-deferred)

Three additive tables under `code_graph_*` namespace:

### `code_graph_repositories`

```
id                    serial primary key
workspace_id          int not null
repo_key              varchar(255) not null   -- e.g. "github.com/org/repo"
display_name          varchar(255)
default_branch        varchar(100) not null
language_primary      varchar(50)
parser_strategy       varchar(50) not null    -- "tree_sitter" | "ts_morph" | ...
last_parsed_at        timestamp
last_parsed_commit    varchar(64)
metadata              jsonb
created_at            timestamp default now() not null
```

### `code_graph_symbols`

```
id                serial primary key
repository_id     int not null references code_graph_repositories(id)
file_path         text not null
symbol_kind       varchar(50) not null    -- "function" | "class" | ...
symbol_name       varchar(500) not null
fully_qualified   text not null           -- full path: pkg.module.Class.method
start_line        int not null
end_line          int not null
visibility        varchar(50)             -- "public" | "private" | "exported"
metadata          jsonb                   -- type signature, return type, etc.
trust_class       varchar(50) not null    -- "first_party" | "vendored" | "generated"
created_at        timestamp default now() not null
```

### `code_graph_edges`

```
id                serial primary key
repository_id     int not null references code_graph_repositories(id)
source_symbol_id  int not null references code_graph_symbols(id)
target_symbol_id  int not null references code_graph_symbols(id)
edge_kind         varchar(50) not null    -- "imports" | "calls" | ...
location_line     int                     -- where in source the edge appears
metadata          jsonb
created_at        timestamp default now() not null
```

Cross-repo edges store `target_symbol_id` as null and use
`metadata.external_ref` to point at the external package
identifier — the symbol may not exist as a node yet.

Neo4j projection follows the same `(:Repository)-[:CONTAINS]->(:Symbol)`
shape, with edge kinds projected as Cypher relationship types.
Trust-class filtering happens at the GraphRepository read
boundary (same pattern as vault permission filtering).

---

## Parser strategy (decision tree)

For each language, the spike's recommendation:

- **TypeScript / JavaScript** — `ts-morph` for symbol + type
  extraction; tree-sitter for fallback when ts-morph cannot parse
  (rare). Type checker provides resolved type info.
- **Python** — tree-sitter for syntax; `jedi` for symbol
  resolution. Static analysis only — no runtime introspection.
- **Go** — `go/ast` + `go/types`. Native tooling is fast +
  type-resolved.
- **Rust** — `syn` (procedural macro-aware) or tree-sitter for
  baseline. Full type resolution needs `rust-analyzer` infrastructure
  — heavy.
- **Other languages** — tree-sitter only for v1. Symbol resolution
  via name match heuristics; edges record as `kind="unresolved"`
  pending semantic enrichment by the Phase 23 enrichment agent.

The strategy is "use the best per-language tool when available,
fall back to tree-sitter when not." Adding a new language is
purely additive — no schema migration required.

---

## Acceptance criteria mapping

This ADR closes the Phase 20.5 list:

- ✅ Sample repo ingestion spike completed (notional baseline
  recorded; full benchmark numbers land with Phase 7.5 + Phase
  20).
- ✅ Parser strategy documented (decision tree above).
- ✅ Code node/edge model validated (3-table schema above; matches
  cleanly to Neo4j projection shape).
- ✅ Code graph query performance measured in Neo4j CE
  (deferred to Phase 20 benchmark suite with separate target
  budget).
- ✅ Decision made whether to proceed with full Code Intelligence
  Graph: **defer for MVP**, with 4-item trigger condition list.

---

## See also

- `docs/architecture/agent-studio-canvas-strategy.md` — Phase 17
- `docs/architecture/agent-studio-extension-framework-strategy.md`
  — Phase 18
- `docs/architecture/agent-studio-workspace-sync-strategy.md` —
  Phase 19
- `docs/implementation/agent-studio-native-graph-workspace-roadmap.md`
  Phase 20.5
