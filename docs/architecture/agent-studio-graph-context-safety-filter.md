# Agent Studio — Graph Context Safety Filter — ADR

**Owner:** Agent Studio module + Governance
**Phase:** Native Graph Workspace — Phase 1 / Phase 12 / Phase 13
**Status:** Adopted

---

## 1. Decision

### 1.1 Pipeline

```
Retrieval results (graph paths + node IDs)
    ↓
Postgres source-record load
    ↓
Permission filter (user role / workspace / governance status)
    ↓
Context safety filter:
    - Raw artifact policy (no raw extraction artifacts in prompt)
    - Sensitivity policy (PII, secrets, code execution context)
    - Citation requirement (every block has source reference)
    - Tool execution context blocking
    ↓
Hidden node leak check (property-based test)
    ↓
Truncation (token budget)
    ↓
Output: governed context blocks ready for prompt assembly
```

### 1.2 Forbidden in prompt context

- Raw documents not yet promoted to Knowledge Units.
- Tool schemas without runtime eligibility check.
- Hidden / archived / deprecated source records.
- Retrieved content where source-record permission denies the user.
- Cypher template results that bypassed the permission filter.

### 1.3 Required in every emitted context block

- `source_kind`, `source_id`, `source_version_id` (citation)
- `governance_status` confirmed `active`
- Token count (for budget enforcement)
- `safety_filtered: false` flag (true triggers retry without that block)

### 1.4 Property-based test (Phase 21)

For any user role A and source records s1..sN where governance_status='hidden' for user A:
- No retrieval result contains s_i.
- No context block cites s_i.
- No graph path traverses through s_i.
- No Neo4j response includes s_i node identifier.

## 2. Acceptance

- [x] Pipeline locked.
- [x] Forbidden / required content defined.
- [x] Property-based test mandated.
- [ ] Phase 12 safety filter ships.
- [ ] Phase 21 property test passes.
