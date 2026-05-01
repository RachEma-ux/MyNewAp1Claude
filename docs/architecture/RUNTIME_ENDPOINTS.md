# Runtime Endpoints

Authoritative list of every endpoint the platform binds to or talks
to. Maintained in lockstep with the Port Registry — any new entry
here must also exist as a `ModulePortDeclaration` (default or
manifest-level) and vice versa.

If you want the live snapshot (with current reservations and health),
hit `hq.platformModular` and look at the `ports` field; that data
flows from `getPortRegistry().snapshot()`.

## Platform-owned

| Key | Default | Env override | Mode | Protocol | Notes |
|---|---|---|---|---|---|
| `platform/http` | `0.0.0.0:3000` | `PORT` | single | http | Express + Vite HMR. Falls back to scanning forward 20 ports if 3000 is taken. |
| `platform/postgres` | `127.0.0.1:5432` | `DATABASE_URL` | external | postgres | Hosts platform DB and every module-owned DB. |
| `platform/ollama` | `http://localhost:11434` | `OLLAMA_BASE_URL` | external | http | Local LLM runtime for embeddings + chat. |

## Module-owned

| Module | Key | Default | Env override | Mode | Notes |
|---|---|---|---|---|---|
| Code Studio | `opencode-runtime` | `http://127.0.0.1:4096` | `OPENCODE_URL` | external | Targets the OpenCode runtime HTTP API. |
| Code Studio | `opencode-web` | `127.0.0.1:4200–4299` | `OPENCODE_WEB_BASE_PORT` / `OPENCODE_WEB_MAX_PORT` | range | One TCP port per running OpenCode Web instance. |
| Code Studio | `codedb` | `postgres://127.0.0.1:5432/codedb` | `DATABASE_URL_CODEDB` | external | Module-owned DB. |
| Agent Studio | `asdb` | `postgres://127.0.0.1:5432/asdb` | `DATABASE_URL_ASDB` | external | Module-owned DB. |
| PRM | `prmdb` | `postgres://127.0.0.1:5432/prmdb` | `DATABASE_URL_PRMDB` | external | Module-owned DB. |
| PSM | `psmdb` | `postgres://127.0.0.1:5432/psmdb` | `DATABASE_URL_PSMDB` | external | Module-owned DB. |
| RAG | `ragdb` | `postgres://127.0.0.1:5432/ragdb` | `DATABASE_URL_RAGDB` | external | Module-owned DB. |
| Sandbox WF | `wfdb` | `postgres://127.0.0.1:5432/wfdb` | `DATABASE_URL_WFDB` | external | Module-owned DB. |

## Reserved port ranges

| Range | Owner | Use |
|---|---|---|
| 3000–3019 | Platform | Main HTTP listener fallback scan. |
| 4096 | Code Studio | OpenCode runtime (single endpoint). |
| 4200–4299 | Code Studio | OpenCode Web instances (one per session). |
| 5432 | Postgres | Single host port shared across all module DBs. |
| 11434 | Ollama | Local LLM runtime. |

## Adding a new endpoint

1. Pick a key prefixed by your module name. Avoid 3000–3019, 4200–4299,
   and the well-known service ports above.
2. Add a `ModulePortDeclaration` entry to your manifest's
   `runtimePorts` block (or to `default-declarations.ts` if it's a
   platform-wide endpoint).
3. Update this table.
4. Run `pnpm run check:ports`.

## Termux note

This repo's CLAUDE.md instructs Claude not to run builds, tests, or
dev servers on the device — let CI handle it. If you must verify
locally, the `pnpm run check:ports` script is static and safe to run
without a database or server.
