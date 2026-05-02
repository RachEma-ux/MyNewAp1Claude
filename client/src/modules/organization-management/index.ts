/**
 * Organization Management — Public contract.
 *
 * Other modules import from `@/modules/organization-management` only.
 */

export type { OMSubdomain } from "./types";

export const OMRoutes = {
  root: () => "/om",
  portfolio: () => "/om/portfolio",
  controlPanel: () => "/om/control-panel",
  wizard: () => "/om/wizard",
  list: () => "/om/list",
  settings: () => "/om/settings",
  templates: () => "/om/templates",
} as const;
