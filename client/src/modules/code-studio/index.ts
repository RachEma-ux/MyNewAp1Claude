/**
 * Code Studio — Public contract.
 *
 * Other modules import from `@/modules/code-studio` only. Anything
 * imported via `@/modules/code-studio/<subdir>/*` is a boundary
 * violation enforced by `check:module-api-boundaries`.
 *
 * Allowed exports:
 *   - public types (Code Studio shapes referenced elsewhere)
 *   - canonical route builders (so callers don't hardcode "/code-studio/...")
 *
 * Forbidden exports:
 *   - codeStudioRouter (backend), service functions
 *   - private hooks, pages, or components
 *   - the manifest itself (the platform registry consumes it via
 *     `client.ts`; no consumer should reach for it directly)
 *   - Agent Studio, Sandbox WF, OpenRouter, or AI Types internals
 *   - Port Registry / Governance internals (those are backend-mediated)
 */

export type {
  CodeStudioJobStatus,
  CodeStudioJobSummary,
  CodeStudioApprovalStatus,
  CodeStudioApprovalSummary,
  CodeStudioSubdomain,
} from "./types";

/**
 * Canonical URL builders for Code Studio. Use these instead of
 * hardcoding "/code-studio/jobs" etc. in another module's UI —
 * `check:cross-module-links` flags hardcoded links when a public
 * builder exists.
 */
export const CodeStudioRoutes = {
  root: () => "/code-studio",
  dashboard: () => "/code-studio",
  jobs: () => "/code-studio/jobs",
  job: (id: string | number) => `/code-studio/jobs/${id}`,
  templates: () => "/code-studio/templates",
  sessions: () => "/code-studio/sessions",
  approvals: () => "/code-studio/approvals",
  repos: () => "/code-studio/repos",
  agents: () => "/code-studio/agents",
  aiCatalog: () => "/code-studio/ai-catalog",
  policies: () => "/code-studio/policies",
  controlPanel: () => "/code-studio/control-panel",
  opencodeSettings: () => "/code-studio/opencode-settings",
  howTo: () => "/code-studio/how-to",
} as const;
