/**
 * Provider Connections — Public API surface
 *
 * Per Plan v3 Decision D2: Provider Connections has a public no-secret
 * surface and an internal credential resolver surface. Only this file
 * is allowed to be re-exported across module boundaries. The internal
 * credential resolver lives at `server/provider-connections/internal/`
 * and is reachable only from `server/openrouter/model-access/**`
 * (enforced in Phase 3 by `scripts/check-provider-credential-resolver-boundary.ts`).
 *
 * Public outputs MUST never include:
 *   - PAT
 *   - API key
 *   - encrypted secret payload
 *   - decrypted secret payload
 *   - secret env-var values
 *
 * This file is the ONLY allowed import surface for other modules. Any
 * cross-module import from `server/provider-connections/{db,service,
 * state-machine,internal/*}.ts` is a Phase 3+ boundary violation.
 *
 * Phase 1 establishes the file. Phase 2 will populate it with the
 * public read actions (`providerConnections.listActiveForProvider`,
 * `providerConnections.getConnectionStatus`,
 * `providerConnections.validateConnection`).
 */

export { providerConnectionsManifest } from "./manifest";

// Re-exported types are deliberately kept minimal at Phase 1. Phase 2
// will export `ProviderConnectionRef` (the no-secret reference shape)
// once the public read actions are wired.
