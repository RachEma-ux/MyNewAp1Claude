# OpenCode — Role, Value, and End-to-End Walkthrough

> What OpenCode is, why it matters in the platform, and a full real-world
> scenario showing the complete coding experience from job creation to
> shipped feature.

---

## What Is OpenCode?

OpenCode is an **AI coding agent** — similar to Claude Code — that can be run
as a **headless HTTP server**. Instead of a human typing in a terminal, the
app talks to it programmatically via REST API.

## Its Role in MyNewAp1Claude

OpenCode is the **execution engine** behind Code Studio. The app is the
**control plane** (manage, configure, govern); OpenCode is the **runtime**
(do the actual coding work).

```
User  →  Code Studio UI  →  Job Orchestrator  →  OpenCode API  →  AI writes code
                ↑                                          ↓
         governance, approval                   diffs, messages, results
```

Without OpenCode, Code Studio can plan and manage jobs but can't execute
them. With it, jobs go from "draft" all the way through planning → building →
reviewing → testing → governance → completed — autonomously.

## Added Value

| Without OpenCode | With OpenCode |
|---|---|
| App manages LLM configs, providers, agents | App **executes** real coding tasks end-to-end |
| Users configure settings manually | Settings are **applied to a live runtime** |
| Job pipeline is theoretical | Jobs **actually run** — AI writes, reviews, tests code |
| Static dashboard | **Live sessions** with streaming messages, diffs, permissions |

It transforms the app from an **admin panel** into an **AI development platform**.

## Biggest Advantages

1. **Headless API** — No terminal needed. The app controls everything via
   HTTP (`/session`, `/message`, `/diff`). Any UX can be built on top.

2. **Session Isolation** — Each job gets its own session. Multiple jobs run in
   parallel without interference. Sessions persist for later inspection.

3. **Built-in Agent System** — Ships with agents (build, plan, explore,
   review). The job orchestrator maps pipeline phases directly to these agents.

4. **Permission Control** — The API exposes permission requests. The governance
   engine can intercept dangerous operations and require approval before they
   execute.

5. **Diff Tracking** — Every code change is captured as a structured diff via
   the API. The app can display, approve, or revert changes — full visibility
   over what AI writes.

6. **Provider-Agnostic** — Supports Anthropic, OpenAI, Ollama, Google, etc.
   The app's provider/model settings flow into OpenCode's runtime config.

7. **Local-First** — Runs on `127.0.0.1`. Code never leaves the device unless
   a remote provider is configured. Important for enterprise/privacy use cases.

### One-Liner

> **OpenCode** is the AI coding runtime that powers Code Studio — it receives
> jobs from the platform, executes them using AI agents, and returns structured
> code changes with full governance controls.

---

## Real-World Walkthrough: "Add a Notifications System"

You're a developer with a TypeScript web app. You need a notification
system — DB table, API endpoints, a bell icon in the header with a dropdown,
and real-time badge count. Normally this takes a day. With Code Studio +
OpenCode, you describe what you want, supervise the AI, and ship it.

### Step 1 — Create a Job

Open Code Studio Dashboard. Click **New Job**:

| Field | Value |
|---|---|
| Title | Add user notifications system |
| Description | Create a notifications table, tRPC endpoints for list/mark-read/delete, a bell icon in the header with unread badge, and a dropdown panel. Support types: info, warning, success, error. |
| Repository | `/home/user/my-web-app` |
| Agent | `build` |

Click **Create**. Status: `draft`.

### Step 2 — Queue the Job

Click **Queue**. The orchestrator takes over:

```
draft → queued → preparing_workspace
```

Behind the scenes the Job Orchestrator picks up the job, the Workspace Manager
creates an isolated workspace, and the target repo is cloned/linked so changes
are sandboxed.

### Step 3 — Planning Phase

```
preparing_workspace → starting_session → planning
```

The orchestrator creates an OpenCode session and sends the task to the
**plan** agent. OpenCode explores the repo, reads the schema, understands
the stack, and produces:

```
Plan:
1. Create `notifications` table in drizzle/schema.ts
   - id, userId, type (info|warning|success|error), title, message,
     read (boolean), createdAt
2. Create server/notifications/router.ts with tRPC endpoints:
   - notifications.list (paginated, filtered by user)
   - notifications.markRead
   - notifications.markAllRead
   - notifications.delete
3. Create client/src/components/NotificationBell.tsx
   - Bell icon with unread count badge
   - Dropdown panel with notification list
   - Mark-read on click
4. Add NotificationBell to the app header
5. Add seed data for testing
```

