# Agent Studio — Text2Cypher Query Guardrails — ADR

**Owner:** Agent Studio module + Governance
**Phase:** Native Graph Workspace — Phase 1 / Phase 12 / Phase 12.5
**Status:** Adopted

---

## 1. Decision

### 1.1 Read-only by default

All Text2Cypher generated queries are read-only. The query parser rejects any query containing forbidden keywords:
- `CREATE`, `MERGE`, `SET`, `DELETE`, `DETACH`, `REMOVE`, `DROP`
- `LOAD CSV`, `CALL apoc.create.*`, `CALL apoc.merge.*`, `CALL apoc.refactor.*`
- Any procedure call from a non-allowlisted set.

### 1.2 Allowlist

- `MATCH`, `OPTIONAL MATCH`, `WHERE`, `RETURN`, `WITH`, `UNWIND`, `ORDER BY`, `LIMIT`, `SKIP`, `COLLECT`, `COUNT`, `MIN`, `MAX`, `SUM`, `AVG`.
- Procedures: `db.schema.*`, `apoc.path.*` (read-only path procedures), explicitly listed graph algorithms (Phase 13.5).

### 1.3 Validation pipeline

```
LLM-generated Cypher
    ↓
Lexer/parser rejects forbidden tokens
    ↓
AST validator confirms read-only
    ↓
Permission filter check (clauses must include user-role filter)
    ↓
Cost estimate (EXPLAIN) — reject if estimated rows > limit
    ↓
Execute
    ↓
Result post-filter (permission-aware)
```

### 1.4 Mutation path

If a Graph Agent run determines a graph mutation is needed:
1. Agent creates a graph change proposal (Phase 11.5).
2. Proposal goes through approval (existing scaffolding).
3. On approval: Postgres source-of-truth update.
4. Projection sync updates Neo4j.
5. Agent does NOT directly execute mutation Cypher.

### 1.5 Audit

Every Text2Cypher run is logged in `ags_text2cypher_runs`:
```sql
CREATE TABLE ags_text2cypher_runs (
  id SERIAL PRIMARY KEY,
  retrieval_run_id INTEGER REFERENCES ags_retrieval_runs(id),
  user_query TEXT NOT NULL,
  generated_cypher TEXT NOT NULL,
  validation_result VARCHAR(50) NOT NULL,         -- 'allowed', 'rejected_forbidden', 'rejected_cost', 'rejected_permission'
  rejection_reason TEXT,
  executed BOOLEAN NOT NULL DEFAULT FALSE,
  result_count INTEGER,
  duration_ms INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 1.6 Source-scan test

```typescript
// tests/agent-studio/text2cypher-mutation-blocked.test.ts
// Asserts the validator rejects every forbidden token.
```

## 2. Acceptance

- [x] Allowlist locked.
- [x] Validation pipeline defined.
- [x] Mutation path defined.
- [x] Audit table defined.
- [x] Source-scan test mandated.
- [ ] Phase 12 validator ships.
- [ ] Phase 12.5 source-scan test ships.
