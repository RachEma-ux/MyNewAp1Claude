# OpenCode Web IDE Integration

## Overview

Code Studio provides an **Open in OpenCode Web** feature that launches browser-based
IDE sessions bound to job workspaces. Each IDE instance is proxied through a stable
internal route so raw ports are never exposed to users.

## Architecture

```
Browser ──▶ /api/code-studio/ide/:proxyKey/* ──▶ localhost:<allocated-port>
              (Express reverse proxy)              (opencode web process)
```

### Key Components

| Layer | File | Responsibility |
|-------|------|----------------|
| DB | `drizzle/tables/codedb.ts` | `codeIdeInstances` table (Group 12) |
| Constants | `server/code-studio/shared/constants.ts` | Port range, TTL, binary path |
| Types | `server/code-studio/opencode/types.ts` | `IdeInstance`, `IdeInstanceLaunchResult` |
| Schemas | `server/code-studio/shared/schemas.ts` | Zod validation for IDE endpoints |
| Repository | `server/code-studio/repository.ts` | IDE instance CRUD operations |
| Manager | `server/code-studio/opencode/web-instance-manager.ts` | Process lifecycle, port allocation, health checks |
| Proxy | `server/code-studio/opencode/ide-proxy.ts` | Express router — HTTP reverse proxy |
| API | `server/code-studio/api/router.ts` | tRPC `ide.*` endpoints |
| Mount | `server/_core/index.ts` | Proxy mounted before body-parsing middleware |
| Frontend | `client/src/pages/code-studio/CodeStudioJobDetailPage.tsx` | "Open IDE" button on job dashboard bar |
| Frontend | `client/src/pages/code-studio/CodeStudioSessionsPage.tsx` | "Open IDE" button per session card |

## Instance Lifecycle

1. **User clicks "Open IDE"** on a job detail page or session card.
2. `ide.openForJob` / `ide.openForSession` tRPC mutation fires.
3. Server checks for an **existing healthy instance** for the same job/workspace.
4. If none exists: allocate port (4200–4299), generate proxy key, spawn `opencode web`.
5. Instance record created in `code_ide_instances` with status `starting` → `running`.
6. Frontend receives `proxyUrl` and opens it in a new browser tab.
7. Instance TTL defaults to **120 minutes** (configurable via `OPENCODE_WEB_TTL_MINUTES`).
8. Stale instances are auto-expired by `expireStaleInstances()`.

## Port Allocation

- Range: `OPENCODE_WEB_BASE_PORT` (default 4200) to `OPENCODE_WEB_MAX_PORT` (default 4299).
- Sequential allocation — first available port that isn't in the `code_ide_instances` table.
- Up to 100 concurrent IDE instances.

## Authentication

When `OPENCODE_WEB_PASSWORD` or `OPENCODE_SERVER_PASSWORD` is set:
- The proxy injects a `Basic` auth header into every upstream request.
- The `www-authenticate` header is stripped from proxy responses (users don't see auth prompts).
- Username defaults to `opencode` (overridable via `OPENCODE_SERVER_USERNAME`).

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `OPENCODE_WEB_BASE_PORT` | `4200` | Start of port allocation range |
| `OPENCODE_WEB_MAX_PORT` | `4299` | End of port allocation range |
| `OPENCODE_WEB_HOSTNAME` | `127.0.0.1` | Bind address for OpenCode Web |
| `OPENCODE_WEB_TTL_MINUTES` | `120` | Instance TTL before auto-expire |
| `OPENCODE_BINARY_PATH` | `opencode` | Path to OpenCode CLI binary |
| `OPENCODE_WEB_PASSWORD` | _(none)_ | Password for OpenCode Web auth |
| `OPENCODE_SERVER_USERNAME` | `opencode` | Username for OpenCode Web auth |

## tRPC Endpoints

All under `codeStudio.ide.*`:

| Endpoint | Type | Input | Returns |
|----------|------|-------|---------|
| `openForJob` | mutation | `{ jobId }` | `{ instance, proxyUrl, isReused }` |
| `openForSession` | mutation | `{ sessionId }` | `{ instance, proxyUrl, isReused }` |
| `getStatus` | query | `{ instanceId }` | Instance status + `healthy` flag |
| `close` | mutation | `{ instanceId }` | void |
| `list` | query | — | All IDE instances |

## Proxy Route

`/api/code-studio/ide/:proxyKey/*` — mounted in `server/_core/index.ts` **before**
Express body-parsing middleware to allow raw body streaming. Uses Node.js `http.request`
to pipe traffic bi-directionally.
