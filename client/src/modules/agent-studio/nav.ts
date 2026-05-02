/**
 * Agent Studio — Module navigation.
 *
 * Pure data. The platform's nav composer reads this. All hrefs MUST
 * be canonical Agent Studio routes under `/agent-studio/*`.
 */

export interface AgentStudioNavEntry {
  label: string;
  href: string;
  group?: string;
  order?: number;
}

export const agentStudioNav: AgentStudioNavEntry[] = [
  { label: "Home", href: "/agent-studio", group: "build", order: 0 },
  { label: "New Agent", href: "/agent-studio/new", group: "build", order: 1 },
  { label: "Templates", href: "/agent-studio/templates", group: "build", order: 2 },
  { label: "Skill Catalog", href: "/agent-studio/catalog/skills", group: "build", order: 3 },
  { label: "Tool Catalog", href: "/agent-studio/catalog/tools", group: "build", order: 4 },
  { label: "Marketplace", href: "/agent-studio/marketplace", group: "build", order: 5 },
];
