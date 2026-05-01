/**
 * Agent Studio — Event types
 */
export const AGENT_STUDIO_EVENTS = {
  runCompleted: "agentStudio.run.completed",
  runFailed: "agentStudio.run.failed",
  runStarted: "agentStudio.run.started",
  agentPublished: "agentStudio.agent.published",
} as const;

export type AgentStudioEventType =
  (typeof AGENT_STUDIO_EVENTS)[keyof typeof AGENT_STUDIO_EVENTS];
