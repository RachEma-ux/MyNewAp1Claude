# Local Development on Termux — ASDB Role + Local Seed Reference

**Audience:** developers running this repo locally on a Termux device
(or any environment where the default Postgres role is not `root`).
**Cross-reference:** previously local-only at
`~/.claude/projects/-root/memory/reference_local_asdb_role_mismatch.md`;
this is the canonical repo-tracked copy.

---

## 1. Postgres role mismatch — `u0_a296` vs `root`

### Symptom

On a Termux device, the on-device Postgres cluster (socket at
`/data/data/com.termux/files/usr/tmp/.s.PGSQL.5432`) does **not** carry
a `root` role. Connecting via the default Termux user (`root`) fails:

```
psql: error: connection to server on socket "...PGSQL.5432" failed:
FATAL: role "root" does not exist
```

The role that **does** exist and connects is `u0_a296` (the Android
UID-named role created when Postgres was first started under the
Termux user). Any local script that hits ASDB / RAGDB without an
explicit `DATABASE_URL_*` env var will hit this.

### Workaround

Set `DATABASE_URL_ASDB` explicitly to use the working role + the unix
socket path:

```bash
export DATABASE_URL_ASDB="postgresql://u0_a296@/asdb?host=/data/data/com.termux/files/usr/tmp"
pnpm tsx scripts/<seed-or-integration>.ts
```

Equivalently, set `PGUSER=u0_a296` ahead of any `psql` / `pnpm`
invocation that doesn't take an explicit URL.

### Why this is local-only

The role mismatch is **environment-specific to the local Termux box**
— shipped code paths use `DATABASE_URL` / `DATABASE_URL_ASDB` env vars
and do **not** hard-code a role. The friction is in local validation
passes only. CI provides a properly-provisioned Postgres service
container with the expected role; integration tests pass there
without any workaround.

### Cross-references

- Termux dev env recovery patterns: see [agent-studio runtime SLO](./agent-studio-runtime-slo.md) for the broader Termux operational backdrop
- Approval-lifecycle retention live-ASDB integration tests
  (`tests/integration/agent-studio/approval-lifecycle-retention.integration.test.ts`)
  are the originating context — they were never the blocker, only the
  attempted local validation pass that surfaced the role mismatch.

---

## 2. Local seed for `test:integration:staging`

The full integration-test suite (`pnpm run test:integration:staging`)
depends on:

- A reachable ASDB Postgres (see §1 for the role-mismatch workaround).
- An applied Drizzle schema (`npx drizzle-kit push --force`).
- Seeded provider connections (`pnpm tsx scripts/provider-connections/seed-from-env.ts`).
- Seeded golden questions when running Phase 22/23-touching suites
  (`pnpm tsx scripts/agent-studio/seed-golden-questions.ts`).

If the role-mismatch workaround is in place but `test:integration:staging`
still fails with connection / pool errors, the most likely cause is
that the seed scripts have not been re-run after a Postgres restart.
Re-run them and retry.

---

## 3. Port registry compliance

Local dev services (Postgres, dev-server, Ollama, etc.) must bind on
the canonical ports declared in `server/platform/ports/default-declarations.ts`
+ each module's manifest. Don't silently accept fall-forward ports
(e.g. dev server falling forward from 3000 to 3001) — that drifts the
local environment away from the registry and away from CI.

CI's `check:ports` script (`npm run check:ports`) is canonical. Locally
on Termux, the same script runs but the device's process model means
any conflict can SIGKILL the dev server; resolve port conflicts
deterministically rather than letting the OS pick. See `feedback_dev_env_respects_port_registry`
memory entry for the original guidance.

---

## 4. When this doc applies

- Running `pnpm tsx scripts/*.ts` locally → set `DATABASE_URL_ASDB`
  per §1.
- Running `pnpm run test:integration:staging` locally → §1 + §2.
- Running `pnpm dev` locally → §3.
- Running anything in CI → none of these apply; CI service containers
  match the canonical schema and roles.

---

## 5. Companion CI workflows

- `.github/workflows/run-tests.yml` — Layer 9 explicitly wires the
  closure-surface tests (including `graph-retrieval-resolved-skill-trace`)
  against the `testdb` Postgres container; this is the canonical CI
  proof that the role-mismatch is local-only.
- `.github/workflows/graph-bench-neo4j-ce.yml` — operator-triggered
  Neo4j CE benchmark.
- `.github/workflows/graph-golden-questions-live.yml` — operator-triggered
  Golden Questions evaluation.

All three use `testuser` / `testpass` against a `postgres:16` service
container; the role mismatch is invisible in CI.
