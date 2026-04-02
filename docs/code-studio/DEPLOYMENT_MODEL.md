# Code Studio — Deployment Model

## Current Model (MVP)

Code Studio runs as part of the MyNewAp1Claude monorepo process:
- Backend: tRPC router mounted in the main Express server
- Frontend: React pages served by Vite (dev) / static (prod)
- Database: Dedicated `codedb` PostgreSQL database
- OpenCode: Separate process, `opencode serve` on 127.0.0.1:4096

## Infrastructure Requirements

### Database
- PostgreSQL database: `codedb`
- Connection: `DATABASE_URL_CODEDB` env var (fallback: replace DB name in `DATABASE_URL`)
- Migration: Seed on startup (same pattern as PRMDB/PSMDB)

### OpenCode Runtime
- Binary: `opencode` CLI installed on host
- Start: `opencode serve --port 4096 --hostname 127.0.0.1`
- Auth: `OPENCODE_SERVER_PASSWORD` env var
- Config: `opencode.json` in project root for agent definitions

### Environment Variables
- `DATABASE_URL_CODEDB` — CODEDB connection string
- `OPENCODE_URL` — OpenCode server URL (default: http://127.0.0.1:4096)
- `OPENCODE_SERVER_PASSWORD` — OpenCode basic auth password
- `CODE_STUDIO_WORKSPACE_ROOT` — Directory for ephemeral workspaces

## Future Model (Post-MVP)

Code Studio can be extracted to a separate deployment:
- Standalone Express/Fastify server
- Separate container/service
- Own scaling and lifecycle
- Platform communicates via HTTP/gRPC handoff contract

This extraction path is intentionally supported by:
- Dedicated database (no shared tables)
- Self-contained router composition
- Clean handoff contract
- Normalized OpenCode adapter (no platform leakage)
