/**
 * Sandbox WF — Public contract.
 *
 * Other modules import from `@/modules/sandbox-wf` only.
 */

export type { SandboxWfView } from "./types";

export const SandboxWfRoutes = {
  root: () => "/automation/sandbox-wf",
  new: () => "/automation/sandbox-wf/new",
  editor: (id: number | string) => `/automation/sandbox-wf/${id}`,
} as const;
