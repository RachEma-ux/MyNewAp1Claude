/**
 * PM Central — Public contract.
 *
 * Other modules import from `@/modules/pm-central` only. Anything
 * imported via `@/modules/pm-central/<subdir>/*` is a boundary
 * violation enforced by `check:module-api-boundaries`.
 *
 * Allowed exports:
 *   - public types (PM Central shapes referenced elsewhere)
 *   - canonical route builders (so callers don't hardcode "/pm/...")
 *
 * Forbidden exports:
 *   - pmCentralRouter (backend), service functions
 *   - private hooks, pages, or components
 *   - the manifest itself (the platform registry consumes it via
 *     `client.ts`; no consumer should reach for it directly)
 *   - PS, HR, OM, or Workforce Assignment internals
 */

export type {
  PMProjectStatus,
  PMProjectSummary,
  PMHandoffStatus,
  PMHandoffSummary,
  PMCentralSubdomain,
} from "./types";

/**
 * Canonical URL builders for PM Central. Use these instead of
 * hardcoding "/pm/projects" etc. in another module's UI —
 * `check:cross-module-links` flags hardcoded links when a public
 * builder exists.
 */
export const PMCentralRoutes = {
  root: () => "/pm",
  dashboard: () => "/pm",
  projects: () => "/pm/projects",
  project: (id: string | number) => `/pm/projects/${id}`,
  tasks: () => "/pm/tasks",
  milestones: () => "/pm/milestones",
  risks: () => "/pm/risks",
  issues: () => "/pm/issues",
  decisions: () => "/pm/decisions",
  handoffs: () => "/pm/handoffs",
  settings: () => "/pm/settings",
} as const;
