/**
 * PM Central — Module navigation.
 *
 * Pure data. The platform's nav composer reads this; modules do not
 * render their own top-level sidebar.
 *
 * All hrefs MUST be canonical PM Central routes under `/pm/*`.
 * Pointing nav at the legacy `/pm-central/*` shell paths or at
 * Projects System / HR / Organization Management routes is a
 * boundary violation enforced by `check:cross-module-links` and
 * `check:module-route-inventory`.
 */

export interface PMCentralNavEntry {
  label: string;
  href: string;
  /** Optional grouping for sidebar ordering. */
  group?: string;
  order?: number;
}

export const pmCentralNav: PMCentralNavEntry[] = [
  { label: "Dashboard", href: "/pm", group: "pmCentral", order: 0 },
  { label: "Projects", href: "/pm/projects", group: "pmCentral", order: 1 },
  { label: "Tasks", href: "/pm/tasks", group: "pmCentral", order: 2 },
  { label: "Milestones", href: "/pm/milestones", group: "pmCentral", order: 3 },
  { label: "Risks", href: "/pm/risks", group: "pmCentral", order: 4 },
  { label: "Issues", href: "/pm/issues", group: "pmCentral", order: 5 },
  { label: "Decisions", href: "/pm/decisions", group: "pmCentral", order: 6 },
  { label: "Handoffs", href: "/pm/handoffs", group: "pmCentral", order: 7 },
  { label: "Settings", href: "/pm/settings", group: "pmCentral", order: 8 },
];
