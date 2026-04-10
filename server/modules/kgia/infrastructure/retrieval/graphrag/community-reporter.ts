/**
 * GraphRAG — Community Reporter
 *
 * Generates natural-language summaries for detected communities.
 * V1: Template-based summaries from community structure.
 * Future: LLM-generated summaries via LlmPort.
 */

import type { Community } from "./community-builder";

export interface CommunityReport {
  communityId: string;
  level: number;
  title: string;
  summary: string;
  entityCount: number;
  relationCount: number;
  keyEntities: string[];
}

/**
 * Generate reports for a set of communities.
 */
export function generateCommunityReports(
  communities: Community[],
  entityLabels: Map<string, string>
): CommunityReport[] {
  return communities.map((community) => {
    const keyEntities = community.nodeIds
      .slice(0, 5)
      .map((id) => entityLabels.get(id) ?? id);

    const title = community.title ?? `Community: ${keyEntities.slice(0, 3).join(", ")}`;

    const summary = buildTemplateSummary(community, keyEntities);

    return {
      communityId: community.id,
      level: community.level,
      title,
      summary,
      entityCount: community.nodeIds.length,
      relationCount: community.edgeCount,
      keyEntities,
    };
  });
}

function buildTemplateSummary(community: Community, keyEntities: string[]): string {
  const entityCount = community.nodeIds.length;
  const relationCount = community.edgeCount;

  if (entityCount === 0) return "Empty community with no entities.";

  const entityList = keyEntities.join(", ");
  const parts: string[] = [];

  parts.push(`This community contains ${entityCount} entit${entityCount === 1 ? "y" : "ies"} connected by ${relationCount} relation${relationCount === 1 ? "" : "s"}.`);

  if (keyEntities.length > 0) {
    parts.push(`Key entities include: ${entityList}.`);
  }

  if (community.level > 0) {
    parts.push(`This is a level-${community.level} aggregation of smaller sub-communities.`);
  }

  return parts.join(" ");
}
