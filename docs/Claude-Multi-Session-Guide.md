# Claude Code Multi-Session Guide for Termux (Mobile)

## Prerequisites

- Termux installed on Android
- Claude Code installed (`npm install -g @anthropic-ai/claude-code`)
- tmux installed (`pkg install tmux`)

---

## Step 1: Install tmux

```bash
pkg install tmux
```

## Step 2: Set Up Extra Keys Bar

Termux's default keyboard doesn't have CTRL easily accessible. Fix this:

```bash
mkdir -p ~/.termux
nano ~/.termux/termux.properties
```

Add this line:

```
extra-keys = [['ESC','/','-','HOME','UP','END','PGUP'],['TAB','CTRL','ALT','LEFT','DOWN','RIGHT','PGDN']]
```

Save and reload:

```bash
termux-reload-settings
```

You should now see a two-row extra keys bar at the bottom.

## Step 3: Configure tmux for Mobile

The default tmux prefix (Ctrl+B) is awkward on mobile. Change it to Ctrl+A:

```bash
nano ~/.tmux.conf
```

Add:

```
# Easier prefix: Ctrl+A instead of Ctrl+B
unbind C-b
set -g prefix C-a
bind C-a send-prefix

# Mouse support (useful on mobile)
set -g mouse on

# Start window numbering at 1
set -g base-index 1
```

Save the file.

## Step 4: Prevent Android from Killing Termux

Android aggressively kills background apps. Protect your sessions:

```bash
termux-wake-lock
```

> Run this every time before starting a tmux session.

## Step 5: Start Your First Claude Session

```bash
tmux new -s claude1
claude
```

You're now running Claude Code inside a tmux window.

## Step 6: Open a Second Claude Session

While inside tmux:

1. Tap **CTRL** on the extra keys bar, then tap **A**
2. Tap **C**

This opens a new tmux window. Now run:

```bash
claude
```

You now have two independent Claude Code sessions.

## Step 7: Switch Between Sessions

| Action | Keys |
|---|---|
| Next window | CTRL → A, then N |
| Previous window | CTRL → A, then P |
| Window by number | CTRL → A, then 1, 2, 3... |
| List all windows | CTRL → A, then W |

---

## Managing Sessions

### Detach from tmux (keeps everything running)

CTRL → A, then D

### Reattach later

```bash
tmux attach -t claude1
```

### List all tmux sessions

```bash
tmux ls
```

### Create a completely separate tmux session

```bash
tmux new -s claude2
```

### Kill a tmux session

```bash
tmux kill-session -t claude1
```

---

## Quick Reference: tmux Cheat Sheet (Mobile)

All shortcuts use the prefix **CTRL → A** (tap CTRL, then A, then the key).

| Shortcut | Action |
|---|---|
| Prefix + C | New window |
| Prefix + N | Next window |
| Prefix + P | Previous window |
| Prefix + W | List windows |
| Prefix + 1-9 | Go to window # |
| Prefix + D | Detach |
| Prefix + " | Split pane horizontally |
| Prefix + % | Split pane vertically |
| Prefix + Arrow | Switch pane |
| Prefix + X | Close current pane |

---

## Best Uses for Multi-Sessions

### 1. Different Projects in Each Window
- Window 1: `~/ProjectA` — backend work
- Window 2: `~/ProjectB` — Android app work
- Switch context instantly without losing conversation history

### 2. Frontend + Backend Split
- Window 1: Working on `client/src/` components and pages
- Window 2: Working on `server/` routes and APIs
- Both sessions stay focused on their domain

### 3. Code + Git Operations
- Window 1: Claude writing/editing code
- Window 2: You manually run git commands, review diffs, resolve conflicts
- No need to interrupt Claude's flow

### 4. Research + Implementation
- Window 1: Ask Claude to explore a codebase, explain architecture, find patterns
- Window 2: Actually implementing changes based on what you learn

### 5. Long Task + Quick Questions
- Window 1: Claude working on a large feature (many file edits)
- Window 2: Quick one-off questions — "how does X work?", "what's the syntax for Y?"

### 6. Bug Fix + Feature Work
- Window 1: Debugging an urgent issue
- Window 2: Continuing feature development without losing progress

> **Recommended on mobile**: Stick to **2 sessions** — keeps RAM comfortable and covers most workflows. The frontend/backend split or code/git combo tends to be the most productive.

---

## Tips

- **RAM**: Each Claude Code session uses ~200-400 MB. With limited RAM, stick to 2-3 sessions max.
- **Wake lock**: Always run `termux-wake-lock` before starting. Without it, Android may kill Termux when backgrounded.
- **No hotkeys?** You can always type tmux commands directly:
  ```bash
  tmux new-window
  tmux select-window -t 1
  tmux list-windows
  ```
- **Session naming**: Use descriptive names like `tmux new -s frontend` and `tmux new -s backend` to stay organized.
- **Scroll**: With mouse mode on, you can swipe up to scroll through terminal history inside tmux.

