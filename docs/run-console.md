# Run Console — What It Does

It's the control panel for the **Multi-Operator Autonomous Runtime**. You describe what you want in plain English (an "intent"), and the system:

1. **Routes** your intent to the right operator based on keywords
2. **Generates a plan** (a list of "syscalls" — atomic actions) using an LLM
3. **Governance checks** each syscall against policies
4. **Executes** the plan (if autonomy level permits)

## 4 Operators

| Operator | Keywords | What It Does |
|---|---|---|
| **Builder** | generate, build, create, write, code, fix, refactor | Generates code/files, commits to branches, creates PRs |
| **Auditor** | audit, scan, review, check, inspect, analyze | Read-only scans, code analysis, generates reports |
| **Governance** | policy, compliance, governance, rule, enforce | Policy evaluation, compliance checking |
| **Deploy** | deploy, release, pr, pipeline, ci, ship | Creates PRs, triggers CI, manages releases |

## 6 Autonomy Levels

| Level | What It Can Do |
|---|---|
| **L0** | Plan only — just shows what it *would* do |
| **L1** | Local file writes only |
| **L2** | Dev branch commits |
| **L3** | Pull request creation |
| **L4** | CI pipeline triggers |
| **L5** | Production deployment |

## Example Intents You Can Submit

- *"Scan the codebase for security vulnerabilities"* → routes to **Auditor**
- *"Generate a user settings page"* → routes to **Builder**
- *"Check compliance with naming conventions"* → routes to **Governance**
- *"Deploy the latest build to production"* → routes to **Deploy**
- *"Refactor the chat module to use WebSockets"* → routes to **Builder**
- *"Review all API endpoints for proper auth"* → routes to **Auditor**

The operator auto-detects from your keywords, or you can manually pick one. At L0 you just see the plan; higher levels actually execute actions.
