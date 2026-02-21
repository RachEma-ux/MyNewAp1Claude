# Architecture

## System Overview

MyNewAppV1 is a full-stack TypeScript monorepo providing workspace-based LLM provider management, document ingestion/RAG, agent orchestration, automation workflows, and governance features.

**Runtime Stack**: Node.js + Express + tRPC (server) | React 19 + Vite (client) | PostgreSQL + Drizzle ORM (persistence)

## Layer Architecture

```
┌─────────────────────────────────────────────────┐
│  Presentation Layer   (client/src/)             │
│  React 19, Vite, Tailwind, wouter routing       │
├─────────────────────────────────────────────────┤
│  API Layer            (server/routers.ts)        │
│  tRPC 11 routers, Express middleware            │
├─────────────────────────────────────────────────┤
│  Governance Layer     (server/services/)         │
│  Policy evaluation, audit logging, feature flags│
├─────────────────────────────────────────────────┤
│  Domain Layer         (server/<domain>/)         │
│  Business logic per domain (agents, chat, etc.) │
├─────────────────────────────────────────────────┤
│  Persistence Layer    (drizzle/, server/db.ts)   │
│  Drizzle ORM, PostgreSQL, migrations           │
├─────────────────────────────────────────────────┤
│  Infrastructure Layer (server/_core/)            │
│  Env config, auth context, encryption, SDK      │
└─────────────────────────────────────────────────┘
```

### Dependency Direction

Allowed: Presentation → API → Governance → Domain → Persistence → Infrastructure

Violations to avoid:
- UI must not import persistence logic directly
- Domain logic must not import UI components
- Governance layer must not directly mutate DB (goes through domain)

## Directory → Layer Mapping

| Directory | Layer | Purpose |
|---|---|---|
| `client/src/pages/` | Presentation | 78 page components |
| `client/src/components/` | Presentation | Reusable UI (shadcn/ui pattern) |
| `client/src/lib/` | Presentation | Client utilities, tRPC client |
| `server/routers.ts` | API | Root router composing 25+ sub-routers |
| `server/routers/` | API | tRPC sub-routers |
| `server/providers/router.ts` | API | Provider management endpoints |
| `server/services/policyEvaluation.ts` | Governance | Rule-based policy scoring (MVP) |
| `server/services/governanceLogger.ts` | Governance | Governance audit event logging |
| `server/services/auditLogger.ts` | Governance | Unified audit logging for all operations |
| `server/services/policyGate.ts` | Governance | Centralized policy enforcement gate |
| `server/agents/` | Domain | Agent orchestration, tools, streaming |
| `server/chat/` | Domain | Chat streaming with provider routing |
| `server/automation/` | Domain | Workflow builder, triggers, actions |
| `server/documents/` | Domain | Document upload, chunking, embedding |
| `server/inference/` | Domain | Inference routing, batch service |
| `server/providers/` | Domain | Provider registry, lifecycle |
| `server/secrets/` | Domain | Secret management, encryption |
| `server/embeddings/` | Domain | Embedding generation |
| `server/vectordb/` | Domain | Qdrant vector DB integration |
| `server/models/` | Domain | Model management, benchmarking |
| `drizzle/` | Persistence | Schema definitions, migrations |
| `drizzle/tables/` | Persistence | Table definitions (9 modules) |
| `server/db.ts` | Persistence | DB connection, query helpers |
| `server/_core/` | Infrastructure | Env, auth context, encryption, Express setup |
| `shared/` | Cross-cutting | Shared types and constants |

## Authentication Model

Three states:

| State | Condition | Behavior |
|---|---|---|
| **DEV_MODE** | `DEV_MODE=true` + `NODE_ENV≠production` | Auto-authenticates as dev user. Blocked in production via startup guard. |
| **OAuth** | `VITE_APP_ID` + `OAUTH_SERVER_URL` configured | Real authentication via OAuth provider |
| **Unconfigured** | Neither set | Only `publicProcedure` endpoints work |

Three tRPC procedure levels: `publicProcedure`, `protectedProcedure` (requires login), `adminProcedure` (requires admin role).

## Policy Enforcement

Policy evaluation uses **rule-based scoring** (not OPA). The system evaluates agents against workspace policies for promotion eligibility.

- **Policy Gate** (`server/services/policyGate.ts`): Centralized `evaluatePolicy()` for sensitive operations
- **Policy Evaluation** (`server/services/policyEvaluation.ts`): Agent compliance scoring
- **Production mode**: Fail-closed (deny if rules unavailable)
- **Development mode**: Configurable fail-open with logging

## Audit System

Two audit loggers:

1. **Governance Logger** (`server/services/governanceLogger.ts`): Agent governance events (admission, promotion, policy reload)
2. **Audit Logger** (`server/services/auditLogger.ts`): General operations (provider, secret, policy, auth events)

Both persist to `governance_audit_logs` table with structured envelope.

## Environment Profiles

| Profile | `NODE_ENV` | Behavior |
|---|---|---|
| **Development** | `development` | Vite HMR, DEV_MODE allowed, HTTP allowed for SSRF, fail-open policy |
| **Production** | `production` | Static serving, DEV_MODE blocked, HTTPS enforced, fail-closed policy |

### Startup Validation

- `NODE_ENV=production` + `DEV_MODE=true` → Fatal error, process exits
- `NODE_ENV=production` + no `ENCRYPTION_KEY` → Fatal error
- `NODE_ENV=production` + no `REDIS_URL` → Warning (in-memory rate limiting)

## Security Controls

- **SSRF Protection** (`server/routers/ssrf-guard.ts`): DNS resolution, IP classification, redirect validation
- **Rate Limiting**: In-memory (dev) or Redis-backed (production multi-instance)
- **Encryption**: AES-256 for provider secrets via `ENCRYPTION_KEY`
- **Input Validation**: Zod schemas on all tRPC inputs

## Database Schema

9 table modules in `drizzle/tables/`:

| Module | Key Tables |
|---|---|
| `users.ts` | users, workspaces, workspace_members |
| `agents.ts` | agents, agent_history, agent_versions, conversations, messages, promotion_requests |
| `providers.ts` | providers, provider_health_checks |
| `documents.ts` | documents, document_chunks |
| `automation.ts` | workflows, workflow_versions, workflow_executions |
| `models.ts` | models |
| `catalog.ts` | catalog entries, registry |
| `system.ts` | governance_audit_logs |
| `llm.ts` | LLM control plane tables |

## API Surface

25+ tRPC routers composed in `server/routers.ts`. All endpoints use Zod input validation. Protected endpoints require authentication via `protectedProcedure`.

Key router groups:
- **Core**: auth, workspaces, models, system, diagnostic
- **AI/LLM**: providers, chat, inference, embeddings, llm, catalogManage, catalogRegistry, catalogImport
- **Agents**: agents, agentPromotions, conversations, protocols
- **Documents**: documentsApi, documents (CRUD), vectordb
- **Automation**: automation, triggers, actions, templates, wcpWorkflows
- **Governance**: policies, keyRotation, discoveryOps, providerConnections
- **Content**: wiki, deploy
