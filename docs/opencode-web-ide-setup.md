# OpenCode Web IDE Setup on Termux/Android

## Problem

OpenCode is a Bun-based Linux ELF binary. On Termux (Android + proot), two issues prevent it from running:

1. **Missing glibc** — The binary needs `libc.so.6` and the glibc dynamic linker (`ld-linux-aarch64.so.1`), which don't exist in Termux's bionic environment.
2. **Bun's `listen()` fails** — Bun uses `io_uring`/low-level syscalls that proot cannot intercept. Any `opencode serve` or `opencode web` call dies with `Failed to start server on port XXXX`.

## Solution

Run OpenCode inside the **proot-distro Ubuntu rootfs**, where glibc and syscall translation work correctly.

---

## Startup Protocol

### Step 0: One-time prerequisites

```bash
# 1. Install proot-distro + Ubuntu
pkg install proot-distro
proot-distro install ubuntu

# 2. Install OpenCode
curl -fsSL https://opencode.ai/install | bash

# 3. Create glibc linker symlink
UBUNTU_LIB="/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/ubuntu/usr/lib"
ln -sf "$UBUNTU_LIB/ld-linux-aarch64.so.1" \
  /data/data/com.termux/files/usr/lib/ld-linux-aarch64.so.1
```

### Step 1: Start PostgreSQL

PostgreSQL requires an ICU shim on recent Android versions:

```bash
export LD_PRELOAD="/apex/com.android.i18n/lib64/libicuuc.so:/apex/com.android.i18n/lib64/libicui18n.so:/apex/com.android.i18n/lib64/libicu.so:/apex/com.android.i18n/lib64/libandroidicu.so"
pg_ctl -D /data/data/com.termux/files/usr/var/lib/postgresql start -l /data/data/com.termux/files/usr/tmp/pg.log
unset LD_PRELOAD
```

Verify:
```bash
psql -d mynewap1claude -c "SELECT 1;"
```

### Step 2: Start OpenCode runtime on port 4096

This is the **critical step**. Use `web` subcommand (not `serve`) — it provides both:
- **Headless API** (`/global/health`, `/session/...`) for the app's runtime integration
- **Web UI** (`/`) for the browser-based IDE

```bash
UBUNTU_ROOT="/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/ubuntu"

nohup proot \
  --kill-on-exit \
  -r "$UBUNTU_ROOT" \
  -b /dev:/dev \
  -b /proc:/proc \
  -b /data/data/com.termux/files/home:/home \
  -b /data/data/com.termux/files/usr/tmp:/tmp \
  -w /home/MyNewAp1Claude \
  /home/.opencode/bin/opencode web --port 4096 --hostname 127.0.0.1 \
  > /data/data/com.termux/files/usr/tmp/opencode-runtime.log 2>&1 &
```

Verify (wait ~15 seconds for startup):
```bash
curl -s http://127.0.0.1:4096/global/health
# Expected: {"healthy":true,"version":"1.3.13"}
```

### Step 3: Start the app dev server on port 3000

```bash
mkdir -p /tmp/claude-$(id -u) 2>/dev/null
TMPDIR=/data/data/com.termux/files/usr/tmp nohup npm run dev \
  > /data/data/com.termux/files/usr/tmp/dev-server.log 2>&1 &
```

Verify (wait ~20 seconds):
```bash
curl -s http://localhost:3000/api/health
# Expected: {"status":"ok","database":"connected",...}
```

### Step 4: Open app and verify

```bash
xdg-open "http://localhost:3000/"
```

In the app:
- OpenCode Settings page should show **Connected** status
- Code Studio Job cards should have a working **Open IDE** button
- Clicking IDE opens `http://127.0.0.1:4096/` with the full OpenCode Web interface

---

## Quick-start (all steps combined)

```bash
# 1. PostgreSQL
export LD_PRELOAD="/apex/com.android.i18n/lib64/libicuuc.so:/apex/com.android.i18n/lib64/libicui18n.so:/apex/com.android.i18n/lib64/libicu.so:/apex/com.android.i18n/lib64/libandroidicu.so"
pg_ctl -D /data/data/com.termux/files/usr/var/lib/postgresql start -l /data/data/com.termux/files/usr/tmp/pg.log
unset LD_PRELOAD

# 2. OpenCode runtime (port 4096)
UBUNTU_ROOT="/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/ubuntu"
nohup proot --kill-on-exit -r "$UBUNTU_ROOT" \
  -b /dev:/dev -b /proc:/proc \
  -b /data/data/com.termux/files/home:/home \
  -b /data/data/com.termux/files/usr/tmp:/tmp \
  -w /home/MyNewAp1Claude \
  /home/.opencode/bin/opencode web --port 4096 --hostname 127.0.0.1 \
  > /data/data/com.termux/files/usr/tmp/opencode-runtime.log 2>&1 &

# 3. App dev server (port 3000)
sleep 5
TMPDIR=/data/data/com.termux/files/usr/tmp nohup npm run dev \
  > /data/data/com.termux/files/usr/tmp/dev-server.log 2>&1 &

# 4. Wait and verify
sleep 20
curl -s http://127.0.0.1:4096/global/health && echo ""
curl -s http://localhost:3000/api/health && echo ""
xdg-open "http://localhost:3000/"
```

