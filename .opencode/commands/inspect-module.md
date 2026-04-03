---
name: inspect-module
description: Inspect a module and produce a structured report covering architecture, boundaries, data flow, and health.
---

# Inspect Module

Inspect the specified module and produce a real structured report.

## Instructions

1. **Identify the module** — locate its directory, entry points, and boundaries
2. **Map the architecture** — routers, services, DB tables, UI pages
3. **Trace data flow** — how data enters, moves through, and exits the module
4. **Check boundaries** — does it leak into other modules? Does it own its state?
5. **Check health** — missing tables, dead routes, unused exports, broken imports
6. **Report findings** — structured, with file references

## Output Format

```
## Module Inspection: [Module Name]

### Location
- Directory: ...
- Entry point: ...
- Database: ...

### Architecture
| Layer | Files | Purpose |
|---|---|---|
| Router | ... | ... |
| Service | ... | ... |
| DB/Schema | ... | ... |
| UI Pages | ... | ... |

### Data Flow
1. User action → ...
2. API call → ...
3. DB query → ...
4. Response → ...

### Boundary Analysis
- Cross-module dependencies: ...
- State ownership: ...
- Leakage risks: ...

### Health Issues
| # | Severity | Description | File |
|---|---|---|---|
| 1 | ... | ... | ... |

### Summary
- Total files: ...
- Tables: ...
- Routes: ...
- Health: GOOD / WARNINGS / ISSUES
```
