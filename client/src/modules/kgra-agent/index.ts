/**
 * KGRA Agent — Public contract.
 *
 * Other modules import from `@/modules/kgra-agent` only.
 */

export type { KgraAgentView } from "./types";

export const KgraAgentRoutes = {
  root: () => "/data-analysis/kgra-agent",
} as const;