---

## Why `web` not `serve`

| Subcommand | Headless API | Web UI | Use case |
|---|---|---|---|
| `opencode serve` | Yes | No | API-only integration, no browser IDE |
| `opencode web` | Yes | Yes | Full setup: app integration + browser IDE |

Port 4096 must use `web` so the app can both:
- Query the headless API (health checks, sessions, models)
- Redirect the IDE button to the web interface

---

## How the App Integrates It

### IDE button flow

1. **Frontend** (`CodeStudioJobDetailPage.tsx`) calls `trpc.codeStudio.ide.openForJob`
2. **Router** (`server/code-studio/api/router.ts`) checks `http://127.0.0.1:4096/global/health`
3. If healthy: returns `directUrl: "http://127.0.0.1:4096/"` immediately
4. If not running: spawns a new instance via proot on next available port (4200+)
5. **Frontend** opens `directUrl` in a new browser tab

### Why direct URL (not proxy)

OpenCode's JS bundle uses hardcoded absolute paths (`/global/`, `/session/`, `/assets/`). These break when served under a proxy prefix like `/api/code-studio/ide/:key/`. Opening the direct port avoids this entirely.

---

## Key Files

| File | Role |
|---|---|
| `server/code-studio/opencode/web-instance-manager.ts` | Spawns/manages OpenCode processes via proot |
| `server/code-studio/api/router.ts` | tRPC route — checks runtime, falls back to spawn |
| `server/code-studio/opencode/ide-proxy.ts` | HTTP proxy (fallback, not used for direct URLs) |
| `server/code-studio/shared/constants.ts` | Port ranges, binary path, hostname defaults |
| `client/src/pages/code-studio/CodeStudioJobDetailPage.tsx` | Frontend IDE button handler |

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `OPENCODE_URL` | `http://127.0.0.1:4096` | Existing runtime to check first |
| `OPENCODE_BINARY_PATH` | `$HOME/.opencode/bin/opencode` | Path to OpenCode binary |
| `OPENCODE_UBUNTU_ROOTFS` | `.../proot-distro/installed-rootfs/ubuntu` | Ubuntu rootfs for proot wrapper |
| `OPENCODE_WEB_BASE_PORT` | `4200` | First port for new instances |
| `OPENCODE_WEB_MAX_PORT` | `4299` | Last port in allocation range |
| `OPENCODE_WEB_HOSTNAME` | `127.0.0.1` | Bind hostname |
| `OPENCODE_WEB_TTL_MINUTES` | `120` | Auto-expire instances after this |
| `OPENCODE_SERVER_PASSWORD` | *(unset)* | Basic auth password |

---

## Termux Troubleshooting

### OpenCode shows "offline" in the app
Port 4096 is not running. Start it with the Step 2 command above. Always use `web` not `serve`.

### "Failed to start server on port XXXX"
Bun's `listen()` cannot bind ports under Termux's default proot. OpenCode must be spawned through the Ubuntu rootfs proot. Verify the rootfs exists:
```bash
ls /data/data/com.termux  # must exist
ls /data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/ubuntu/usr/bin/bash
```
If missing, install it:
```bash
pkg install proot-distro && proot-distro install ubuntu
```

### "cannot execute" or "libc.so.6 not found"
The glibc dynamic linker symlink is missing. This is a one-time fix:
```bash
UBUNTU_LIB="/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/ubuntu/usr/lib"
ln -sf "$UBUNTU_LIB/ld-linux-aarch64.so.1" \
  /data/data/com.termux/files/usr/lib/ld-linux-aarch64.so.1
```

### "bad ELF magic" or shell crashes when LD_LIBRARY_PATH is set
Never use `execSync` (spawns a shell) with glibc `LD_LIBRARY_PATH` — the Termux bionic shell tries to load glibc's `libc.so` and crashes. Use `execFileSync` (direct exec, no shell) instead. The app already handles this internally.

