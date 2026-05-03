# Staging Seed Data Plan

The seed plan that `pnpm run staging:seed` will dispatch to once the
per-module seeders are wired (follow-up PRs). The dispatcher today
validates env (BLOCKED if foundation gate fails) and reports the
plan; per-module seeders are owned by their RTLMs.

## Idempotency rule

Every seeder must be idempotent: re-running `pnpm run staging:seed`
on a already-seeded staging stack must complete cleanly without
duplicate rows. Implement via `INSERT … ON CONFLICT DO NOTHING` or
"check, then insert" guards.

## Per-module seed targets

The order matters — earlier rows are referenced by later ones.

### 1. Users + roles (foundation)

- `staging-admin` (role: admin)
- `staging-manager` (role: manager)
- `staging-member` (role: member)
- `staging-restricted` (role: restricted)

Used by: every later seeder (workspace ownership, audit author),
PR 9 RBAC matrix.

### 2. Workspaces

- `default-workspace` (owner: staging-admin, members: all four roles)
- `secondary-workspace` (owner: staging-manager — used to assert
  PR 9 workspace isolation)

### 3. Communication

- `default-conversation` (workspace: default, participants: admin + member)
- one message per participant so the conversation has visible state.

### 4. PS / Ideation

- one ideation item with `status=draft` and another with `status=ready`
  so PR 9 can replay the PS → PM Central handoff.

### 5. PM Central

- one project owned by staging-manager.
- two tasks: one open, one closed.

### 6. Code Studio

- one job shell pointing at the local mock external-orchestrator
  (so PR 9 has a place to assert "PM → Code Studio request" wiring).

### 7. Data Acquisition

- one source pointing at the local mock data-acquisition-worker.

### 8. GraphRAG

- one output placeholder so PR 7's "Data Acquisition → GraphRAG
  output" workflow has a target.

### 9. Sandbox WF

- one workflow pointing at the local mock sandbox-wf-worker.

### 10. KGRA Agent (if KGRA service URL is set)

- one query placeholder pointing at the mock kgra-service.

### 11. Connectors (local / manual / webhook test paths)

- one local connector record.
- one manual connector record.
- one webhook connector record (with an arbitrary callback URL —
  staging-only, never a production URL).

External connectors (S3 / GDrive / GitHub App) are NOT seeded.
PR 5 reports them as BLOCKED until real credentials exist.

## Connector test inputs

For PR 5 evidence, each test path needs a deterministic input:

- **local**: a small text file in `infra/staging/seed-fixtures/local-input.txt`
  (TODO: ship in a follow-up).
- **manual**: a manual data record produced via the seeded user.
- **webhook**: a known payload posted to the registered URL.
- **API mock**: a stub response served by `infra/staging/mock-workers/`
  (extend to add an `/api-mock` endpoint when this PR ships).
- **database mock**: a row in `default-workspace` flagged
  `connector-test-marker`.

## What the dispatcher does today

`pnpm run staging:seed`:

1. Calls the foundation preflight. BLOCKED → exit 2 with the
   missing env list.
2. Otherwise prints the per-module plan above with `status: skipped`,
   reason `delegated to module seeders`, and exits 0.

The dispatcher will become real (chain into per-module seeders)
once the per-module seeders are implemented in follow-up PRs.
That keeps the staging-runtime PR's diff focused and reviewable
without growing into an 11-module seeder PR.

## Standing rules respected

- **No secrets in seed data.** Every seeded user is a staging-only
  fixture; no production user data.
- **Idempotent.** Re-running is safe.
- **Honest BLOCKED.** When env is missing, the dispatcher exits 2,
  not 0.
