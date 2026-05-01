/**
 * Application Wiring Inventory — Matrix builder
 *
 * The matrix is a presentation-friendly view: rows are modules,
 * columns are wiring areas. The data is a thin transformation over
 * `buildApplicationWiringInventory()` — no extra parsing, no extra
 * runtime calls.
 */
import { buildApplicationWiringInventory, type AwiRuntimeFacts, type BuildAwiOptions } from "./inventory";
import {
  DEFAULT_MATRIX_COLUMNS,
  type ModuleWiringAreaStatus,
  type ModuleWiringInventory,
  type WiringInventorySummary,
  type WiringMatrix,
} from "./types";

export function buildWiringMatrix(opts: BuildAwiOptions = {}): WiringMatrix {
  const modules = buildApplicationWiringInventory(opts);
  return {
    generatedAt: new Date().toISOString(),
    modules,
    columns: DEFAULT_MATRIX_COLUMNS,
    summary: summarize(modules),
  };
}

export function summarize(modules: ModuleWiringInventory[]): WiringInventorySummary {
  let blockers = 0;
  let warnings = 0;
  let missingRequired = 0;
  let scoreSum = 0;
  let scoreCount = 0;

  let fullyWired = 0;
  let mostlyWired = 0;
  let partial = 0;
  let blocked = 0;
  let declaredOnly = 0;

  for (const mod of modules) {
    blockers += mod.blockers.length;
    warnings += mod.warnings.length;
    for (const a of mod.areas) {
      if (a.required && a.status !== "wired" && a.status !== "not-applicable") {
        missingRequired++;
      }
    }
    if (mod.readinessScore > 0) {
      scoreSum += mod.readinessScore;
      scoreCount++;
    }
    switch (mod.readinessStatus) {
      case "fully-wired":
        fullyWired++;
        break;
      case "mostly-wired":
        mostlyWired++;
        break;
      case "partially-wired":
        partial++;
        break;
      case "declared-only":
        declaredOnly++;
        break;
      case "blocked":
        blocked++;
        break;
    }
  }

  return {
    moduleCount: modules.length,
    fullyWiredCount: fullyWired,
    mostlyWiredCount: mostlyWired,
    partialCount: partial,
    blockedCount: blocked,
    declaredOnlyCount: declaredOnly,
    averageReadinessScore: scoreCount === 0 ? 0 : Math.round(scoreSum / scoreCount),
    blockers,
    warnings,
    missingRequiredWires: missingRequired,
  };
}

export function getModuleWiring(
  moduleKey: string,
  facts?: AwiRuntimeFacts,
): ModuleWiringInventory | null {
  const all = buildApplicationWiringInventory({ facts });
  return all.find((m) => m.moduleKey === moduleKey) ?? null;
}

/* ------------------------------------------------------------------ */
/*  Filters                                                            */
/* ------------------------------------------------------------------ */

export function getMissingWires(
  modules: ModuleWiringInventory[],
): ModuleWiringAreaStatus[] {
  return modules.flatMap((m) => m.areas.filter((a) => a.status === "missing" && a.required));
}

export function getBrokenWires(
  modules: ModuleWiringInventory[],
): ModuleWiringAreaStatus[] {
  return modules.flatMap((m) => m.areas.filter((a) => a.status === "broken"));
}

export function getDeclaredOnlyWires(
  modules: ModuleWiringInventory[],
): ModuleWiringAreaStatus[] {
  return modules.flatMap((m) => m.areas.filter((a) => a.status === "declared-only"));
}

export function getPartialWires(
  modules: ModuleWiringInventory[],
): ModuleWiringAreaStatus[] {
  return modules.flatMap((m) => m.areas.filter((a) => a.status === "partial"));
}
