/**
 * OpenRouter — Module navigation.
 *
 * Pure data. The platform's nav composer reads this. All hrefs MUST
 * be canonical OpenRouter routes under `/openrouter/*`.
 */

export interface OpenRouterNavEntry {
  label: string;
  href: string;
  group?: string;
  order?: number;
}

export const openRouterNav: OpenRouterNavEntry[] = [
  { label: "Overview", href: "/openrouter", group: "infrastructure", order: 0 },
  { label: "Connect", href: "/openrouter/connect", group: "infrastructure", order: 1 },
  { label: "Models", href: "/openrouter/models", group: "infrastructure", order: 2 },
  { label: "Routing", href: "/openrouter/routing", group: "infrastructure", order: 3 },
  { label: "Guardrails", href: "/openrouter/guardrails", group: "infrastructure", order: 4 },
  { label: "Playground", href: "/openrouter/playground", group: "infrastructure", order: 5 },
  { label: "Usage", href: "/openrouter/usage", group: "infrastructure", order: 6 },
  { label: "Health", href: "/openrouter/health", group: "infrastructure", order: 7 },
  { label: "Activity", href: "/openrouter/activity", group: "infrastructure", order: 8 },
];
