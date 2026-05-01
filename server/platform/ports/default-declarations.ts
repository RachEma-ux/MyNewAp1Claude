/**
 * Platform Port Registry — Default declarations
 *
 * Endpoints owned by the platform itself (HTTP server, the platform
 * Postgres host, local Ollama). Module-specific endpoints
 * (OpenCode Web, per-module DB URLs, etc.) live in the relevant
 * module manifest's `runtimePorts` block — that keeps ownership
 * obvious and avoids a central file growing every time a module is
 * added.
 *
 * Anything new added here should also be documented in
 * docs/RUNTIME_ENDPOINTS.md so operators have one place to look.
 */

import type { ModulePortDeclaration } from "./types";

const DEFAULT_HTTP_PORT = 3000;
const DEFAULT_POSTGRES_PORT = 5432;
const DEFAULT_OLLAMA_PORT = 11434;

export const DEFAULT_PORT_DECLARATIONS: ModulePortDeclaration[] = [
  // Main HTTP server. The PORT env var is the documented override; the
  // server falls back to scanning forward 20 ports if 3000 is taken.
  {
    moduleKey: "platform",
    key: "http",
    label: "Platform HTTP",
    mode: "single",
    protocol: "http",
    env: "PORT",
    defaultPort: DEFAULT_HTTP_PORT,
    defaultHost: "0.0.0.0",
    required: true,
    runtimeOwned: true,
    description: "Express + Vite HMR server (tRPC, file uploads, chat stream).",
  },

  // Platform Postgres. Each module-owned DB still rides on this single
  // instance via per-module DATABASE_URL_* overrides; tracking the host
  // socket once here keeps the topology view honest.
  {
    moduleKey: "platform",
    key: "postgres",
    label: "Platform Postgres",
    mode: "external",
    protocol: "postgres",
    env: "DATABASE_URL",
    defaultPort: DEFAULT_POSTGRES_PORT,
    defaultHost: "127.0.0.1",
    required: false,
    externallyManaged: true,
    description: "PostgreSQL instance hosting platform DB and module-owned DBs.",
  },

  // Local Ollama for embeddings + chat. External because we don't
  // launch it; we just point at it.
  {
    moduleKey: "platform",
    key: "ollama",
    label: "Ollama",
    mode: "external",
    protocol: "http",
    env: "OLLAMA_BASE_URL",
    defaultUrl: `http://localhost:${DEFAULT_OLLAMA_PORT}`,
    defaultHost: "localhost",
    defaultPort: DEFAULT_OLLAMA_PORT,
    required: false,
    externallyManaged: true,
    description: "Local Ollama HTTP API used for embeddings and inference.",
  },
];

/**
 * Convenience: register all defaults into the supplied registry.
 * Idempotent — safe to call multiple times across HMR reloads.
 */
export function registerDefaultPortDeclarations(
  registry: { registerDeclaration: (d: ModulePortDeclaration) => void },
): void {
  for (const decl of DEFAULT_PORT_DECLARATIONS) registry.registerDeclaration(decl);
}
