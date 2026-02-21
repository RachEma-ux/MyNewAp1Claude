# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## CRITICAL: Device Workflow Rules

- **DO NOT run builds, tests, or dev servers on device.** No local builds or test runs unless explicitly instructed otherwise.
- **Work with file tools only** (Read, Edit, Write, Glob, Grep) and **push to GitHub**.
- **Never modify files on device outside of git workflow** — edit, commit, push.
- Once built on GitHub (CI), pull to device.

## Project Overview

MyNewAppV1 is a local-first AI development platform (LLM Control Plane) built as a full-stack TypeScript monorepo. It provides workspace-based management for LLM providers, document ingestion/RAG, agent orchestration, automation workflows, and governance features.

## Commands

- **Dev server:** `npm run dev` (runs Express + Vite HMR on port 3000)
- **Build:** `npm run build` (Vite frontend build + esbuild server bundle to `dist/`)
- **Type check:** `npm run check` (runs `tsc --noEmit`)
- **Format:** `npm run format` (Prettier)
- **Run all tests:** `npm run test` (Vitest)
- **Run a single test:** `npx vitest run server/path/to/file.test.ts`
- **DB migrations:** `npm run db:push` (drizzle-kit generate + migrate)
- **Start production:** `npm run start`

## Architecture

### Monorepo Structure

```
client/src/     → React 19 frontend (Vite, Tailwind 4, wouter routing)
server/         → Express 4 backend with tRPC 11 API layer
shared/         → Types and constants shared between client and server
drizzle/        → PostgreSQL schema (Drizzle ORM) and migrations
```

### Client-Server Communication

The app uses **tRPC** for end-to-end type-safe API calls. The full data flow:

1. Schema defined in `drizzle/schema.ts` → types exported via `shared/types.ts`
2. Server routers in `server/routers.ts` compose all sub-routers into `appRouter` (the `AppRouter` type)
3. Client creates typed hooks via `client/src/lib/trpc.ts` → `createTRPCReact<AppRouter>()`
4. React Query manages caching/state via `@tanstack/react-query`
5. SuperJSON transformer handles serialization (dates, etc.) on both sides

### Server Entry Point

`server/_core/index.ts` boots the Express server:
- Runs Drizzle migrations on startup
- Initializes provider registry (`server/providers/init.ts`)
- Mounts tRPC at `/api/trpc`, file uploads at `/api`, chat streaming at `/api/chat/stream`
- In dev mode: Vite middleware for HMR. In production: serves static `dist/public/`

### Key Server Domains

Each domain has its own router, DB queries, and types:

| Directory | Purpose |
|---|---|
| `server/providers/` | LLM provider registry (Ollama, OpenAI, Anthropic, Google, llama.cpp) |
| `server/chat/` | Chat streaming with provider routing |
| `server/agents/` | Agent definitions, orchestration, promotion lifecycle |
| `server/automation/` | Workflow builder, triggers, actions |
| `server/documents/` | Document upload, chunking, embedding pipeline |
| `server/inference/` | Inference routing, batch service, hybrid router |
| `server/vectordb/` | Qdrant vector database integration |
| `server/embeddings/` | Embedding generation and management |
| `server/models/` | Model download, benchmarking, versioning |
| `server/secrets/` | Secret management |
| `server/policies/` | OPA-based policy enforcement |
| `server/wiki/` | Knowledge base wiki |
| `server/routers/` | Additional tRPC routers (agents, triggers, workflows, deploy, etc.) |

### Frontend Structure

- **Routing:** `wouter` (not react-router). All routes defined in `client/src/App.tsx`
- **UI components:** Radix UI primitives in `client/src/components/ui/`, shadcn/ui pattern
- **Pages:** `client/src/pages/` — one file per page, 70+ pages
- **Auth:** Optional OAuth flow; app runs in "demo mode" without OAuth config (`isOAuthConfigured()`)
- **Theming:** `next-themes` via `ThemeContext`, defaults to dark mode

### Path Aliases

- `@/*` → `client/src/*`
- `@shared/*` → `shared/*`

### Auth Model

Three tRPC procedure levels: `publicProcedure`, `protectedProcedure` (requires login), `adminProcedure` (requires admin role). When OAuth env vars (`VITE_OAUTH_PORTAL_URL`, `VITE_APP_ID`) are unset, auth is bypassed entirely.

### Database

PostgreSQL via Drizzle ORM. Schema in `drizzle/schema.ts`. The DB connection is lazy-initialized from `DATABASE_URL` env var. Key tables: users, workspaces, workspace_members, models, documents, document_chunks, agents, conversations, messages, workflows, workflow_executions, providers, routing_audit_logs.

### TypeScript Configuration

`tsconfig.json` has `strict: false` and excludes many server directories from type checking (routers, services, features, modules, client/src). The `npm run check` command reflects this limited scope. The build uses esbuild for the server (not tsc).
