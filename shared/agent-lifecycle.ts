export const AGENT_STATUSES = ["draft", "sandbox", "governed", "deployable", "archived"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const AGENT_STATUS_LABELS: Record<AgentStatus, string> = {
  draft: "Draft",
  sandbox: "Sandbox",
  governed: "Governed",
  deployable: "Deployable",
  archived: "Archived",
};

export const AGENT_STATUS_BADGE_CLASSES: Record<AgentStatus, string> = {
  draft: "bg-slate-500/10 text-slate-700 border-slate-500/20",
  sandbox: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  governed: "bg-sky-500/10 text-sky-700 border-sky-500/20",
  deployable: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  archived: "bg-rose-500/10 text-rose-700 border-rose-500/20",
};

export const AGENT_STATUS_TRANSITIONS: Record<AgentStatus, AgentStatus[]> = {
  draft: ["sandbox", "archived"],
  sandbox: ["governed", "archived"],
  governed: ["deployable", "archived"],
  deployable: ["archived"],
  archived: [],
};

export function isAgentStatus(value: string): value is AgentStatus {
  return (AGENT_STATUSES as readonly string[]).includes(value);
}

export function canTransitionAgentStatus(from: AgentStatus, to: AgentStatus): boolean {
  return AGENT_STATUS_TRANSITIONS[from].includes(to);
}

export function getDefaultPromotionTarget(status: AgentStatus): AgentStatus | null {
  if (status === "draft") return "sandbox";
  if (status === "sandbox") return "governed";
  if (status === "governed") return "deployable";
  return null;
}

export function isCatalogImportEligible(status: AgentStatus): boolean {
  return status === "deployable";
}
