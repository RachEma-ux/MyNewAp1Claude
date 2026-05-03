# Staging Connection Details

## Status

**BLOCKED** — staging connection details have not been provided.

PRs 3–10 of the Production Readiness Blocker Closure Plan cannot
resume until the items below are filled in and verified.

## Purpose

This document records the connection path required to run
production-readiness PRs 3–10 on the real staging host. It carries
**no secret values**. Real secrets live on the staging host (or in a
secrets manager) and are sourced into the shell there, never copied
into this repo or this dev device.

## Required connection details

| Item | Value / Placeholder | Status | Notes |
|------|---------------------|:------:|-------|
| SSH command | `ssh <user>@<staging-host>` | MISSING | Must be a real host, not a placeholder. Provide the substituted value. |
| SSH port | `22` (default) or `<port>` | MISSING | Provide if non-standard. |
| SSH key path | `<absolute path on this dev device>` | MISSING | Do **not** commit the key. The path is enough; the key file stays out of git. |
| Jump host | `<jump-user>@<jump-host>` | MISSING | NOT APPLICABLE if direct SSH works; otherwise provide the `-J` chain. |
| Repo path on staging host | `<absolute path>` (likely `/root/MyNewAp1Claude` or `/home/<user>/MyNewAp1Claude`) | MISSING | Where `git pull` and `pnpm run staging:preflight:gate` are executed. |
| Env source command | `set -a; source <env-file>; set +a` | MISSING | Common patterns: `/etc/mynewap1claude/staging.env`, `<repo-path>/.env.staging`. **Do not include secret values in this doc.** |
| Staging app URL | `$STAGING_APP_URL` | MISSING | Value is set on the staging host, never recorded here. |
| Preflight command | `pnpm run staging:preflight:gate` | **FOUND** | Wired in `package.json` (PR #93). |

## Safe command template

Once the values above are filled in:

```bash
ssh <user>@<staging-host>

cd <repo-path>
git checkout main
git pull --ff-only origin main

set -a
source <path-to-staging-env-file>
set +a

pnpm run staging:preflight:gate
```

The preflight gate exits:

| Exit | Meaning | Next step |
|:----:|---------|-----------|
| 0 | Staging ready | Resume PR 3 — Phase 3 DB isolation staging evidence |
| 2 | BLOCKED — required env or tooling missing | See [`STAGING_BLOCKER_REPORT.md`](../evidence/staging/STAGING_BLOCKER_REPORT.md) |
| 1 | Runtime FAIL — a service is reachable but unhealthy | Fix the unhealthy service before re-attempting |

## Required env classes (presence only — never values)

The staging host must export the following before running the gate.
This document only records the **classes** of env that must be set;
values stay on the staging host or in a secrets manager.

| Class | Required keys | Status on staging host |
|-------|---------------|:----------------------:|
| App | `STAGING_APP_URL` | UNKNOWN |
| DB | `DATABASE_URL_MYNEWAP1CLAUDE`, `DATABASE_URL_ASDB`, `DATABASE_URL_RAGDB`, `DATABASE_URL_WFDB` | UNKNOWN |
| Policy | `OPA_URL` | UNKNOWN |
| Workers | `GRAPHRAG_WORKER_URL`, `DATA_ACQUISITION_WORKER_URL`, `EXTERNAL_ORCHESTRATOR_URL`, `SANDBOX_WF_WORKER_URL`, `KGRA_SERVICE_URL`, `REDIS_URL` / `WORKER_QUEUE_URL` | UNKNOWN |
| Secrets | `ENCRYPTION_KEY`, `SECRETS_ENCRYPTION_KEY`, `COOKIE_SECRET`, `JWT_SECRET` | UNKNOWN |
| Browser | Playwright + Chromium installed | UNKNOWN |
| Optional connectors | `S3_*`, `GDRIVE_*`, `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY` | UNKNOWN — missing keys are expected to surface as BLOCKED, not silently downgraded to PASS |

`UNKNOWN` here means: this dev device cannot verify what's on the
staging host. The preflight gate (PR #93) will report each class
as PASS / BLOCKED on the staging host once executed.

## Decision

| Outcome | Trigger | Status |
|---------|---------|:------:|
| Staging access **READY** | Every required connection detail above is FOUND, and `staging:preflight:gate` exits 0 on the staging host | not yet |
| Staging access **PARTIAL** | Connection works, gate exits 0, but optional connector credentials are missing (S3 / GDrive / GitHub App). PRs 3, 4, 6–10 may proceed; PR 5 reports those connectors as BLOCKED with named credentials. | not yet |
| Staging access **BLOCKED** | Any required connection detail is MISSING | **current state** |

## Next command after staging access is ready

On the staging host:

```bash
cd <repo-path>
git checkout main
git pull --ff-only origin main
set -a; source <path-to-staging-env-file>; set +a
pnpm run staging:preflight:gate
```

If exit 0: resume **PR 3 — Phase 3 DB isolation staging evidence**.
If exit 2: capture the missing dependency in
[`STAGING_BLOCKER_REPORT.md`](../evidence/staging/STAGING_BLOCKER_REPORT.md)
and stop — no PR 3 attempt.

## What goes in the request when filling this in

See [`STAGING_ACCESS_REQUEST.md`](../evidence/staging/STAGING_ACCESS_REQUEST.md)
for the exact items to provide and the safe / unsafe channels for
each.

## Standing rules respected

- **No fake staging access.** Every value above is an explicit placeholder; nothing is guessed.
- **No secrets in this file.** Values are described by class (e.g., "32 bytes hex") never by value. Real values come from the staging host's secrets manager.
- **No private keys committed.** The SSH key path is recorded; the key file itself stays out of git.
- **No bypass.** PRs 3–10 cannot proceed until the gate exits 0 on the staging host.
