/**
 * HR — Module navigation.
 *
 * Pure data. The platform's nav composer reads this. HR's runtime
 * sidebar (the Carbon-style 3-level `HRSideNav`) is rendered by
 * MainLayout from `@/lib/hrNavConfig` + `@/lib/hrNavAuth`; that's
 * platform-side chrome, not module-internal. This file declares the
 * top-level entry the platform composer uses to surface HR.
 *
 * All hrefs MUST be canonical HR routes under `/hr/*`.
 */

export interface HRNavEntry {
  label: string;
  href: string;
  group?: string;
  order?: number;
}

export const hrNav: HRNavEntry[] = [
  { label: "HR", href: "/hr", group: "people", order: 0 },
];
