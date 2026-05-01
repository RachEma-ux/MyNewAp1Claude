# Module Database Ownership

Each strong module owns its own database. The DB connection is private to the
module. Cross-module SQL is forbidden — see `FORBIDDEN_ACCESS_AUDIT.md`.

| Module             | DB / Schema           | Connection                                  | Status            |
|--------------------|-----------------------|---------------------------------------------|-------------------|
| Platform core      | `appdb`               | `server/db/connection.ts` (`getDb`)         | Owned             |
| Governance         | `appdb` (gov schema)  | shares `getDb` — target `govdb`             | Schema today      |
| AI Types           | `appdb` (catalog/* tables) | shares `getDb`                         | Platform-core     |
| PRM                | `prmdb`               | `server/prm/connection.ts` (`getPrmDb`)     | Owned             |
| PSM                | `psmdb`               | `server/psm/connection.ts` (`getPsmDb`)     | Owned             |
| Code Studio        | `codedb`              | `server/code-studio/connection.ts`          | Owned             |
| Agent Studio       | `asdb`                | `server/agent-studio/db/connection.ts`      | Owned             |
| Sandbox WF         | `wfdb`                | `server/sandbox-wf/connection.ts`           | Owned             |
| RAG / KGRA         | `ragdb`               | `server/rag/connection.ts` (`getRagDb`)     | Owned             |
| Data warehouse     | `dwhdb`               | `server/data-analysis/data-warehouse/connection.ts` | Owned     |
| HR                 | `appdb` (hr-* tables) | shares `getDb` — target `hrdb`              | Schema today      |
| PS                 | `appdb` (ps-* tables) | shares `getDb` — target `psdb`              | Schema today      |
| PM Central         | `appdb` (pm tables)   | shares `getDb` — target `pmdb`              | Schema today      |
| OM                 | `appdb` (om tables)   | shares `getDb` — target `omdb`              | Schema today      |
| CV                 | `appdb` (cv tables)   | shares `getDb` — target `cvdb`              | Schema today      |
| OpenRouter         | `appdb`               | shares `getDb`                              | Schema today      |

## Rules

1. A module **must not** import another module's DB connection file or its
   private Drizzle schema files.
2. A module's runtime user **must** access only its own DB. (Enforced at the
   PostgreSQL role level in production; enforced at code level by
   `scripts/check-module-db-ownership.ts` in CI.)
3. Cross-module reads are allowed **only** through that module's `public-api.ts`
   or via the catalog (AI Types) projection.
4. Cross-module writes are allowed **only** via Module Gateway, Handoff
   Manager, or Coordinator — never by direct DB write.
5. The Coordinator owns no module data. It uses the Gateway/Handoff/Event Bus.

## DB env-var convention

| Module      | Env var                    | Default                                                     |
|-------------|----------------------------|-------------------------------------------------------------|
| Platform    | `DATABASE_URL`             | —                                                           |
| PRM         | `DATABASE_URL_PRMDB`       | `${DATABASE_URL → /prmdb}`                                  |
| PSM         | `DATABASE_URL_PSMDB`       | `${DATABASE_URL → /psmdb}`                                  |
| Code Studio | `DATABASE_URL_CODEDB`      | `${DATABASE_URL → /codedb}`                                 |
| Agent Studio| `DATABASE_URL_ASDB`        | `${DATABASE_URL → /asdb}`                                   |
| Sandbox WF  | `DATABASE_URL_WFDB`        | `${DATABASE_URL → /wfdb}`                                   |
| RAG         | `DATABASE_URL_RAGDB`       | `${DATABASE_URL → /ragdb}`                                  |
