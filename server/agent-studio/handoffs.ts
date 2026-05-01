/**
 * Agent Studio — Handoffs
 *
 * Agent Studio accepts run requests and produces handoffs to Code Studio
 * (e.g. an agent run that requires coding work).
 */
export const AGENT_STUDIO_HANDOFFS = {
  runRequested: "agentStudio.run.requested",
  toCodeStudio: "agentStudio.codeStudio.handoff",
} as const;

export type AgentStudioHandoffType =
  (typeof AGENT_STUDIO_HANDOFFS)[keyof typeof AGENT_STUDIO_HANDOFFS];
