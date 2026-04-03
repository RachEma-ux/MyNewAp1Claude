# Installing OpenCode on Android (Termux) — Step-by-Step Guide

> **Problem:** OpenCode does not ship a native Android/ARM64 binary.
> The npm installer looks for `opencode-android-arm64` (which doesn't exist),
> and the GitHub release binary is a non-PIE ELF executable that Android's
> kernel refuses to run. This guide documents the workaround we used to get
> OpenCode v1.3.13 running on Termux with `proot-distro` Ubuntu.

---

## Prerequisites

| Tool | Install |
|------|---------|
| Termux (up to date) | `pkg update -y && pkg upgrade -y` |
| Node.js | `pkg install -y nodejs` |
| curl / wget | `pkg install -y curl` (or `wget`) |
| proot-distro | `pkg install -y proot-distro` |
| Ubuntu rootfs | `proot-distro install ubuntu` |

---

## What We Tried (and Why It Failed)

### Attempt 1 — `npm install -g opencode-ai`

```bash
npm install -g opencode-ai
```

**Result:** Failed. The postinstall script detects the OS as `android` and
constructs the package name `opencode-android-arm64`, which does not exist
in the npm registry. Only `opencode-linux-arm64` is published.

```
Failed to setup opencode binary: Could not find package opencode-android-arm64
```

### Attempt 2 — GitHub Release Binary (Go build, v0.0.55)

```bash
curl -L "https://github.com/opencode-ai/opencode/releases/latest/download/opencode-linux-arm64.tar.gz" \
  -o /data/data/com.termux/files/usr/tmp/oc.tar.gz
tar xzf /data/data/com.termux/files/usr/tmp/oc.tar.gz
./opencode --version
```

**Result:** Binary downloads and extracts fine (41 MB, statically linked),
but Android rejects it at exec time:

```
error: "opencode" has unexpected e_type: 2
```

**Why:** Android requires PIE (Position Independent Executables, ELF type
`ET_DYN` / e_type=3). The Go release binary is `ET_EXEC` (e_type=2) —
a standard Linux executable that won't run on Android regardless of
architecture match.

### Attempt 3 — `proot` wrapper on the Go binary

```bash
proot ./opencode --version
```

**Result:** Same `e_type: 2` error. `proot` intercepts syscalls but cannot
change how the kernel validates the ELF header at load time.

---

## What Worked

### Step 1 — Download the npm platform binary directly

The npm package `opencode-linux-arm64@1.3.13` contains a dynamically linked
Linux ARM64 binary (161 MB) that is newer (v1.3.13) than the GitHub release
(v0.0.55) and includes the `serve` subcommand.

Get the tarball URL from the npm registry:

```bash
curl -sL "https://registry.npmjs.org/opencode-linux-arm64/1.3.13" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['dist']['tarball'])"
```

Download it:

```bash
wget -q "https://registry.npmjs.org/opencode-linux-arm64/-/opencode-linux-arm64-1.3.13.tgz" \
  -O /data/data/com.termux/files/usr/tmp/opencode-npm.tgz
```

> **Note:** `curl` with long downloads can be unreliable in Termux sandboxed
> sessions. `wget` in background (`nohup wget ... &`) worked more reliably.
> Always verify the file size after download — a truncated `.tgz` will fail
> to extract.

### Step 2 — Extract and install

```bash
cd /data/data/com.termux/files/usr/tmp
tar xzf opencode-npm.tgz
mkdir -p ~/.opencode/bin
cp package/bin/opencode ~/.opencode/bin/opencode
chmod +x ~/.opencode/bin/opencode
```

### Step 3 — Run via proot-distro Ubuntu

The binary is dynamically linked against `/lib/ld-linux-aarch64.so.1` (glibc),
which does not exist in Termux. `proot-distro` provides a full Ubuntu rootfs
with the correct linker and shared libraries.

Verify it works:

```bash
proot-distro login ubuntu -- ~/.opencode/bin/opencode -v
# Output: 1.3.13
```

### Step 4 — Start the server

Create a launcher script for convenience:

```bash
cat > /data/data/com.termux/files/usr/tmp/run-oc-serve.sh << 'EOF'
#!/bin/bash
proot-distro login ubuntu -- \
  /data/data/com.termux/files/home/.opencode/bin/opencode \
  serve --hostname 127.0.0.1 --port 4096
EOF
chmod +x /data/data/com.termux/files/usr/tmp/run-oc-serve.sh
```

Run it:

```bash
nohup /data/data/com.termux/files/usr/tmp/run-oc-serve.sh \
  > /data/data/com.termux/files/usr/tmp/oc-serve.log 2>&1 &
```

Expected log output:

```
Performing one time database migration, may take a few minutes...
sqlite-migration:done
Database migration complete.
Warning: OPENCODE_SERVER_PASSWORD is not set; server is unsecured.
opencode server listening on http://127.0.0.1:4096
```

### Step 5 — Verify

```bash
curl -s http://127.0.0.1:4096/global/health
# {"healthy":true,"version":"1.3.13"}

curl -s http://127.0.0.1:4096/session
# []
```

---

## Integration with MyNewAp1Claude

No code changes required. The Code Studio module already defaults to
`http://127.0.0.1:4096`:

| File | What |
|------|------|
| `server/code-studio/shared/constants.ts` | `OPENCODE_DEFAULT_URL = "http://127.0.0.1:4096"` |
| `server/code-studio/opencode/config.ts` | Reads `OPENCODE_URL` env var, falls back to default |
| `server/code-studio/opencode/client.ts` | Full HTTP client (health, sessions, messages, diffs, agents) |

To override the URL, set the environment variable before starting the app:

```bash
export OPENCODE_URL="http://127.0.0.1:4096"
```

To add basic auth:

```bash
export OPENCODE_SERVER_PASSWORD="your-password"
export OPENCODE_SERVER_USERNAME="opencode"   # optional, defaults to "opencode"
```

---

## Quick Reference

| Action | Command |
|--------|---------|
| Start server | `nohup /data/data/com.termux/files/usr/tmp/run-oc-serve.sh > /data/data/com.termux/files/usr/tmp/oc-serve.log 2>&1 &` |
| Stop server | `pkill -f "opencode serve"` |
| Check health | `curl -s http://127.0.0.1:4096/global/health` |
| View API docs | Open `http://127.0.0.1:4096/doc` in browser |
| View logs | `cat /data/data/com.termux/files/usr/tmp/oc-serve.log` |
| Check version | `proot-distro login ubuntu -- ~/.opencode/bin/opencode -v` |

---

## Why This Works

| Layer | Detail |
|-------|--------|
| **Binary** | `opencode-linux-arm64` from npm — dynamically linked, glibc-based |
| **Runtime** | `proot-distro` Ubuntu provides `/lib/ld-linux-aarch64.so.1` and glibc |
| **Kernel** | proot translates syscalls; Ubuntu rootfs satisfies the dynamic linker |
| **Network** | Server binds to `127.0.0.1:4096` — accessible from Termux and the app |

The GitHub Go binary (v0.0.55) is statically linked but compiled as `ET_EXEC`,
which Android blocks. The npm binary (v1.3.13) is `ET_DYN` (dynamically
linked) — proot-distro can run it because it provides the full Linux userspace.

---

*Created: 2026-04-03 — OpenCode v1.3.13 on Termux (Android 13, aarch64)*
