# Platform Port Registry

The Port Registry is the platform's single source of truth for runtime
endpoints — TCP ports, URLs, and external services. It exists so two
modules can never silently grab the same socket and so operators have
one place to look up what's listening where.

## Where it lives

```
server/platform/ports/
  ├── types.ts                   — type definitions (declarations, reservations, snapshots)
  ├── registry.ts                — PortRegistry class + singleton
  ├── default-declarations.ts    — platform-owned defaults (HTTP, Postgres, Ollama)
  └── index.ts                   — public entry point
```

Module-specific endpoints live in the relevant module manifest's
`runtimePorts` block (e.g. `server/code-studio/manifest.ts` declares
`opencode-web` and `opencode-runtime`). The registry merges these with
the defaults at registration time.

## Concepts

| Concept | Purpose |
|---|---|
| `ModulePortDeclaration` | A module says "I will use this endpoint." Registered once at boot. |
| `PortReservation` | A live binding against a declaration. One per running instance. |
| `PortStatusSnapshot` | What the dashboard reads — declarations + reservations + computed health. |

### Modes

- `single` — one fixed port (e.g. platform HTTP on 3000).
- `range` — a [min, max] range; the runtime picks a free port at allocation time (OpenCode Web 4200–4299).
- `external` — we point at a service we don't own (Ollama, Postgres).
- `derived` — URL-only endpoint composed from other config.
- `disabled` — explicitly off, included in topology for completeness.

### Protocols

`http`, `https`, `tcp`, `ws`, `wss`, `postgres`, `custom`.

## Lifecycle

1. **Boot** — `getModuleRegistry().register()` calls into the port
   registry to seed defaults (once) and register the manifest's
   `runtimePorts`. Errors here are loud — schema drift on re-register
   is a hard throw.
2. **Conflict check** — `RuntimeManager.boot()` calls
   `detectConflicts()` before any module's boot hook runs and logs
   declaration-level collisions. (Today this only warns; promoting to
   fail-fast is a one-line flip when we're confident no false
   positives sneak through.)
3. **Reservation** — code that binds a port (the main HTTP listener,
   the OpenCode Web allocator) calls `reservePort` so the topology
   view reflects what's actually in use.
4. **Release** — when a process dies or is closed, the owner calls
   `releasePort` (or `releaseByOwnerRef` for cleanup).

## Static checks

`pnpm run check:ports` walks every manifest, builds the registry from
defaults + `runtimePorts`, and:
- validates declaration shapes (mode/protocol/port presence)
- runs `detectConflicts()` and prints any clashes
- exits non-zero on blocker findings

`check:ports` is included in `check:architecture:full`.

## Adding a new endpoint

1. **Module-owned endpoint** → add an entry to the module manifest's
   `runtimePorts` array. The `moduleKey` is derived from the
   manifest's `key`.
2. **Platform-wide endpoint** → add an entry to
   `server/platform/ports/default-declarations.ts` AND document it in
   `docs/architecture/RUNTIME_ENDPOINTS.md`.
3. Run `pnpm run check:ports` to confirm no conflicts.

## Termux note

This repo's CLAUDE.md instructs Claude not to run builds, tests, or
dev servers on the device — work is committed and pushed to GitHub
where CI runs the validation. The same applies to the port-registry
checks: always rely on CI's run, not a local probe.
