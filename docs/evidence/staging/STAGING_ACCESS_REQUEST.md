# Staging Access Request

Production-readiness PRs 3–10 of the Blocker Closure Plan cannot
resume until staging access is configured. The platform code is
ready (foundation in PR #91, runtime in PR #93). What's missing is
purely the **connection path** to the host where staging runs.

This document is the request to infrastructure / admin to provide
those details.

## Required from infrastructure / admin

### 1. SSH access command

A command that successfully opens a shell on the staging host.

Template:
```bash
ssh <user>@<staging-host>
```

Real-world variants the request can take:

```bash
# Plain key-based:
ssh -i /absolute/path/to/key alice@staging.internal

# Non-default port:
ssh -i /absolute/path/to/key -p 2222 alice@staging.internal

# Through a jumphost / bastion:
ssh -J jump@bastion.internal -i /absolute/path/to/key alice@staging.internal
```

If a key needs to be installed on this device first, please provide:

- the absolute path you'd like the key stored at, and
- a safe channel to deliver the key (NOT pasted in chat — see
  "Safe channels" below).

### 2. Repo path on staging host

The absolute path where `MyNewAp1Claude` is checked out on the staging
host. Common patterns:

```text
/root/MyNewAp1Claude
/home/<user>/MyNewAp1Claude
/srv/mynewap1claude
```

### 3. Env source command

The exact shell command that loads staging env into the current
shell on the staging host. Examples:

```bash
# Sourced from a managed file:
set -a; source /etc/mynewap1claude/staging.env; set +a

# Sourced from a repo-local file (gitignored):
set -a; source /root/MyNewAp1Claude/.env.staging; set +a

# Already in shell via systemd-environ / pam-env / direnv:
# (no command needed; just confirm)
```

### 4. Confirmation that the staging host has these configured

Tick the boxes that apply on the staging host (presence only — do
NOT paste values):

- [ ] `STAGING_APP_URL`
- [ ] `DATABASE_URL_MYNEWAP1CLAUDE`
- [ ] `DATABASE_URL_ASDB`
- [ ] `DATABASE_URL_RAGDB`
- [ ] `DATABASE_URL_WFDB`
- [ ] `OPA_URL` (real endpoint, not `opa.example.com`)
- [ ] `GRAPHRAG_WORKER_URL`
- [ ] `DATA_ACQUISITION_WORKER_URL`
- [ ] `EXTERNAL_ORCHESTRATOR_URL`
- [ ] `SANDBOX_WF_WORKER_URL`
- [ ] `KGRA_SERVICE_URL`
- [ ] `REDIS_URL` or `WORKER_QUEUE_URL`
- [ ] `ENCRYPTION_KEY`, `SECRETS_ENCRYPTION_KEY`, `COOKIE_SECRET`, `JWT_SECRET`
- [ ] Playwright + Chromium installed (`pnpm exec playwright --version` works; `~/.cache/ms-playwright` exists)
- [ ] Optional connectors (acknowledge each that is and isn't present):
  - [ ] `GITHUB_APP_ID` + `GITHUB_PRIVATE_KEY` (NOT the same as the repo `GH_PAT`)
  - [ ] `S3_BUCKET` + `S3_REGION` + `S3_ACCESS_KEY_ID` + `S3_SECRET_ACCESS_KEY`
  - [ ] `GDRIVE_CLIENT_ID` + `GDRIVE_CLIENT_SECRET`

If a row is unticked, the corresponding phase will report **BLOCKED
— missing `<key>`** (or `PARTIAL` for optional connectors). That's
the design; please don't substitute placeholder values.

## Do NOT provide in chat

For safety, **do not paste any of the following in chat**:

- raw secret values (`ENCRYPTION_KEY`, `SECRETS_ENCRYPTION_KEY`, `COOKIE_SECRET`, `JWT_SECRET`, etc.)
- private SSH keys (`-----BEGIN OPENSSH PRIVATE KEY-----` blobs)
- API tokens, app passwords, OAuth client secrets
- full `.env*` file contents
- DSN strings that include passwords

## Safe channels

Use one of these instead:

- **Store secrets on the staging host.** They get sourced via the
  env command above; nothing reaches this device.
- **Store secrets in CI / CD env / secrets manager.** Same idea.
- **Provide only the env-source command and a path.** This document
  records *how* to load env, never *what* the env contains.
- **SSH access only.** Once SSH works, env loading happens on the
  remote host where it belongs.
- If a key file genuinely needs to land on this device, deliver it
  via a one-time secret pastebin (e.g., `bw send`, `pass`, `1pw`,
  or a secrets-manager-issued ephemeral URL) — never as plain text
  in chat.

## What this unblocks

Once items 1–3 above are provided and item 4's preflight gate
(executed on the staging host) exits 0:

- PR 3 — Phase 3 DB isolation staging evidence
- PR 4 — Phase 4 worker runtime verification
- PR 5 — Phase 5 connector verification
- PR 6 — Phase 8 full UI smoke
- PR 7 — Phase 9 real user workflow replay
- PR 8 — Phase 10 E2E sync staging evidence
- PR 9 — Phase 11 Security/RBAC completion
- PR 10 — Final production readiness rerun

## Reproduction (sanity check)

Once the details are in, the verification flow on the staging host is:

```bash
cd <repo-path>
git checkout main
git pull --ff-only origin main
set -a; source <path-to-staging-env-file>; set +a
pnpm run staging:preflight:gate; echo "exit=$?"
```

`exit=0` ⇒ resume PR 3.
`exit=2` ⇒ capture the missing dependency in
`docs/evidence/staging/STAGING_BLOCKER_REPORT.md`, stop.
`exit=1` ⇒ a service is reachable but unhealthy; fix it, re-run.

## See also

- [`docs/deployment/STAGING_CONNECTION_DETAILS.md`](../../deployment/STAGING_CONNECTION_DETAILS.md) — the sanitized handoff template
- [`docs/deployment/staging-runtime.md`](../../deployment/staging-runtime.md) — runtime stack documentation (PR #93)
- [`docs/deployment/staging-runbook.md`](../../deployment/staging-runbook.md) — operational procedures
- [`scripts/staging/connect-template.sh`](../../../scripts/staging/connect-template.sh) — placeholder helper script
