/**
 * PSM Selector — Explainable recommendation engine
 *
 * Deterministic, rule-based scoring. No opaque LLM dependency.
 * Each recommendation includes full explanation of why it matched.
 */

import * as repo from "./psm.repository";
import { PSM_SELECTOR_DIMENSIONS } from "./psm.types";

interface DimensionInput {
  dimension: string;
  score: number; // 1-5
}

interface MethodScore {
  methodId: number;
  methodName: string;
  totalScore: number;
  dimensionScores: { dimension: string; score: number; weight: number; contribution: number; reason: string }[];
  explanation: string;
  rank: number;
  aiContributed: boolean;
}

// Default dimension-to-category affinities (used when no fit rules exist in DB)
const DEFAULT_AFFINITIES: Record<string, Record<string, number>> = {
  "root-cause-analysis": { diagnosis_need: 2.0, data_availability: 1.5, process_maturity: 1.2, complexity: 1.3 },
  "creative-problem-solving": { innovation_need: 2.0, uncertainty_level: 1.5, collaboration_intensity: 1.3 },
  "decision-making": { decision_making_need: 2.0, stakeholder_count: 1.5, risk_level: 1.3, data_availability: 1.2 },
  "process-improvement": { optimization_need: 2.0, process_maturity: 1.5, data_availability: 1.3 },
  "strategic-planning": { uncertainty_level: 1.5, stakeholder_count: 1.3, risk_level: 1.5, decision_making_need: 1.2 },
  "design-innovation": { innovation_need: 2.0, collaboration_intensity: 1.5, uncertainty_level: 1.3 },
  "data-analytics": { data_availability: 2.0, optimization_need: 1.5, process_maturity: 1.2 },
  "systems-thinking": { complexity: 2.0, uncertainty_level: 1.5, stakeholder_count: 1.3 },
  "agile-iterative": { urgency: 1.5, collaboration_intensity: 1.5, process_maturity: 1.2, complexity: 1.0 },
  "collaboration-facilitation": { collaboration_intensity: 2.0, stakeholder_count: 1.5, decision_making_need: 1.2 },
};

// Complexity / urgency modifiers
function getComplexityModifier(methodComplexity: string, inputComplexity: number): number {
  if (methodComplexity === "low" && inputComplexity <= 2) return 1.2;
  if (methodComplexity === "medium" && inputComplexity >= 2 && inputComplexity <= 4) return 1.1;
  if (methodComplexity === "high" && inputComplexity >= 4) return 1.2;
  if (methodComplexity === "low" && inputComplexity >= 4) return 0.7; // too simple
  if (methodComplexity === "high" && inputComplexity <= 2) return 0.7; // overkill
  return 1.0;
}

function getUrgencyModifier(methodTimeframe: string, inputUrgency: number): number {
  if (methodTimeframe === "short" && inputUrgency >= 4) return 1.3;
  if (methodTimeframe === "long" && inputUrgency >= 4) return 0.6; // too slow
  if (methodTimeframe === "short" && inputUrgency <= 2) return 0.9;
  return 1.0;
}

