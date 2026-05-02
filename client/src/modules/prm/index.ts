/**
 * PRM — Public contract.
 *
 * Other modules import from `@/modules/prm` only.
 */

export type {
  PRMCaseStatus,
  PRMCaseSeverity,
  PRMCaseSummary,
  PRMSubdomain,
} from "./types";

export const PRMRoutes = {
  root: () => "/prm",
  dashboard: () => "/prm/dashboard",
  newCase: () => "/prm/new",
  cases: () => "/prm/cases",
  case: (id: string | number) => `/prm/cases/${id}`,
  methods: () => "/prm/methods",
  playbooks: () => "/prm/playbooks",
  catalog: () => "/prm/catalog",
  aiCatalog: () => "/prm/ai-catalog",
  controlPanel: () => "/prm/control-panel",
} as const;
