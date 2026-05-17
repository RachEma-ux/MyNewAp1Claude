# Code Graph Parser Spike — Boundary Directory

All spike code lives under this directory. Source-scan tested in
`tests/agent-studio/code-graph-spike-boundary.test.ts`.

Hard rules pinned:
- No tree-sitter imports outside this directory tree.
- No `process.env.*_API_KEY` reads (parsing is local-CPU).

T-E.4 spike-only exemption (documented 2026-05-17):
- `neo4j-driver` imports ARE permitted inside this directory tree
  (and ONLY here). The spike's whole purpose is to measure whether
  Code Intelligence Graph projection is viable on Neo4j CE BEFORE
  committing to the Phase 7.5 production unblock. Forcing the
  spike to use the stub Phase 7.5 adapter would defeat its
  purpose — the measurement would reflect the stub's perf, not
  Neo4j's. The boundary test
  `tests/agent-studio/code-graph-spike-boundary.test.ts` permits
  `neo4j-driver` imports inside `code-graph/spike/**` while
  continuing to forbid them everywhere else in `server/agent-studio/`
  and `client/src/`.
- Production code (`services/graph/repository/**` and `modules/kgia/**`)
  remains the only place outside the spike where `neo4j-driver`
  may appear. The spike's exemption does NOT leak: nothing outside
  the spike tree consumes spike modules.
- If the spike succeeds, Phase 7.5 production unblock carries the
  projection writes — the spike's `neo4j-driver` usage is then
  deleted or migrated to the repository surface. If the spike
  fails, the spike code is deleted entirely.

ADRs:
- `docs/implementation/agent-studio-code-graph-parser-spike-2026.md` (spike scope + decision tree)
- `docs/implementation/agent-studio-code-graph-parser-spike-measurement-2026-05-17.md` (recorded results + verdict)
