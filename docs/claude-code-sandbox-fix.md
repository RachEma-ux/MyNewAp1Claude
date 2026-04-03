# Claude Code Sandbox Fix for Termux/Android

**Issue:** [anthropics/claude-code#40126](https://github.com/anthropics/claude-code/issues/40126)
**Applied to:** v2.1.91
**Date:** 2026-04-03

## Problem

The Bash tool sandbox hardcodes `/tmp/claude` as the TMPDIR fallback. On Termux/Android, `/tmp` may be read-only, causing every Bash tool call to fail with `EACCES: permission denied, mkdir '/tmp/claude-{pid}'`.

## Fix

Patch two locations in `cli.js` to use `os.tmpdir()` (aliased as `iC1`) instead of hardcoded `/tmp`.

**Target file:** `$PREFIX/lib/node_modules/@anthropic-ai/claude-code/cli.js`

### Patch 1 — TMPDIR fallback (function `Pk8`)

```
Before: TMPDIR=${process.env.CLAUDE_TMPDIR||"/tmp/claude"}
After:  TMPDIR=${process.env.CLAUDE_TMPDIR||iC1()+"/claude-"+process.getuid()}
```

### Patch 2 — Deny list paths (function `oi6`)

```
Before: "/tmp/claude","/private/tmp/claude"
After:  iC1()+"/claude",iC1().replace(/^\/tmp/,"/private/tmp")+"/claude"
```

## One-liner patch commands

```bash
CLI_JS="$PREFIX/lib/node_modules/@anthropic-ai/claude-code/cli.js"

# Backup
cp "$CLI_JS" "$CLI_JS.bak"

# Patch 1: TMPDIR fallback
sed -i 's|process.env.CLAUDE_TMPDIR||"/tmp/claude"|process.env.CLAUDE_TMPDIR||iC1()+"/claude-"+process.getuid()|' "$CLI_JS"

# Patch 2: Deny list paths
sed -i 's|"/tmp/claude","/private/tmp/claude"|iC1()+"/claude",iC1().replace(/^\\/tmp/,"/private/tmp")+"/claude"|' "$CLI_JS"

# Verify
grep -oP 'TMPDIR=\$\{[^}]+\}' "$CLI_JS"
claude --version
```

## Notes

- This patch is overwritten on `npm update` — re-apply after upgrading Claude Code.
- `iC1` is the minified alias for `os.tmpdir()` from `node:os`. If the alias changes in a future version, grep for `tmpdir as` to find the new name.
- On Termux, `os.tmpdir()` resolves to `/data/data/com.termux/files/usr/tmp`.
