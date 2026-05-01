# Module DB Roles

This directory provisions a least-privilege Postgres role per module-owned
database. Each strong module has a runtime user that can read/write only
its own DB; no role can cross module boundaries.

## Mapping

| Module       | DB name | Runtime user           | Env var to wire        |
|--------------|---------|------------------------|------------------------|
| platform     | `mynewap1claude` | `app_runtime_user`        | `DATABASE_URL`         |
| prm          | `prmdb`          | `prm_runtime_user`        | `DATABASE_URL_PRMDB`   |
| psm          | `psmdb`          | `psm_runtime_user`        | `DATABASE_URL_PSMDB`   |
| codeStudio   | `codedb`         | `code_runtime_user`       | `DATABASE_URL_CODEDB`  |
| agentStudio  | `asdb`           | `agent_runtime_user`      | `DATABASE_URL_ASDB`    |
| sandboxWf    | `wfdb`           | `sandbox_wf_runtime_user` | `DATABASE_URL_WFDB`    |
| rag          | `ragdb`          | `rag_runtime_user`        | `DATABASE_URL_RAGDB`   |

## Operator workflow

1. Create databases (`createdb prmdb`, etc).
2. Run `psql -d <dbname> -f 001_<module>_role.sql` for each module DB
   to provision its role and grants.
3. Set the password for each role:
   `ALTER ROLE prm_runtime_user WITH ENCRYPTED PASSWORD '...';`
4. Wire connection strings into `.env` using the env var names above.
   Each url should connect AS the module's role, e.g.:
   `DATABASE_URL_PRMDB=postgres://prm_runtime_user:...@host:5432/prmdb`

## Verification

`npm run check:db-roles` (script in `scripts/check-db-roles.ts`) inspects
the live DBs and warns when:

- a module's role is missing
- a role has CONNECT on a foreign module's DB
- a role has been granted superuser

Add this check to CI for any environment where the platform actually
talks to a real Postgres cluster (i.e. not the dev sandbox).

## Why per-module roles?

Owned-DB modules are a hard architectural boundary. Even if a bug in
one module attempted to read another module's tables, the role wouldn't
have permission. This is the database half of the boundary that the
`check:boundaries` and `check:db-ownership` scripts enforce statically.
