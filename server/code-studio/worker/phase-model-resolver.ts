/**
 * Phase Model Resolver — 4-tier model resolution for Code Studio job phases.
 *
 * Resolution priority:
 *   1. Per-phase model  (constraints.__phaseModels[phase].model)
 *   2. Job-level model  (codeJobs.requestedModel)
 *   3. Workspace routing (providerRouter.resolvePlan)
 *   4. OpenCode default  (model: undefined)
 */

export const CONFIGURABLE_PHASES = [
  "planning",
  "building",
  "reviewing",
  "testing",
  "governance_check",
] as const;

export type ConfigurablePhase = (typeof CONFIGURABLE_PHASES)[number];

export interface PhaseModelEntry {
  model: string;
}

export interface PhaseModelConfig {
  [phase: string]: PhaseModelEntry | null | undefined;
}

export interface ResolvedModel {
  model: string | undefined;
  provider: string | undefined;
  source: "per_phase" | "job_level" | "workspace_routing" | "opencode_default";
  routingPlanId?: string;
}

export interface JobModelContext {
  requestedModel: string | null;
  phaseModels: PhaseModelConfig | null;
  workspaceId: number | null;
  useWorkspaceRouting: boolean;
}

/**
 * Map phases to quality-tier hints for the routing engine.
 * Planning/reviewing benefit from higher quality models;
 * building from balanced; testing/governance from fast turnaround.
 */
function phaseToQualityTier(
  phase: ConfigurablePhase
): "FAST" | "BALANCED" | "BEST" {
  switch (phase) {
    case "planning":
      return "BEST";
    case "reviewing":
      return "BEST";
    case "building":
      return "BALANCED";
    case "testing":
      return "BALANCED";
    case "governance_check":
      return "FAST";
    default:
      return "BALANCED";
  }
}

/**
 * Resolve which model to use for a given phase.
 */
export async function resolveModelForPhase(
  phase: ConfigurablePhase,
  context: JobModelContext,
  phasePrompt: string
): Promise<ResolvedModel> {
  // 1. Per-phase model
  const phaseEntry = context.phaseModels?.[phase];
  if (phaseEntry?.model) {
    return {
      model: phaseEntry.model,
      provider: undefined,
      source: "per_phase",
    };
  }

  // 2. Job-level requestedModel
  if (context.requestedModel) {
    return {
      model: context.requestedModel,
      provider: undefined,
      source: "job_level",
    };
  }

  // 3. Workspace routing
  if (context.useWorkspaceRouting && context.workspaceId) {
    try {
      const { providerRouter } = await import("../../inference/provider-router.js");
      const plan = await providerRouter.resolvePlan({
        messages: [{ role: "user" as const, content: phasePrompt }],
        workspaceId: context.workspaceId,
        taskHints: {
          qualityTier: phaseToQualityTier(phase),
          requiredCapabilities: ["chat"],
        },
      });
      return {
        model: undefined, // Let OpenCode use its default for the resolved provider
        provider: plan.primaryProviderName,
        source: "workspace_routing",
        routingPlanId: plan.requestId,
      };
    } catch (err) {
      console.warn(
        `[PhaseModelResolver] Routing failed for phase ${phase}:`,
        err
      );
    }
  }

  // 4. OpenCode default
  return {
    model: undefined,
    provider: undefined,
    source: "opencode_default",
  };
}