### Step 4 — You Review & Approve

```
planning → awaiting_approval
```

In the UI the job shows **"Awaiting Approval"** with the full plan. You add
feedback:

> "Also add a toast notification when a new notification arrives.
> Use the existing sonner toast system."

Click **Approve with feedback**.

### Step 5 — Build Phase (AI Writes Code)

```
awaiting_approval → building
```

The orchestrator switches to the **build** agent and passes the approved plan
plus your feedback. In the UI you see live streaming messages:

> "Creating notifications table schema..."
> "Writing tRPC router with list, markRead, markAllRead, delete..."
> "Building NotificationBell component with dropdown..."
> "Integrating into app header..."

**Permission requests** appear for risky actions:

```
⚠ Permission Request
Tool: write_file
Path: drizzle/schema.ts
Action: Modify existing database schema file
[Approve] [Deny]
```

The governance engine auto-approves low-risk actions (new files) and flags
high-risk ones (modifying schema) for your review. You click **Approve**.

### Step 6 — Review Phase

```
building → reviewing
```

The orchestrator fetches diffs from OpenCode:

```json
[
  { "path": "drizzle/schema.ts",                       "type": "modify", "+": 22, "-": 0  },
  { "path": "server/notifications/router.ts",           "type": "add",    "+": 87          },
  { "path": "client/src/components/NotificationBell.tsx","type": "add",    "+": 134         },
  { "path": "client/src/App.tsx",                       "type": "modify", "+": 3,  "-": 0  }
]
```

The review agent checks for SQL injection, missing error handling, type safety,
and code style consistency. It finds one issue:

> "The `markAllRead` mutation doesn't validate that the userId matches the
> authenticated user."

It fixes the issue in the same session. The UI shows the full diff viewer
with syntax highlighting.

### Step 7 — Testing Phase

```
reviewing → testing
```

OpenCode runs type checking (`tsc --noEmit`), confirms no errors, and verifies
the new router integrates correctly with the existing `appRouter`.

### Step 8 — Governance Check

```
testing → governance_check
```

The Governance Engine (CGT v2) runs policy rules:

| Check | Result |
|---|---|
| No secrets in code | PASS |
| Uses Drizzle ORM (no raw SQL) | PASS |
| Schema migration safe (additive only) | PASS |
| Naming conventions followed | PASS |
| Auth check on all mutations | PASS (after review fix) |
| Risk level | LOW |

All checks pass. Governance auto-approves.

### Step 9 — Completed

```
governance_check → completed
```

The dashboard shows:

```
Job #42 — Add user notifications system
Status:    Completed
Duration:  4 minutes
Files:     4 (2 new, 2 modified)
Lines:     +246, -0
Tokens:    12,847
Governance: PASSED (risk: low)
```

The full history is available: every message, the plan, approval, review
notes, all diffs, permission decisions, and governance audit trail.

### Step 10 — Apply Changes

Review the final diffs, then apply them to your repo. The notification bell
appears in the header, the API endpoints work, and the schema is ready for
migration.

---

## What Just Happened (Summary)

| Phase | Who | Time |
|---|---|---|
| Define the task | You (30 sec) | 0:00 |
| Plan the implementation | OpenCode plan agent | 0:30 |
| Review & approve plan | You (20 sec) | 1:00 |
| Write all the code | OpenCode build agent | 1:20 |
| Approve permissions | You (10 sec) | 2:30 |
| Review code quality | OpenCode review agent | 2:40 |
| Run type checks | OpenCode test agent | 3:20 |
| Governance audit | App governance engine | 3:40 |
| Done | — | 4:00 |

**4 minutes** and roughly **1 minute of your active time** for a feature that
would normally take a full day.

## The Key Insight

You didn't write code. You **described intent**, **approved a plan**,
**supervised execution**, and **reviewed results**. The app handled
orchestration, governance, and audit. OpenCode handled the actual coding.

The shift: from **writing code** to **directing AI that writes code**, with
full control and traceability at every step.

---

*Created: 2026-04-03*
