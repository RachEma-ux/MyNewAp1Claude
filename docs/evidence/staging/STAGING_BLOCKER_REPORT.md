# Staging Blocker Report

**Generated:** 2026-05-03T15:13:20.592Z
**Verdict:** BLOCKED

## Missing dependencies

- DATABASE_URL
- OPA_URL
- ENCRYPTION_KEY
- SECRETS_ENCRYPTION_KEY
- COOKIE_SECRET
- JWT_SECRET
- STAGING_APP_URL
- DATABASE_URL_MYNEWAP1CLAUDE
- DATABASE_URL_ASDB
- DATABASE_URL_RAGDB
- DATABASE_URL_WFDB
- SANDBOX_WF_WORKER_URL
- KGRA_SERVICE_URL

## Missing tooling

- playwright
- chromium-browser

## What this blocks

- PR 3 — Phase 3 DB isolation evidence
- PR 4 — Phase 4 worker runtime verification
- PR 5 — Phase 5 connector verification
- PR 6 — Phase 8 UI smoke
- PR 7 — Phase 9 workflow replay
- PR 8 — Phase 10 E2E sync
- PR 9 — Phase 11 Security/RBAC
- PR 10 — Final readiness rerun (downstream)

## Reproduction

```bash
pnpm run staging:preflight:gate; echo "exit=$?"
```

## Staging access status

Even with the staging runtime files merged (PR #93), the gate cannot
be executed against real staging until access to the staging host is
provided. This section tracks that access surface separately from
the env-and-tooling surface above.

| Required item | Status | Notes |
|---------------|:------:|-------|
| SSH access command | **MISSING** | Need real `ssh <user>@<staging-host>` (or `-i <key>` / `-p <port>` / `-J <jump>` variant). |
| SSH key path on this device | **MISSING** | Path to a key file that is already present on this device, OR safe-channel delivery instructions. |
| Repo path on staging host | **MISSING** | Absolute path where `MyNewAp1Claude` is checked out on staging. |
| Env source command | **MISSING** | Exact `set -a; source <file>; set +a` command on the staging host. Values stay on the host. |
| Preflight gate runnable on staging | **UNVERIFIED** | Cannot verify until the four items above are provided. The gate itself is `pnpm run staging:preflight:gate` (FOUND in `package.json`). |

See [`STAGING_ACCESS_REQUEST.md`](./STAGING_ACCESS_REQUEST.md) for the
exact request format and the safe channels for each item, and
[`docs/deployment/STAGING_CONNECTION_DETAILS.md`](../../deployment/STAGING_CONNECTION_DETAILS.md)
for the sanitized handoff template.

## Current decision

PRs 3–10 remain **BLOCKED** until both:

1. The staging connection details are complete (see access-status table above), AND
2. `pnpm run staging:preflight:gate` exits **0** when run on the staging host.

Once the gate exits 0 on the staging host, PR 3 — Phase 3 DB
isolation staging evidence — resumes from there.
