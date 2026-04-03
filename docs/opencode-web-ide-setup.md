# OpenCode Web IDE Setup on Termux/Android

## Problem

OpenCode is a Bun-based Linux ELF binary. On Termux (Android + proot), two issues prevent it from running:

1. **Missing glibc** — The binary needs `libc.so.6` and the glibc dynamic linker (`ld-linux-aarch64.so.1`), which don't exist in Termux's bionic environment.
2. **Bun's `listen()` fails** — Bun uses `io_uring`/low-level syscalls that proot cannot intercept. Any `opencode serve` or `opencode web` call dies with `Failed to start server on port XXXX`.

## Solution

Run OpenCode inside the **proot-distro Ubuntu rootfs**, where glibc and syscall translation work correctly.

## Prerequisites

1. **proot-distro with Ubuntu installed:**
   ```bash
   pkg install proot-distro
   proot-distro install ubuntu
   ```

2. **OpenCode binary installed:**
   ```bash
   curl -fsSL https://opencode.ai/install | bash
   # Installs to ~/.opencode/bin/opencode
   ```

3. **glibc linker symlink** (one-time setup):
   ```bash
   UBUNTU_LIB="/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/ubuntu/usr/lib"
   ln -sf "$UBUNTU_LIB/ld-linux-aarch64.so.1" \
     /data/data/com.termux/files/usr/lib/ld-linux-aarch64.so.1
   ```

## Manual Launch

Start OpenCode Web IDE on port 4200 from a Termux shell:

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
  /home/.opencode/bin/opencode serve --port 4200 --hostname 127.0.0.1
```

Then open `http://localhost:4200/` in your browser.

## How the App Integrates It

The app's Code Studio module launches OpenCode Web IDE from Job cards. The flow:

### 1. IDE button clicked (frontend)

`client/src/pages/code-studio/CodeStudioJobDetailPage.tsx` calls:
```typescript
trpc.codeStudio.ide.openForJob.mutate({ jobId })
```

On success, opens `data.directUrl` in a new tab.

### 2. Router checks for existing runtime (server)

`server/code-studio/api/router.ts` first checks if OpenCode is already running:
```
GET http://127.0.0.1:4096/global/health
```
If healthy, returns that URL directly (no spawn needed).

### 3. Spawn via proot (server)

If no runtime is running, `server/code-studio/opencode/web-instance-manager.ts` spawns a new instance. On Termux, it detects the Ubuntu rootfs and wraps the command in proot:

```
proot --kill-on-exit -r <ubuntu-rootfs> \
  -b /dev:/dev -b /proc:/proc \
  -b <home>:/home -b <tmp>:/tmp \
  -w <workspace-path> \
  /home/.opencode/bin/opencode serve --port 4200 --hostname 127.0.0.1
```

On non-Termux platforms, it spawns the binary directly with `LD_LIBRARY_PATH`.

### 4. Browser opens direct URL

The frontend opens `http://127.0.0.1:<port>/` directly (not through a proxy), because OpenCode's JS bundle uses hardcoded absolute paths (`/global/`, `/session/`, `/assets/`) that break when served under a proxy prefix.

## Key Files

| File | Role |
|---|---|
| `server/code-studio/opencode/web-instance-manager.ts` | Spawns/manages OpenCode processes |
| `server/code-studio/api/router.ts` | tRPC route — checks runtime, falls back to spawn |
| `server/code-studio/opencode/ide-proxy.ts` | HTTP proxy (kept as fallback, not used for direct URLs) |
| `server/code-studio/shared/constants.ts` | Port ranges, binary path, hostname defaults |
| `client/src/pages/code-studio/CodeStudioJobDetailPage.tsx` | Frontend IDE button handler |

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `OPENCODE_URL` | `http://127.0.0.1:4096` | Existing OpenCode runtime to check first |
| `OPENCODE_BINARY_PATH` | `$HOME/.opencode/bin/opencode` | Path to OpenCode binary |
| `OPENCODE_UBUNTU_ROOTFS` | `.../proot-distro/installed-rootfs/ubuntu` | Ubuntu rootfs for proot wrapper |
| `OPENCODE_WEB_BASE_PORT` | `4200` | First port to allocate for new instances |
| `OPENCODE_WEB_MAX_PORT` | `4299` | Last port in allocation range |
| `OPENCODE_WEB_HOSTNAME` | `127.0.0.1` | Bind hostname |
| `OPENCODE_WEB_TTL_MINUTES` | `120` | Auto-expire instances after this duration |
| `OPENCODE_SERVER_PASSWORD` | *(unset)* | Basic auth password for OpenCode Web |

## Troubleshooting

### "Failed to start server on port XXXX"
OpenCode was spawned without proot. Verify `IS_TERMUX` detection:
```bash
ls /data/data/com.termux  # must exist
ls <OPENCODE_UBUNTU_ROOTFS>/usr/bin/bash  # must exist
```

### White page when opening IDE
The browser opened the proxy URL instead of the direct URL. Check that `directUrl` is returned by the API and used by the frontend.

### "cannot execute" or "libc.so.6 not found"
The glibc linker symlink is missing. Run the one-time setup from Prerequisites step 3.

### Port already in use
Kill stale instances:
```bash
lsof -ti :4200 | xargs kill 2>/dev/null
psql -d codedb -c "DELETE FROM code_ide_instances WHERE status != 'running';"
```