---

## Example Workflow

```bash
# Start of day
termux-wake-lock
tmux new -s work

# Window 1: Claude for project A
claude

# CTRL+A, C — new window
# Window 2: Claude for project B
cd ~/ProjectB
claude

# CTRL+A, C — new window
# Window 3: Git operations
git status

# Switch: CTRL+A, 1 / 2 / 3
# Detach when done: CTRL+A, D
# Come back later: tmux attach -t work
```

---

## Advanced: Agent Teams (Built-in Orchestration)

Claude Code has an experimental **Agent Teams** feature — a built-in supervisor/orchestrator pattern where one session acts as a **team lead** coordinating multiple **teammate** agents.

### How It Differs from Manual Multi-Sessions

| | Manual Multi-Sessions (tmux) | Agent Teams |
|---|---|---|
| **Control** | You switch windows and coordinate | Lead agent coordinates automatically |
| **Communication** | Via shared files | Built-in mailbox and task list |
| **Task assignment** | You tell each session what to do | Lead assigns, teammates self-claim |
| **Awareness** | Sessions are fully independent | Teammates see shared task status |

### Enable Agent Teams

Add to `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### Start an Agent Team

Just tell Claude what you need in natural language:

```
Create an agent team to build this feature. Spawn three teammates:
- One for frontend components
- One for backend API routes
- One for writing tests
```

Claude creates the team, spawns teammates, assigns tasks, and coordinates.

### Display Modes

- **In-process** (default): all teammates in your main terminal. Use `Shift+Down` to cycle between them.
- **Split panes**: each teammate gets its own tmux pane. Add to settings:
  ```json
  { "teammateMode": "tmux" }
  ```

### What the Lead Agent Can Do

- Create and manage a **shared task list**
- **Assign tasks** to specific teammates or let them self-claim
- **Require plan approval** before teammates implement changes
- **Send messages** to individual teammates or broadcast to all
- **Shut down** teammates and clean up when done

### Require Plan Approval

For risky changes, make teammates plan first:

```
Spawn an architect teammate to refactor the auth module.
Require plan approval before they make any changes.
```

The lead reviews and approves/rejects plans before implementation begins.

### Best Use Cases for Agent Teams

1. **Parallel code review** — security, performance, and test coverage each reviewed by a separate agent
2. **Feature development** — frontend, backend, and tests split across teammates
3. **Debugging competing hypotheses** — multiple agents investigate different theories simultaneously
4. **Research** — explore a problem from multiple angles at once

### Example: Parallel Code Review

```
Create an agent team to review PR #142. Spawn three reviewers:
- One focused on security implications
- One checking performance impact
- One validating test coverage
Have them each review and report findings.
```

### Example: Debugging with Competing Hypotheses

```
Users report the app exits after one message instead of staying connected.
Spawn 5 teammates to investigate different hypotheses. Have them talk to
each other to try to disprove each other's theories, like a scientific
debate.
```

### Subagents vs Agent Teams

Claude Code also has **subagents** — lightweight workers within a single session:

| | Subagents | Agent Teams |
|---|---|---|
| **Context** | Share parent's context | Fully independent |
| **Communication** | Report back to parent only | Message each other directly |
| **Coordination** | Parent manages everything | Shared task list, self-coordination |
| **Token cost** | Lower | Higher |
| **Best for** | Quick focused tasks | Complex collaborative work |

Use **subagents** for simple parallel tasks. Use **agent teams** when agents need to discuss, challenge, and coordinate with each other.

### Limitations (Experimental)

- No session resumption for teammates after `/resume`
- One team per session
- No nested teams (teammates can't spawn their own teams)
- Higher token usage (each teammate is a full Claude instance)
- Split pane mode requires tmux
- Lead is fixed for the lifetime of the team

### Cleanup

Always clean up when done:

```
Clean up the team
```

Shut down all teammates first, then ask the lead to clean up.

---

## Auto-Approve Bash Commands (No More Prompts)

By default, Claude Code asks permission for every Bash command. You can pre-approve commands in `~/.claude/settings.json`.

### Option 1: Allow All Bash Commands (Recommended)

```json
{
  "permissions": {
    "allow": [
      "Read",
      "Write",
      "Edit",
      "Glob",
      "Grep",
      "WebFetch",
      "WebSearch",
      "NotebookEdit",
      "Bash(*)"
    ]
  }
}
```

`Bash(*)` is a wildcard — Claude can run any command without asking.

### Option 2: Allow Specific Commands Only

If you prefer granular control:

```json
{
  "permissions": {
    "allow": [
      "Bash(git *)",
      "Bash(npm *)",
      "Bash(node *)",
      "Bash(grep *)",
      "Bash(python3 *)",
      "Bash(gh *)",
      "Bash(curl *)",
      "Bash(ls *)",
      "Bash(mkdir *)",
      "Bash(cp *)",
      "Bash(mv *)"
    ]
  }
}
```

Each entry follows the pattern `Bash(command-pattern)` where `*` is a wildcard.

### Combined Settings File (Full Example)

Here's a complete `~/.claude/settings.json` with Agent Teams + full Bash access:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  },
  "permissions": {
    "allow": [
      "Read",
      "Write",
      "Edit",
      "Glob",
      "Grep",
      "WebFetch",
      "WebSearch",
      "NotebookEdit",
      "Bash(*)"
    ]
  }
}
```

