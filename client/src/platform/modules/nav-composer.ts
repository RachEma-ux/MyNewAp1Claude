/**
 * Nav Composer — derives navigation entries from registered manifests.
 *
 * MainLayout uses this to render the sidebar. Adding a module never
 * requires editing MainLayout — just register a manifest with `navigation`.
 */

import { listClientModules } from "./registry";

export interface NavEntry {
  moduleKey: string;
  group?: string;
  label: string;
  icon?: string;
  order: number;
  /** First route path of the module — used for `to`. */
  to: string;
}

export function getNavEntries(): NavEntry[] {
  const out: NavEntry[] = [];
  for (const m of listClientModules()) {
    const navs = m.navigation ?? [];
    for (const nav of navs) {
      const firstRoute = m.routes[0]?.path ?? "/";
      out.push({
        moduleKey: m.key,
        group: nav.group,
        label: nav.label,
        icon: nav.icon,
        order: nav.order ?? 100,
        to: firstRoute,
      });
    }
  }
  out.sort((a, b) => {
    if (a.group !== b.group) return (a.group ?? "").localeCompare(b.group ?? "");
    return a.order - b.order;
  });
  return out;
}
