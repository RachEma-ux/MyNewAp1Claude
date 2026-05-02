/**
 * PRM — Module navigation.
 *
 * Pure data. The platform's nav composer reads this; modules do not
 * render their own top-level sidebar (the in-capsule S1 sidebar
 * inside `PRMShell` is module-internal navigation).
 *
 * All hrefs MUST be canonical PRM routes under `/prm/*`.
 */

export interface PRMNavEntry {
  label: string;
  href: string;
  group?: string;
  order?: number;
}

export const prmNav: PRMNavEntry[] = [
  { label: "Dashboard", href: "/prm/dashboard", group: "knowledge", order: 0 },
  { label: "New Case", href: "/prm/new", group: "knowledge", order: 1 },
  { label: "Cases", href: "/prm/cases", group: "knowledge", order: 2 },
  { label: "Methods", href: "/prm/methods", group: "knowledge", order: 3 },
  { label: "Playbooks", href: "/prm/playbooks", group: "knowledge", order: 4 },
  { label: "Catalog", href: "/prm/catalog", group: "knowledge", order: 5 },
  { label: "AI Catalog", href: "/prm/ai-catalog", group: "knowledge", order: 6 },
  { label: "Control Panel", href: "/prm/control-panel", group: "knowledge", order: 7 },
];
