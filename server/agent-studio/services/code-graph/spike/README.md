# Code Graph Parser Spike — Boundary Directory

All spike code lives under this directory. Source-scan tested in
`tests/agent-studio/code-graph-spike-boundary.test.ts`.

Hard rules pinned:
- No tree-sitter imports outside this directory tree.
- No `neo4j-driver` imports anywhere in this tree (projection
  writes flow through `services/graph/repository/**`).
- No `process.env.*_API_KEY` reads (parsing is local-CPU).

ADR: `docs/implementation/agent-studio-code-graph-parser-spike-2026.md`.
