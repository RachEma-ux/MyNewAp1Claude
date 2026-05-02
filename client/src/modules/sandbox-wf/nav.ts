/**
 * Sandbox WF — Module navigation.
 *
 * Pure data. The platform's nav composer reads this. All hrefs MUST
 * be canonical Sandbox WF routes under `/automation/sandbox-wf*`.
 */

export interface SandboxWfNavEntry {
  label: string;
  href: string;
  group?: string;
  order?: number;
}

export const sandboxWfNav: SandboxWfNavEntry[] = [
  { label: "Sandbox WF", href: "/automation/sandbox-wf", group: "automation", order: 0 },
  { label: "New Workflow", href: "/automation/sandbox-wf/new", group: "automation", order: 1 },
];