export async function recommend(
  dimensions: DimensionInput[],
  problemDescription?: string,
  limit = 10,
): Promise<MethodScore[]> {
  // Get all active methods with their categories
  const methods = await repo.listMethods({ status: "active" });
  const categories = await repo.listCategories();
  const categoryMap = new Map(categories.map((c: any) => [c.id, c.slug]));

  // Try to get DB fit rules first
  const dbFitRules = await repo.getAllFitRules();
  const fitRulesByMethod = new Map<number, any[]>();
  for (const rule of dbFitRules) {
    const arr = fitRulesByMethod.get(rule.methodId) || [];
    arr.push(rule);
    fitRulesByMethod.set(rule.methodId, arr);
  }

  const inputMap = new Map(dimensions.map(d => [d.dimension, d.score]));
  const results: MethodScore[] = [];

  for (const method of methods as any[]) {
    const categorySlug = categoryMap.get(method.categoryId) || "";
    let totalScore = 0;
    const dimensionScores: MethodScore["dimensionScores"] = [];

    // Check for DB fit rules first
    const methodRules = fitRulesByMethod.get(method.id);

    if (methodRules && methodRules.length > 0) {
      // Use DB fit rules
      for (const rule of methodRules) {
        const inputScore = inputMap.get(rule.dimension) || 3;
        const weight = Number(rule.weight) || 1;
        const min = Number(rule.minScore) || 1;
        const max = Number(rule.maxScore) || 5;
        const inRange = inputScore >= min && inputScore <= max;
        const contribution = inRange ? inputScore * weight : inputScore * weight * 0.5;
        totalScore += contribution;
        dimensionScores.push({
          dimension: rule.dimension,
          score: inputScore,
          weight,
          contribution,
          reason: inRange
            ? `${rule.dimension} score ${inputScore} is within ideal range [${min}-${max}]`
            : `${rule.dimension} score ${inputScore} is outside ideal range [${min}-${max}]`,
        });
      }
    } else {
      // Fall back to default affinities based on category
      const affinities = DEFAULT_AFFINITIES[categorySlug] || {};

      for (const dim of dimensions) {
        const weight = affinities[dim.dimension] || 0.5;
        const contribution = dim.score * weight;
        totalScore += contribution;
        dimensionScores.push({
          dimension: dim.dimension,
          score: dim.score,
          weight,
          contribution,
          reason: weight >= 1.5
            ? `${dim.dimension} is a strong signal for ${categorySlug} methods`
            : weight >= 1.0
            ? `${dim.dimension} is relevant for ${categorySlug} methods`
            : `${dim.dimension} has minor relevance for ${categorySlug} methods`,
        });
      }
    }

    // Apply complexity modifier
    const complexityInput = inputMap.get("complexity") || 3;
    const complexityMod = getComplexityModifier(method.complexity || "medium", complexityInput);
    totalScore *= complexityMod;

    // Apply urgency modifier
    const urgencyInput = inputMap.get("urgency") || 3;
    const urgencyMod = getUrgencyModifier(method.timeframe || "medium", urgencyInput);
    totalScore *= urgencyMod;

    // Generate explanation
    const topDims = [...dimensionScores].sort((a, b) => b.contribution - a.contribution).slice(0, 3);
    const explanation = buildExplanation(method, categorySlug, topDims, complexityMod, urgencyMod, totalScore);

    results.push({
      methodId: method.id,
      methodName: method.name,
      totalScore: Math.round(totalScore * 100) / 100,
      dimensionScores,
      explanation,
      rank: 0,
      aiContributed: false,
    });
  }

  // Sort by score descending and assign ranks
  results.sort((a, b) => b.totalScore - a.totalScore);
  results.forEach((r, i) => { r.rank = i + 1; });

  return results.slice(0, limit);
}

function buildExplanation(
  method: any,
  categorySlug: string,
  topDims: MethodScore["dimensionScores"],
  complexityMod: number,
  urgencyMod: number,
  totalScore: number,
): string {
  const parts: string[] = [];
  parts.push(`"${method.name}" (${categorySlug}) scored ${Math.round(totalScore * 100) / 100}.`);

  if (topDims.length > 0) {
    const dimNames = topDims.map(d => `${d.dimension} (${d.score}/5, weight ${d.weight})`);
    parts.push(`Top matching dimensions: ${dimNames.join(", ")}.`);
  }

  if (complexityMod !== 1.0) {
    parts.push(complexityMod > 1.0
      ? `Complexity match bonus: method complexity "${method.complexity}" aligns well with input.`
      : `Complexity mismatch penalty: method complexity "${method.complexity}" doesn't fit well.`);
  }

  if (urgencyMod !== 1.0) {
    parts.push(urgencyMod > 1.0
      ? `Urgency match bonus: method timeframe "${method.timeframe}" fits the urgency level.`
      : `Urgency mismatch penalty: method timeframe "${method.timeframe}" may be too slow/fast.`);
  }

  return parts.join(" ");
}

export async function compareMethodsDetail(methodIds: number[]) {
  const results = [];
  for (const id of methodIds) {
    const method = await repo.getMethodById(id);
    if (!method) continue;
    const definition = await repo.getMethodDefinition(id);
    const workflow = await repo.getMethodWorkflow(id);
    const tags = await repo.getMethodTags(id);
    results.push({
      method,
      definition,
      workflow,
      tags: tags.map((t: any) => t.tag),
    });
  }
  return results;
}
