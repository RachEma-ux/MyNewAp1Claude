# OpenCode Agent and Command Map

## Agents (`.opencode/agents/`)

| Agent | File | Role | Edits Code? |
|---|---|---|---|
| planner | `planner.md` | Inspect repo, produce implementation plans | No |
| reviewer | `reviewer.md` | Audit implementations for correctness and fit | No |
| debugger | `debugger.md` | Root-cause analysis, targeted fixes | Yes (minimal) |
| security-reviewer | `security-reviewer.md` | Security audit: auth, injection, secrets, policy | No |
| docs-writer | `docs-writer.md` | Documentation and report generation | No |

## Commands (`.opencode/commands/`)

| Command | File | Purpose |
|---|---|---|
| audit-job | `audit-job.md` | Audit implementation against a target prompt |
| inspect-module | `inspect-module.md` | Inspect a module, produce structured report |
| full-review | `full-review.md` | End-to-end review before marking work complete |

## Mapping to AGENTS.md Team Model

| AGENTS.md Role | OpenCode Agent | Command |
|---|---|---|
| Planner Agent | `planner` | — |
| Builder Agent | (default/user) | — |
| Reviewer Agent | `reviewer` | `full-review` |
| Tester Agent | (default/user) | `audit-job` |
| Governance Agent | `security-reviewer` | `inspect-module` |
