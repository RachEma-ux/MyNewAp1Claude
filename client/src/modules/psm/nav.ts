/**
 * PSM — Module navigation.
 *
 * Pure data. The platform's nav composer reads this; modules do not
 * render their own top-level sidebar (the in-capsule S1 sidebar
 * inside `PSMShell` is module-internal navigation).
 *
 * All hrefs MUST be canonical PSM routes under `/psm/*`.
 */

export interface PSMNavEntry {
  label: string;
  href: string;
  group?: string;
  order?: number;
}

export const psmNav: PSMNavEntry[] = [
  { label: "Dashboard", href: "/psm/dashboard", group: "knowledge", order: 0 },
  { label: "Library", href: "/psm/library", group: "knowledge", order: 1 },
  { label: "Selector", href: "/psm/selector", group: "knowledge", order: 2 },
  { label: "Cases", href: "/psm/cases", group: "knowledge", order: 3 },
  { label: "AI Catalog", href: "/psm/ai-catalog", group: "knowledge", order: 4 },
  { label: "Admin", href: "/psm/admin", group: "knowledge", order: 5 },
  { label: "Analytics", href: "/psm/analytics", group: "knowledge", order: 6 },
];
