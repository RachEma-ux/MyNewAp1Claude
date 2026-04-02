# ADR-002: Repository Workspace Model

## Status: Accepted

## Context
Coding jobs must execute in isolated workspaces to prevent contamination of protected
branches and to allow concurrent jobs on the same repository.

## Decision
- Each job creates an ephemeral workspace (git worktree or shallow clone).
- Workspaces track baseline SHA, branch name, and final SHA.
- No direct mutation of protected/default branches.
- No implicit git push or deploy.
- Changed files are tracked per-job for evidence bundles.
- Workspaces are cleaned up after job completion or archival.

## Consequences
- Jobs are safely isolated from each other.
- Branch protection is enforced at the module level.
- Workspace cleanup must be scheduled to prevent disk bloat.
- PR creation is a separate, explicitly gated action (deferred to post-MVP).
