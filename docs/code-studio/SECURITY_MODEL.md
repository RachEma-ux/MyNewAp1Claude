# Code Studio — Security Model

## Authentication
- Code Studio inherits platform authentication (OAuth / DEV_MODE)
- All tRPC endpoints use `protectedProcedure`
- Service-to-service (platform handoff) uses internal trust model
- OpenCode runtime uses HTTP basic auth (`OPENCODE_SERVER_PASSWORD`)

## Authorization
- Job creation: any authenticated user
- Job cancellation: job owner or admin
- Approval decisions: designated approvers or admin
- Policy management: admin only
- Audit access: admin only

## OpenCode Isolation
- OpenCode binds to `127.0.0.1` only (no external access)
- OpenCode credentials managed as module-internal secrets
- Raw OpenCode responses are normalized before surfacing to frontend
- Secrets redacted from audit logs and event streams

## Workspace Security
- Each job gets an ephemeral workspace (git worktree or clone)
- No direct mutation of protected/default branches
- No implicit git push
- No external directory access by default
- No secret file reads (.env, credentials) by default
- Workspaces cleaned up after job completion/archival

## Approval Gating
- Risky edit actions require explicit approval
- Risky bash commands require explicit approval
- Destructive commands denied by default
- External directory access denied by default
- Approval decisions are durable and audited

## Audit Requirements
- All state-changing operations produce audit events
- Audit tables are append-only (no UPDATE/DELETE on audit rows)
- Evidence bundles generated for completed jobs
- Retention/cleanup runs on configurable schedule
