/**
 * KGRA Agent — Module navigation.
 *
 * Pure data. The platform's nav composer reads this. The href MUST
 * be the canonical KGRA Agent route under `/data-analysis/kgra-agent`.
 */

export interface KgraAgentNavEntry {
  label: string;
  href: string;
  group?: string;
  order?: number;
}

export const kgraAgentNav: KgraAgentNavEntry[] = [
  { label: "KGRA Agent", href: "/data-analysis/kgra-agent", group: "intelligence", order: 0 },
];
