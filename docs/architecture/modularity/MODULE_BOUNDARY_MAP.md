# Module Boundary Map

This map enumerates every module under refactor. The fields are filled best-effort
from a static read of the repo at the start of the modular refactor.

Legend:
- **Backend folder**: where the server code lives.
- **Frontend folder**: where the client code lives (best-effort match by route/feature).
- **Router**: tRPC router file.
- **DB**: dedicated database (preferred) or schema in the platform `appdb`.
- **Runtime**: `shared`, `embedded`, `worker`, `external`.
- **Public surface**: files other modules may import.
- **Private surface**: files no other module may import.

## Pilot modules (priority migration set)

### PRM — Problem Resolution Methods
- Backend: `server/prm/`
- Frontend: `client/src/pages/PrmCatalog*`, `client/src/components/prm/*`
- Router: `server/prm/prm.router.ts`
- DB: `prmdb` (declared)
- Runtime: `embedded`
- Public surface: `prm.types.ts` → contracts; will add `public-api.ts`, `events.ts`, `handoffs.ts`, `ports.ts`.
- Private surface: `prm.repository.ts`, `connection.ts`, `seed.ts`, `prm.service.ts` (until ports defined).

### PSM — Problem Solving Methods
- Backend: `server/psm/`
- Router: `server/psm/psm.router.ts`
- DB: `psmdb` (declared)
- Runtime: `embedded`
- Public surface: `psm.types.ts`; will add `public-api.ts`, `events.ts`, `handoffs.ts`, `ports.ts`.
- Private surface: `psm.repository.ts`, `connection.ts`, `seed.ts`.

### Code Studio
- Backend: `server/code-studio/`
- Router: `server/code-studio/api/router.ts`
- DB: `codedb` (declared)
- Runtime: `worker` (OpenCode runtime + IDE proxy)
- Public surface: will add `public-api.ts`, `contracts.ts`, `events.ts`, `handoffs.ts`.
- Private surface: `connection.ts`, `repository.ts`, `seed.ts`, `worker/`, `opencode/`.

### Agent Studio
- Backend: `server/agent-studio/`
- Router: `server/agent-studio/api/router.ts`
- DB: `asdb` (declared)
- Runtime: `worker`
- Public surface: will add `public-api.ts`, `contracts.ts`, `events.ts`, `handoffs.ts`.
- Private surface: `db/connection.ts`, `repository.ts`, `seeds/`, `services/`.

### Sandbox WF — Workflow
- Backend: `server/sandbox-wf/`
- Router: `server/sandbox-wf/router.ts`
- DB: `wfdb` (declared)
- Runtime: `worker`
- Public surface: will add `public-api.ts`, `contracts.ts`, `events.ts`, `handoffs.ts`.
- Private surface: `connection.ts`, `executor.ts`, `service.ts`, `seed.ts`.

### RAG / KGRA
- Backend: `server/rag/`, `server/kgra-agent/`
- Router: `server/kgra-agent/router.ts`
- DB: `ragdb` (declared)
- Runtime: `worker`
- Public surface: will add `public-api.ts`, `contracts.ts`, `events.ts`, `handoffs.ts`.
- Private surface: `connection.ts`, `seed.ts`, `graph-*`, designer-routes.

### OpenRouter
- Backend: `server/openrouter/`
- Router: `server/openrouter/router.ts`
- DB: schema in platform `appdb` initially (declared `openrouterdb` later).
- Runtime: `embedded` (later `worker` if pull jobs grow).
- Public surface: will add `public-api.ts`, `contracts.ts`, `events.ts`.
- Private surface: `routing-service.ts`, `service.ts`, `sync-service.ts`, `schema.ts`.

## Strong modules (manifest-only first pass)

### PS — Projects System
- Backend: `server/ps/`
- Router: `server/ps/ps.router.ts`
- DB: `appdb` (`ps` schema), planned `psdb`.
- Runtime: `embedded`.
- Communication: handoff to PM Central.

### PM Central — PMT module
- Backend: `server/modules/pmt/` (subset of `server/modules/router.ts`)
- Router: subset of `modulesRouter`.
- DB: `appdb` (`pm` schema), planned `pmdb`.
- Runtime: `embedded`.
- Receives handoffs from PS.

### HR
- Backend: `server/hr/`, plus auxiliary `server/workforce-assignment/`, `server/organization-management/`, `server/culture-values/`
- Router: `server/hr/router.ts`
- DB: `appdb` (HR tables), planned `hrdb`.
- Runtime: `shared` (later `embedded`).

### OM — Organization Management
- Backend: `server/organization-management/`
- Router: `server/organization-management/router.ts`
- DB: `appdb`, planned `omdb`.
- Runtime: `shared`.

### CV — Culture Values
- Backend: `server/culture-values/`
- Router: `server/culture-values/router.ts`
- DB: `appdb`, planned `cvdb`.
- Runtime: `shared`.

### AI Types
- Backend: `server/ai-types/`
- Router: `server/ai-types/router.ts`
- DB: platform core (`catalog_entries`, `ai_type_*`).
- Runtime: `shared`.
- Note: This is the canonical catalog — explicitly **platform core**, not a module DB.

## Platform core (control plane — never a module)

- Auth / Identity (`server/_core/`, `oauth.ts`)
- Workspace / RBAC (`server/workspace/`, `drizzle/tables/workspace-*.ts`)
- Governance Center (`server/governance/`)
- Module Registry (`server/platform/modules/registry.ts`)
- Runtime Manager (`server/platform/modules/runtime-manager.ts`)
- Module Gateway (`server/platform/modules/module-gateway.ts`)
- Handoff Manager (`server/platform/handoff/`)
- Event Bus (`server/platform/events/`)
- Central Coordinator (`server/platform/coordinator/`, wraps `server/orchestrator/`)
- Digital HQ / Observability (`server/hq/`, `server/platform/observability/`)
- Design System / shared shell (`client/src/components/`, `client/src/_core/`)
- API Gateway / router composer (`server/platform/modules/router-composer.ts`)
