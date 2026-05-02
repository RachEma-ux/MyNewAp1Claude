/**
 * Projects System — Module navigation.
 *
 * Pure data. The platform's nav composer reads this; modules do not
 * render their own top-level sidebar (the in-capsule S1 sidebar
 * inside `PSShell` is module-internal navigation).
 *
 * All hrefs MUST be canonical PS routes under `/ps/*`. Pointing nav
 * at PM Central, PRM, PSM, HR, OM, or Workforce Assignment routes
 * from PS is a boundary violation enforced by
 * `check:cross-module-links` and `check:module-route-inventory`.
 */

export interface PSNavEntry {
  label: string;
  href: string;
  /** Optional grouping for sidebar ordering. */
  group?: string;
  order?: number;
}

export const psNav: PSNavEntry[] = [
  { label: "Catalog", href: "/ps/catalog", group: "delivery", order: 0 },
  { label: "Ideation", href: "/ps/ideation", group: "delivery", order: 1 },
  { label: "Wizard", href: "/ps/wizard", group: "delivery", order: 2 },
  { label: "List", href: "/ps/list", group: "delivery", order: 3 },
  {
    label: "Control Panel",
    href: "/ps/control-panel",
    group: "delivery",
    order: 4,
  },
  {
    label: "AI Catalog",
    href: "/ps/ai-catalog",
    group: "delivery",
    order: 5,
  },
];
