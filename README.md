# MyNewAppV1

A local-first AI development platform (LLM Control Plane) for managing LLM providers, agent orchestration, document ingestion/RAG, automation workflows, and governance.

## Quick Start

```bash
# Prerequisites: Node.js 18+, PostgreSQL 14+
git clone https://github.com/RachEma-ux/MyNewAp1Claude.git
cd MyNewAp1Claude

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env — set DATABASE_URL at minimum

# Run migrations
npm run db:push

# Start dev server (http://localhost:3000)
npm run dev
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Tailwind 4, Radix UI, wouter |
| API | tRPC 11 with SuperJSON (end-to-end type safety) |
| Backend | Express 4, Node.js |
| Database | PostgreSQL via Drizzle ORM |
| Vector DB | Qdrant (optional) |
| LLM Providers | OpenAI, Anthropic, Google, Ollama, llama.cpp, Custom |

## Project Structure

```
client/src/     React frontend (Vite, 70+ pages)
server/         Express backend with tRPC routers
  _core/        Server bootstrap, auth, encryption
  providers/    LLM provider registry and connections
  chat/         Chat streaming with provider routing
  agents/       Agent definitions and orchestration
  automation/   Workflow builder and execution
  documents/    Document upload, chunking, embedding
  catalog-import/ Provider discovery and bulk import
shared/         Types and constants shared client/server
drizzle/        PostgreSQL schema and migrations
```

## Key Features

- **Provider Hub** — Register and manage LLM providers with health monitoring
- **Provider Discovery** — Auto-detect provider capabilities from URLs
- **Chat** — Streaming chat with provider routing and RAG context
- **Agent Orchestration** — Define, version, and promote agents through governance
- **Workflow Automation** — Visual workflow builder with triggers and actions
- **Document Ingestion** — Upload, chunk, embed, and search documents
- **Governance** — OPA policy enforcement, audit logging, role-based access
- **Secret Management** — Encrypted storage for API keys and credentials

## Commands

| Command | Description |
|---------|------------|
| `npm run dev` | Start dev server with HMR |
| `npm run build` | Production build (Vite + esbuild) |
| `npm run start` | Start production server |
| `npm run check` | TypeScript type check |
| `npm run test` | Run tests (Vitest) |
| `npm run db:push` | Generate and run DB migrations |
| `npm run format` | Format with Prettier |

## Environment Variables

See [`.env.example`](.env.example) for all options. Required:

- `DATABASE_URL` — PostgreSQL connection string

Optional:
- `ENCRYPTION_KEY` — AES-256-GCM key for provider secrets (required in production)
- `SECRETS_ENCRYPTION_KEY` — Separate key for secrets service
- `JWT_SECRET` — For authentication (app runs in demo mode without it)
- Provider API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`)

## Deployment

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for full deployment guide including Docker, Render, Railway, and Vercel options.

## License

MIT
