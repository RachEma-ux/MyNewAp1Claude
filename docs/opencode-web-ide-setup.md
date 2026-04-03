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

## Troubleshooting

### OpenCode shows "offline" in the app
Port 4096 is not running. Start it with the Step 2 command above. Always use `web` not `serve`.

### "Failed to start server on port XXXX"
OpenCode was spawned without proot. Verify:
```bash
ls /data/data/com.termux  # must exist
ls /data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/ubuntu/usr/bin/bash
```

### PostgreSQL won't start (`libicu.so` error)
Android moved ICU to APEX. Use the `LD_PRELOAD` command from Step 1.

### White page when opening IDE
Browser opened the proxy URL instead of the direct URL. Verify `directUrl` is returned.

### "cannot execute" or "libc.so.6 not found"
The glibc linker symlink is missing. Run Prerequisites step 3.

### Port already in use
```bash
kill $(lsof -ti :4096) 2>/dev/null
kill $(lsof -ti :4200) 2>/dev/null
psql -d codedb -c "DELETE FROM code_ide_instances WHERE status != 'running';"
```

### Startup takes >15 seconds
First launch runs a SQLite migration. Subsequent starts are faster (~8 seconds).
