/**
 * Culture & Values — Public contract.
 *
 * Other modules import from `@/modules/culture-values` only.
 */

export type { CVSubdomain } from "./types";

export const CVRoutes = {
  root: () => "/cv",
  portfolio: () => "/cv/portfolio",
  wizard: () => "/cv/wizard",
  settings: () => "/cv/settings",
} as const;
