# Forbidden Access Audit

This document captures the **rules** that boundary-enforcement scripts apply,
and a snapshot of known violations to remediate.

## Rules

The following imports / accesses are **forbidden** and CI must fail on them:

1. Cross-module **repository** import
   - e.g. `import ... from "../prm/prm.repository"` from outside `server/prm/`.
2. Cross-module **DB connection** import
   - e.g. `import { getPrmDb } from "../prm/connection"` from outside `server/prm/`.
3. Cross-module **private service** import
   - e.g. `import { something } from "../prm/prm.service"` from outside `server/prm/`.
4. Cross-module **private schema** import
   - e.g. `import * as ... from "../../drizzle/tables/prmdb"` from outside `server/prm/`.
5. Cross-module **private seed/migration/internal-runtime** import
   - `seed.ts`, `migration.ts`, `worker/`, `boot.ts` private files.
6. **Coordinator** importing private module internals
   - `server/orchestrator/`, `server/platform/coordinator/` may not import any
     `*.repository.ts`, `*.connection.ts`, `seed.ts`, or private `*.service.ts`.
7. **Cross-module SQL queries**
   - A module file directly `JOIN`-ing two module-owned tables, or using
     `db.execute(sql\`SELECT … FROM other_module_table\`)` — banned.
8. **Foreign DB connections**
   - A module file calling another module's `getXxxDb()`.

## Allowed cross-module imports

Only these per-module files are public:

- `public-api.ts`
- `contracts.ts`
- `ports.ts`
- `events.ts`
- `handoffs.ts`
- `types.ts`

## Documented architectural exceptions

A small allow-list lives in `scripts/check-cross-module-sql.ts` and
`scripts/check-module-db-ownership.ts`. Currently:

- `kgraAgent::getRagDb` — KGRA Agent is a thin query façade over
  the RAG knowledge graph storage. It declares `dependsOn: ["rag"]` in
  its manifest and is treated as part of the same logical knowledge
  subsystem. It does not own its own DB.

New entries require an architecture review and a recorded justification.

## Known initial violations (baseline)

The first run of `scripts/check-module-boundaries.ts` produces the authoritative
list. Some pre-existing violations (kept and quarantined as part of the legacy
surface) are listed below; new code must not regress.

- `server/_core/index.ts` performs module-scoped seeding and proxying. This is
  acceptable **transitionally** because that file is the platform bootstrap;
  the Runtime Manager now owns the boot order. Module-internal imports inside
  `_core/index.ts` are flagged as `info` rather than `error` and tracked for
  removal.
- `server/routers.ts` imports module routers directly today. The new
  `router-composer.ts` reads the manifest list and re-exports them as
  `appRouter`. `routers.ts` has been converted to be the consumer of the
  composer, so no manual re-imports per module are required for new modules.
- A handful of cross-module helper imports in `server/agents/` and
  `server/services/` predate the modular refactor. They are not flagged as
  errors yet — they are quarantined under `legacyAllowList` in
  `scripts/check-module-boundaries.ts`.

## Remediation plan

- Each `legacyAllowList` entry must shrink monotonically. CI must fail if a
  new entry would be added.
- Per-module Reviewer agent reviews sweep the list each release and removes
  one or more entries.
- The pilot modules (PRM, PSM, Code Studio, Agent Studio, Sandbox WF, RAG,
  OpenRouter) carry **zero** entries — their migration completes when their
  list is empty.
