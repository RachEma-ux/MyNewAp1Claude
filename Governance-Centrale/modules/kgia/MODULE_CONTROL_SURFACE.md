# KGIA — Module Control Surface

## Entry Points (tRPC Procedures)

### Sources (CRUD)
| Procedure | Type | Auth | Governance |
|-----------|------|------|------------|
| `modules.kgia.sources.list` | query | protected | module guard |
| `modules.kgia.sources.get` | query | protected | module guard |
| `modules.kgia.sources.create` | mutation | governed | SSRF gate + action registry |
| `modules.kgia.sources.update` | mutation | governed | action registry |
| `modules.kgia.sources.delete` | mutation | governed | action registry |
| `modules.kgia.sources.testConnection` | mutation | protected | module guard |

### Sessions
| Procedure | Type | Auth | Governance |
|-----------|------|------|------------|
| `modules.kgia.sessions.list` | query | protected | module guard |
| `modules.kgia.sessions.create` | mutation | governed | action registry |

### Runs
| Procedure | Type | Auth | Governance |
|-----------|------|------|------------|
| `modules.kgia.runs.list` | query | protected | module guard |
| `modules.kgia.runs.get` | query | protected | module guard |
| `modules.kgia.runs.getEvidence` | query | protected | module guard |
| `modules.kgia.runs.getMemory` | query | protected | module guard |
| `modules.kgia.runs.execute` | mutation | governed | safety gate + action registry |

### Audit
| Procedure | Type | Auth | Governance |
|-----------|------|------|------------|
| `modules.kgia.audit.list` | query | protected | module guard |

### Benchmarks
| Procedure | Type | Auth | Governance |
|-----------|------|------|------------|
| `modules.kgia.benchmarks.listCases` | query | protected | module guard |
| `modules.kgia.benchmarks.createCase` | mutation | governed | action registry |
| `modules.kgia.benchmarks.runCase` | mutation | governed | action registry |
| `modules.kgia.benchmarks.listRuns` | query | protected | module guard |

## Safety Gates
1. **Source Registration:** SSRF check on endpoints (private IP block)
2. **Query Execution:** 15 blocked patterns + prefix check + hop/row limits + allowlist
3. **All mutations:** Action registry lookup (deny-by-default)

## Data Boundaries
- All data is workspace-scoped via `workspaceId` foreign keys
- No cross-workspace queries possible
- Evidence and memory graphs are run/session-scoped within workspace
- Credentials are stored as JSON (encrypted ref pattern)
