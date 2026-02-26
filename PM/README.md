# PM Module — Source of Truth

This folder contains the **only two authoritative documents** for the PM add-on module.

All previous drafts, architectural guides, and incremental plans have been consolidated and removed.

## Documents

| File | Role |
|---|---|
| **PM-Full-Scope-OpenProject-Parity.md** | **SCOPE** — Complete feature map, database schema, UI pages, competitive advantages, and non-negotiable rules |
| **Full-Execution-Plan.md** | **EXECUTION** — Every task, file path, table definition, router, and UI page across 6 phases with enforcement rules |

## Rules

- These two files are the **single source of truth** for PM module development.
- No other documents override them.
- All implementation decisions must trace back to one of these files.
- If a conflict exists between any other document and these two, **these two win**.
