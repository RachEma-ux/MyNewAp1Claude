/**
 * Provider Connections — module entry point.
 *
 * Re-exports only the public API surface. See `public-api.ts` for the
 * Plan v3 D2 rationale. Internal modules
 * (`db.ts`, `service.ts`, `state-machine.ts`, `internal/*`) must NOT
 * be imported through this barrel.
 */
export * from "./public-api";
