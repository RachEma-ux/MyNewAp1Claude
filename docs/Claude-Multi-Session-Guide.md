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

*Guide created for Termux on Android (aarch64). Tested with Claude Code v2.1.42 and tmux.*
