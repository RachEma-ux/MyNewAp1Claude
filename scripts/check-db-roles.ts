#!/usr/bin/env tsx
/**
 * check:db-roles
 *
 * Inspects the live Postgres cluster (using `DATABASE_URL` as superuser
 * credentials) to verify each strong module's runtime role exists and
 * does not have CONNECT on any other module's DB. Warns rather than
 * fails when no `DATABASE_URL` is configured — local dev sandboxes are
 * allowed to run on the default postgres superuser.
 *
 * Add this script to CI for environments where the platform talks to a
 * real cluster, so role boundaries are enforced (not just static checks).
 */

import pg from "pg";

interface ModuleRoleSpec {
  module: string;
  db: string;
  role: string;
}

const ROLE_MAP: ModuleRoleSpec[] = [
  { module: "platform", db: "mynewap1claude", role: "app_runtime_user" },
  { module: "prm", db: "prmdb", role: "prm_runtime_user" },
  { module: "psm", db: "psmdb", role: "psm_runtime_user" },
  { module: "codeStudio", db: "codedb", role: "code_runtime_user" },
  { module: "agentStudio", db: "asdb", role: "agent_runtime_user" },
  { module: "sandboxWf", db: "wfdb", role: "sandbox_wf_runtime_user" },
  { module: "rag", db: "ragdb", role: "rag_runtime_user" },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn(
      "[skip] check:db-roles — DATABASE_URL is not set. Local dev sandboxes are allowed.",
    );
    process.exit(0);
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  let errors = 0;

  try {
    const liveRolesRes = await client.query<{ rolname: string; rolsuper: boolean }>(
      `SELECT rolname, rolsuper FROM pg_roles`,
    );
    const liveRoles = liveRolesRes.rows.reduce(
      (m, r) => m.set(r.rolname, r.rolsuper),
      new Map<string, boolean>(),
    );

    for (const spec of ROLE_MAP) {
      const isSuper = liveRoles.get(spec.role);
      if (isSuper === undefined) {
        console.warn(`[WARN] role missing: ${spec.role} (expected for ${spec.module})`);
        continue;
      }
      if (isSuper) {
        console.error(`[ERROR] ${spec.role} has SUPERUSER — must be a least-priv role`);
        errors++;
      }
    }

    // Cross-module CONNECT check: every module role must NOT have CONNECT
    // on any DB other than its own (best-effort, requires cluster perm).
    const connectAcl = await client.query<{ datname: string; rolname: string }>(
      `
      SELECT d.datname, r.rolname
      FROM pg_database d
      CROSS JOIN pg_roles r
      WHERE has_database_privilege(r.rolname, d.datname, 'CONNECT')
        AND r.rolname = ANY($1::text[])
        AND d.datname = ANY($2::text[])
      `,
      [ROLE_MAP.map((s) => s.role), ROLE_MAP.map((s) => s.db)],
    );
    const ownDbForRole = new Map(ROLE_MAP.map((s) => [s.role, s.db]));
    for (const row of connectAcl.rows) {
      const ownDb = ownDbForRole.get(row.rolname);
      if (ownDb && row.datname !== ownDb) {
        console.error(
          `[ERROR] ${row.rolname} has CONNECT on foreign DB '${row.datname}' (owns '${ownDb}')`,
        );
        errors++;
      }
    }
  } finally {
    await client.end();
  }

  if (errors > 0) {
    console.error(`\n${errors} DB-role violation(s).`);
    process.exit(1);
  }
  console.log("OK — DB role boundaries look clean.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[ERROR] check:db-roles failed", err);
  process.exit(1);
});
