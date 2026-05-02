/**
 * PSM — Public contract.
 *
 * Other modules import from `@/modules/psm` only.
 */

export type { PSMSubdomain, PSMCaseStatus, PSMCaseSummary } from "./types";

export const PSMRoutes = {
  root: () => "/psm",
  dashboard: () => "/psm/dashboard",
  library: () => "/psm/library",
  selector: () => "/psm/selector",
  cases: () => "/psm/cases",
  case: (id: string | number) => `/psm/cases/${id}`,
  method: (id: string | number) => `/psm/methods/${id}`,
  run: (id: string | number) => `/psm/runs/${id}`,
  admin: () => "/psm/admin",
  analytics: () => "/psm/analytics",
  aiCatalog: () => "/psm/ai-catalog",
} as const;
