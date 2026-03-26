/**
 * PS Module — Service Layer
 *
 * Orchestrates repository calls and enforces minimal business rules.
 */

import { TRPCError } from "@trpc/server";
import * as repo from "./ps.repository";
import { logPsAudit } from "./ps.audit";
import { logActivity } from "../modules/registry";
import { classifyScenario as runClassifier } from "./ps.classifier";
import type {
  CreateSystemInput,
  CreateWizardRunInput,
  ClassificationInput,
  CreateResourceRequestInput,
  PsResourceRequestStatus,
  DemandSummary,
} from "./ps.types";
import { generateDemandSpecs, resolveQuantity } from "./ps.demand";

// ── Systems ──────────────────────────────────────────────────────────────

export async function createSystem(input: CreateSystemInput, actorId: number) {
  if (!input.name.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "System name is required" });
  }

  const system = await repo.createSystem({
    workspaceId: input.workspaceId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    systemType: input.systemType,
    lifecycleType: input.lifecycleType || null,
    governanceProfile: input.governanceProfile || null,
    status: "draft",
    createdBy: actorId,
  });

  await logPsAudit({
    workspaceId: input.workspaceId,
    actorId,
    action: "system.create",
    entityType: "ps_system",
    entityId: system.id,
    newValue: { name: system.name, systemType: system.systemType },
  });
  await logActivity({
    workspaceId: input.workspaceId,
    moduleKey: "ps",
    actorId,
    action: "system.create",
    targetType: "ps_system",
    targetId: system.id,
  });

  return system;
}

export async function getSystem(workspaceId: number, id: number) {
  const system = await repo.getSystemById(workspaceId, id);
  if (!system) {
    throw new TRPCError({ code: "NOT_FOUND", message: "PS system not found" });
  }
  return system;
}

export async function listSystems(workspaceId: number, status?: string) {
  return repo.listSystems(workspaceId, status);
}

// ── Wizard Runs ──────────────────────────────────────────────────────────

export async function createWizardRun(input: CreateWizardRunInput, actorId: number) {
  if (!input.scenarioText.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Scenario text is required" });
  }

  const run = await repo.createWizardRun({
    workspaceId: input.workspaceId,
    scenarioText: input.scenarioText.trim(),
    inputPayload: input.inputPayload,
    resultPayload: input.resultPayload,
    confidence: input.confidence != null ? String(input.confidence) : null,
    selectedSystemType: input.selectedSystemType || null,
    createdBy: actorId,
  });

  await logPsAudit({
    workspaceId: input.workspaceId,
    actorId,
    action: "wizard_run.create",
    entityType: "ps_wizard_run",
    entityId: run.id,
    newValue: { scenarioText: run.scenarioText, selectedSystemType: run.selectedSystemType },
  });
  await logActivity({
    workspaceId: input.workspaceId,
    moduleKey: "ps",
    actorId,
    action: "wizard_run.create",
    targetType: "ps_wizard_run",
    targetId: run.id,
  });

  return run;
}

export async function getWizardRun(workspaceId: number, id: number) {
  const run = await repo.getWizardRunById(workspaceId, id);
  if (!run) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Wizard run not found" });
  }
  return run;
}

export async function listWizardRuns(workspaceId: number) {
  return repo.listWizardRuns(workspaceId);
}

// ── Classification ────────────────────────────────────────────────────

export function classifyScenario(input: ClassificationInput) {
  return runClassifier(input);
}

// ── Catalog ──────────────────────────────────────────────────────────────

export async function getCatalog() {
  return repo.getCatalogSystemTypes();
}
