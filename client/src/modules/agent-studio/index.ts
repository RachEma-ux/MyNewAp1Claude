/**
 * Agent Studio — Public contract.
 *
 * Other modules import from `@/modules/agent-studio` only. The chat
 * window is part of the public surface because App.tsx mounts an
 * `AgentStudioChatFAB` overlay above all `/agent-studio/*` routes.
 */

export type {
  AgentStudioGlobalView,
  AgentStudioAgentSection,
} from "./types";

export { AgentStudioChatWindow } from "./components/AgentStudioChatWindow";

export const AgentStudioRoutes = {
  root: () => "/agent-studio",
  new: () => "/agent-studio/new",
  templates: () => "/agent-studio/templates",
  import: () => "/agent-studio/import",
  catalog: () => "/agent-studio/catalog",
  catalogSection: (section: string) => `/agent-studio/catalog/${section}`,
  marketplace: () => "/agent-studio/marketplace",
  agent: (agentId: number | string) => `/agent-studio/${agentId}`,
  agentSection: (agentId: number | string, section: string) =>
    `/agent-studio/${agentId}/${section}`,
  agentRun: (agentId: number | string, runId: number | string) =>
    `/agent-studio/${agentId}/runs/${runId}`,
  agentVersionsCompare: (agentId: number | string) =>
    `/agent-studio/${agentId}/versions/compare`,
} as const;
