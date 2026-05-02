/**
 * Culture & Values — Module navigation.
 *
 * Pure data. The platform's nav composer reads this. All hrefs MUST
 * be canonical CV routes under `/cv/*`.
 */

export interface CVNavEntry {
  label: string;
  href: string;
  group?: string;
  order?: number;
}

export const cultureValuesNav: CVNavEntry[] = [
  { label: "Portfolio", href: "/cv/portfolio", group: "people", order: 0 },
  { label: "Wizard", href: "/cv/wizard", group: "people", order: 1 },
  { label: "Settings", href: "/cv/settings", group: "people", order: 2 },
];
