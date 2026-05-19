# Movies Sample Dataset — Attribution

`movies.cypher` is sourced verbatim from the upstream Neo4j sample repository:

- **Upstream:** https://github.com/neo4j-graph-examples/movies (`scripts/movies.cypher`)
- **License:** Apache License 2.0
- **Maintainer:** Neo4j, Inc.
- **Vendored at:** 2026-05-19 (commit pinned by Native Graph Workspace demo integration)

The dataset is the canonical Neo4j graph-database demonstration corpus — 32 movies, 131 unique people, and ~253 relationships across `:ACTED_IN`, `:DIRECTED`, `:PRODUCED`, `:WROTE`, `:REVIEWED`, and `:FOLLOWS` predicates. It is the dataset shown in Neo4j Browser's `:play movies` walkthrough.

The vendored copy is read-only and is consumed by `scripts/demos/seed-movies-demo-vault.ts`, which **does not** replay the Cypher against a graph database. The script parses entities + relationships out of the file, materializes them as Agent Studio vault notes with `[[wikilinks]]`, and lets the existing Vault → Knowledge Graph projection chain (per `CLAUDE.md` "Native Graph Workspace — Non-Build List") populate Neo4j organically — so the demo exercises the documented operator-visible path, not a side-channel Cypher import.

No modifications to `movies.cypher` are permitted in-tree. Bump the vendored copy by re-fetching the upstream `scripts/movies.cypher` and updating the date above.
