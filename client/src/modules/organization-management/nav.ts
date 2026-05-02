/**
 * Organization Management — Module navigation.
 *
 * Pure data. The platform's nav composer reads this. All hrefs MUST
 * be canonical OM routes under `/om/*`.
 */

export interface OMNavEntry {
  label: string;
  href: string;
  group?: string;
  order?: number;
}

export const organizationManagementNav: OMNavEntry[] = [
  { label: "Portfolio", href: "/om/portfolio", group: "people", order: 0 },
  { label: "Control Panel", href: "/om/control-panel", group: "people", order: 1 },
  { label: "Wizard", href: "/om/wizard", group: "people", order: 2 },
  { label: "List", href: "/om/list", group: "people", order: 3 },
  { label: "Settings", href: "/om/settings", group: "people", order: 4 },
  { label: "Templates", href: "/om/templates", group: "people", order: 5 },
];
