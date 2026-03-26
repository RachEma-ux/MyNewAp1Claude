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

  // Auto-generate demand based on system type
  const demand = await generateDemandForSystem(
    input.workspaceId,
    system.id,
    input.systemType,
    actorId,
  );

  return { ...system, _generatedDemand: demand };
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

// ── Resource Requests (Demand) ──────────────────────────────────────

export async function createResourceRequest(input: CreateResourceRequestInput, actorId: number) {
  if (!input.role.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Role is required" });
  }

  // Verify system exists
  const system = await repo.getSystemById(input.workspaceId, input.psSystemId);
  if (!system) {
    throw new TRPCError({ code: "NOT_FOUND", message: "PS system not found" });
  }

  const request = await repo.createResourceRequest({
    workspaceId: input.workspaceId,
    psSystemId: input.psSystemId,
    role: input.role.trim(),
    capabilityTags: input.capabilityTags || [],
    quantity: input.quantity ?? 1,
    seniorityLevel: input.seniorityLevel || "mid",
    startDate: input.startDate || null,
    endDate: input.endDate || null,
    allocationPercentage: input.allocationPercentage ?? 100,
    status: "draft",
    createdBy: actorId,
  });

  await logPsAudit({
    workspaceId: input.workspaceId,
    actorId,
    action: "resource_request.create",
    entityType: "ps_resource_request",
    entityId: request.id,
    newValue: { role: request.role, quantity: request.quantity, psSystemId: request.psSystemId },
  });
  await logActivity({
    workspaceId: input.workspaceId,
    moduleKey: "ps",
    actorId,
    action: "resource_request.create",
    targetType: "ps_resource_request",
    targetId: request.id,
  });

  return request;
}

export async function listResourceRequests(workspaceId: number, status?: string) {
  return repo.listResourceRequests(workspaceId, status);
}

export async function listResourceRequestsBySystem(workspaceId: number, psSystemId: number) {
  return repo.listResourceRequestsBySystem(workspaceId, psSystemId);
}

export async function updateResourceRequestStatus(
  workspaceId: number,
  id: number,
  status: PsResourceRequestStatus,
  actorId: number,
) {
  const updated = await repo.updateResourceRequestStatus(workspaceId, id, status);
  if (!updated) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Resource request not found" });
  }

  await logPsAudit({
    workspaceId,
    actorId,
    action: "resource_request.status_change",
    entityType: "ps_resource_request",
    entityId: id,
    newValue: { status },
  });
  await logActivity({
    workspaceId,
    moduleKey: "ps",
    actorId,
    action: "resource_request.status_change",
    targetType: "ps_resource_request",
    targetId: id,
  });

  return updated;
}

export async function getDemandSummary(workspaceId: number, psSystemId: number): Promise<DemandSummary> {
  const requests = await repo.listResourceRequestsBySystem(workspaceId, psSystemId);

  const byStatus: Record<PsResourceRequestStatus, number> = {
    draft: 0,
    open: 0,
    partially_filled: 0,
    filled: 0,
    closed: 0,
  };
  let totalQuantity = 0;

  for (const r of requests) {
    const s = r.status as PsResourceRequestStatus;
    if (byStatus[s] !== undefined) byStatus[s]++;
    totalQuantity += r.quantity ?? 0;
  }

  return {
    psSystemId,
    totalRequests: requests.length,
    totalQuantity,
    byStatus,
    roles: requests.map((r) => ({
      role: r.role,
      quantity: r.quantity ?? 1,
      status: r.status,
    })),
  };
}

// ── Demand Generation ────────────────────────────────────────────────

/**
 * Generate resource requests for a system based on its type.
 * Called during system creation or wizard completion.
 */
export async function generateDemandForSystem(
  workspaceId: number,
  psSystemId: number,
  systemType: string,
  actorId: number,
) {
  const specs = generateDemandSpecs(systemType);
  if (specs.length === 0) return [];

  const items = specs.map((spec) => ({
    workspaceId,
    psSystemId,
    role: spec.role,
    capabilityTags: spec.capabilityTags,
    quantity: resolveQuantity(spec),
    seniorityLevel: spec.seniorityLevel,
    startDate: null as Date | null,
    endDate: null as Date | null,
    allocationPercentage: 100,
    status: "draft",
    createdBy: actorId,
  }));

  const created = await repo.createResourceRequestsBatch(items);

  await logPsAudit({
    workspaceId,
    actorId,
    action: "demand.generate",
    entityType: "ps_system",
    entityId: psSystemId,
    newValue: {
      systemType,
      requestCount: created.length,
      roles: created.map((r) => ({ role: r.role, quantity: r.quantity })),
    },
  });
  await logActivity({
    workspaceId,
    moduleKey: "ps",
    actorId,
    action: "demand.generate",
    targetType: "ps_system",
    targetId: psSystemId,
  });

  return created;
}
