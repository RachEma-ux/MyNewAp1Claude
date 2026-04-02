# Code Studio — Workflow Model

## Job State Machine

```
draft → queued → preparing_workspace → starting_session → planning
  → awaiting_approval → building → reviewing → testing
  → governance_check → completed

Any state → failed (on error)
Any state → cancelled (on user cancel)
completed → archived (on retention)
```

## Standard Workflow Sequence

1. **Inbound handoff** — Platform creates job via handoff contract
2. **Queue** — Job enters queue, worker picks it up
3. **Prepare workspace** — Clone/worktree, create branch, track baseline SHA
4. **Start OpenCode session** — Create session via adapter
5. **Planning phase** — Planner agent analyzes codebase, produces plan
6. **Approval gate** — If plan involves risky actions, pause for approval
7. **Building phase** — Builder agent implements changes
8. **Review phase** — Reviewer agent audits changes
9. **Testing phase** — Tester agent runs validation
10. **Governance check** — Governance agent checks policy compliance
11. **Artifact persistence** — Diffs, evidence bundle, PR candidate saved
12. **Callback** — Result returned to platform via handoff callback

## Agent Roles

| Agent | Mode | Can Edit | Can Bash | Purpose |
|-------|------|----------|----------|---------|
| coding-orchestrator | primary | ask | ask | Coordinates overall workflow |
| planner | subagent | deny | deny | Read-only analysis and planning |
| builder | subagent | ask | ask | Implements code changes |
| reviewer | subagent | deny | deny | Audits changes, no silent rewrites |
| tester | subagent | deny | ask (test cmds) | Runs tests and validation |
| governance | subagent | deny | deny | Policy compliance checks |
| explorer | subagent | deny | deny | Read-only codebase search |

## Permission Rules

- Builder: edit=ask, bash=ask, all risky actions gated
- Planner/Reviewer/Governance/Explorer: edit=deny, bash=deny
- Tester: edit=deny, bash configured to allow test runners only
- All agents: external_directory=deny, secret files=deny
