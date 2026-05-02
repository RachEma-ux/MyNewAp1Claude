/**
 * AI Types — Module navigation.
 *
 * Pure data. The platform's nav composer reads this. All hrefs MUST
 * be canonical AI Types routes under `/ai-types/*`.
 */

export interface AITypesNavEntry {
  label: string;
  href: string;
  group?: string;
  order?: number;
}

export const aiTypesNav: AITypesNavEntry[] = [
  { label: "Overview", href: "/ai-types/overview", group: "infrastructure", order: 0 },
  { label: "Catalog", href: "/ai-types/catalog", group: "infrastructure", order: 1 },
  { label: "Taxonomy", href: "/ai-types/taxonomy", group: "infrastructure", order: 2 },
  { label: "Relationships", href: "/ai-types/relationships", group: "infrastructure", order: 3 },
  { label: "Validation", href: "/ai-types/validation", group: "infrastructure", order: 4 },
  { label: "Governance", href: "/ai-types/governance", group: "infrastructure", order: 5 },
  { label: "Control Panel", href: "/ai-types/control-panel", group: "infrastructure", order: 6 },
];