> Changes take effect on the next `claude` session — no restart needed.

---

## Appendix: Agent Teams Audit Demo Results

The following audit was performed by an Agent Team with 3 specialized teammates running in parallel against the MyNewAp1Claude codebase. It demonstrates the power of multi-agent orchestration for code review.

**Team composition:**
- **code-quality** (blue) — server code patterns, error handling, dead code
- **security-auditor** (green) — secrets, XSS, auth gaps, insecure defaults
- **completeness-auditor** (yellow) — TODOs, mock data, stubs, "coming soon" text

### CRITICAL Findings

| # | Issue | File | Impact |
|---|---|---|---|
| 1 | SQL injection via `sql.raw()` | `server/automation/block-executors.ts:101` | User-supplied query passed directly — full DB compromise |
| 2 | Hardcoded Render API key | `.env:1` | Live key on disk (not in git, but should be rotated) |
| 3 | DEV_MODE bypasses all auth | `server/_core/context.ts:18-36` | Every request auto-authed as admin when `DEV_MODE=true` |

### HIGH Findings

| # | Issue | File |
|---|---|---|
| 4 | SSRF in HTTP executor — fetches arbitrary URLs without SSRF guard | `server/automation/block-executors.ts:55-81` |
| 5 | Hardcoded encryption fallback key — provider keys encrypted with public default | `server/_core/encryption.ts:22-24` |
| 6 | Static salt in key derivation | `server/_core/encryption.ts:28` |
| 7 | Session cookies: SameSite=None + 1-year expiry | `server/_core/cookies.ts:42-48` |
| 8 | No security headers (helmet, CSP, X-Frame-Options) | `server/_core/index.ts` |
| 9 | Inconsistent error handling — `routers.ts` throws `Error` instead of `TRPCError` (~20 routes) | `server/routers.ts` |
| 10 | Hardcoded user ID fallback `?? 1` when auth context missing | `server/routers/discovery-ops.ts:469,497,522` |

### MEDIUM Findings

| # | Issue | Details |
|---|---|---|
| 11 | Upload endpoint has no auth | `server/upload.ts:14` — anyone can upload 50MB files |
| 12 | Excessive public tRPC routes | Diagnostic (4), deploy (5), wiki (8), actions, templates, triggers |
| 13 | No global rate limiting | Only catalog import has rate limits |
| 14 | Provider keys stored as plaintext via auto-provision path | `server/_core/index.ts:128-134` |
| 15 | 130+ `as any` type assertions | Worst: agents-control-plane (15), providers/router (11) |
| 16 | 5 orphaned router files never mounted | opaPolicy, orchestrator, backup, logging, documents/router |
| 17 | 4 document router surfaces | Confusing overlap — 3 files + inline in routers.ts |
| 18 | 6 module-level `setInterval`s with no cleanup | realtime-service, batch-service, resource-manager, etc. |
| 19 | `db.ts` is 2068 lines | Single file for all DB queries |

### Incomplete Features (30+ simulated)

**Core systems still mocked/simulated:**
- OPA policy engine (mock verification, mock digests)
- llama.cpp inference (returns simulated text)
- Workflow execution engine (fully simulated)
- Document extraction (PDF/DOCX return placeholders)
- Voice service (transcription, synthesis, commands all simulated)
- Model downloads (simulated with fake manifests)
- Benchmarks (5-second sleep with fake results)
- GGUF toolchain (conversion/quantization simulated)
- Embedding generation (simulated)
- Chat router doesn't save conversations to DB
- OpenAI-compatible API accepts any key

**27 TODOs** across server code, **18 "Coming Soon"** in UI, **7 `alert()` calls** that should be toasts, **294 `console.log`** in server, **130+ `as any`** type casts.

### Positive Security Observations

- SSRF guard implementation is comprehensive (just not used everywhere)
- Secrets management module uses proper PBKDF2+AES-256-GCM
- tRPC auth middleware correctly enforces procedure levels
- Provider router properly uses `protectedProcedure`
- Drizzle ORM queries use parameterized queries (SQL injection isolated to one file)
- `.env` is in `.gitignore` and not tracked by git

---

## References

- [Agent Teams - Claude Code Docs](https://code.claude.com/docs/en/agent-teams)
- [Subagents - Claude Docs](https://docs.claude.com/en/docs/agent-sdk/subagents)
- [Claude Agent SDK - npm](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)

---

*Guide created for Termux on Android (aarch64). Tested with Claude Code v2.1.42 and tmux.*