### PostgreSQL won't start (`libicu.so` error)
Android moved system ICU libraries to `/apex/com.android.i18n/lib64/`. PostgreSQL needs them preloaded:
```bash
export LD_PRELOAD="/apex/com.android.i18n/lib64/libicuuc.so:/apex/com.android.i18n/lib64/libicui18n.so:/apex/com.android.i18n/lib64/libicu.so:/apex/com.android.i18n/lib64/libandroidicu.so"
pg_ctl -D /data/data/com.termux/files/usr/var/lib/postgresql start -l /data/data/com.termux/files/usr/tmp/pg.log
unset LD_PRELOAD
```
This is required after every Android OTA update that restructures APEX modules.

### White page when opening IDE
Browser opened the proxy URL (`/api/code-studio/ide/:key/`) instead of the direct URL. OpenCode's JS uses hardcoded absolute paths (`/global/`, `/session/`, `/assets/`) that break through a proxy. The app should return `directUrl` (`http://127.0.0.1:<port>/`) — verify the frontend uses `data.directUrl`.

### Port already in use
```bash
kill $(lsof -ti :4096) 2>/dev/null
kill $(lsof -ti :4200) 2>/dev/null
psql -d codedb -c "DELETE FROM code_ide_instances WHERE status != 'running';"
```

### Startup takes >15 seconds
First launch runs a SQLite migration (`Performing one time database migration`). Delete the DB to force a clean migration if it's corrupted:
```bash
rm -f /home/.local/share/opencode/opencode.db*
```
Subsequent starts are ~8 seconds.

### Termux process killed after screen off
Android aggressively kills background processes. Options:
- Acquire a Termux wake lock: `termux-wake-lock`
- Disable battery optimization for Termux in Android settings
- Use `tmux` or `screen` to keep sessions alive

---

## Ubuntu proot-distro Usage

### Why Ubuntu is required

OpenCode is built with Bun (a JavaScript runtime). Bun uses Linux-specific syscalls (`io_uring`, `epoll_create1`) that Termux's default proot cannot intercept because:
1. Termux runs on Android's bionic libc, not glibc
2. The default proot translates paths but not advanced syscalls
3. Bun's compiled binary expects a full Linux userspace

The Ubuntu proot-distro provides a complete Linux rootfs where these syscalls work through proot's syscall translation layer.

### Managing the Ubuntu rootfs

```bash
# Install
proot-distro install ubuntu

# Login interactively
proot-distro login ubuntu

# Run a single command
proot-distro login ubuntu -- <command>

# Check installed distros
proot-distro list
```

### Running commands through proot directly

For the app's automated spawning, we use `proot` directly (not `proot-distro login`) for more control over bind mounts:

```bash
UBUNTU_ROOT="/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/ubuntu"

proot \
  --kill-on-exit \
  -r "$UBUNTU_ROOT" \
  -b /dev:/dev \
  -b /proc:/proc \
  -b /data/data/com.termux/files/home:/home \
  -b /data/data/com.termux/files/usr/tmp:/tmp \
  -w /home/MyNewAp1Claude \
  <command>
```

### Bind mount reference

| Flag | Purpose |
|---|---|
| `-r $UBUNTU_ROOT` | Use Ubuntu as the root filesystem |
| `-b /dev:/dev` | Device nodes (required for /dev/null, /dev/urandom) |
| `-b /proc:/proc` | Process info (required for Bun runtime) |
| `-b .../home:/home` | Termux home directory visible inside Ubuntu |
| `-b .../tmp:/tmp` | Shared temp directory (PG sockets, logs) |
| `-w /path` | Working directory inside proot |
| `--kill-on-exit` | Kill child processes when proot exits |

### What runs inside Ubuntu vs native Termux

| Process | Where | Why |
|---|---|---|
| OpenCode (`web`/`serve`) | Ubuntu proot | Bun needs glibc + full syscalls |
| PostgreSQL | Native Termux | Works natively with `LD_PRELOAD` ICU shim |
| Node.js app (npm run dev) | Native Termux | Node.js works natively on Termux |
| Claude Code | Native Termux | Runs through its own sandbox |
| git, curl, npm | Native Termux | Standard Termux packages |

### Updating the Ubuntu rootfs

```bash
proot-distro login ubuntu -- apt update && apt upgrade -y
```

### Disk space

The Ubuntu rootfs uses ~500MB. Check usage:
```bash
du -sh /data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/ubuntu/
```

### Removing and reinstalling

If the rootfs is corrupted:
```bash
proot-distro remove ubuntu
proot-distro install ubuntu
```
OpenCode binary at `~/.opencode/bin/opencode` is outside the rootfs and will survive this.
