/**
 * Projects System — Public contract.
 *
 * Other modules import from `@/modules/ps` only. Anything imported
 * via `@/modules/ps/<subdir>/*` is a boundary violation enforced by
 * `check:module-api-boundaries`.
 *
 * Allowed exports:
 *   - public types (PS shapes referenced elsewhere)
 *   - canonical route builders (so callers don't hardcode "/ps/...")
 *
 * Forbidden exports:
 *   - psRouter (backend), service functions
 *   - private hooks, pages, or components
 *   - the manifest itself (the platform registry consumes it via
 *     `client.ts`; no consumer should reach for it directly)
 *   - PM Central, PRM, PSM, HR, OM, Workforce Assignment, or
 *     Governance internals
 */

export type {
  PSIdeationStatus,
  PSIdeationSummary,
  PSProjectLifecycleStatus,
  PSProjectSummary,
  PSHandoffPayload,
  PSSubdomain,
} from "./types";

/**
 * Canonical URL builders for Projects System. Use these instead of
 * hardcoding "/ps/ideation" etc. in another module's UI —
 * `check:cross-module-links` flags hardcoded links when a public
 * builder exists.
 */
export const ProjectsSystemRoutes = {
  root: () => "/ps",
  catalog: () => "/ps/catalog",
  ideation: () => "/ps/ideation",
  ideationDetail: (id: string | number) => `/ps/ideation/${id}`,
  ideationConvert: (id: string | number) => `/ps/ideation/${id}/convert`,
  controlPanel: () => "/ps/control-panel",
  wizard: () => "/ps/wizard",
  list: () => "/ps/list",
  aiCatalog: () => "/ps/ai-catalog",
} as const;
