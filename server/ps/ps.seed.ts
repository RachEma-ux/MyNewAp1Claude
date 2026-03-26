/**
 * PS Module — Scope Matrix Seed Engine
 *
 * Loads seed JSON and inserts into the database in a single transaction:
 *   1. ps_matrix_versions  (draft version)
 *   2. ps_scope_registry   (all scopes)
 *   3. ps_scope_matrix_profile (profile per scope)
 *   4. ps_matrix_imports   (import audit record)
 *
 * Rolls back entirely on any failure. No partial inserts.
 */

import { getDb } from "../db/connection";
import {
  psMatrixVersions,
  psScopeRegistry,
  psScopeMatrixProfile,
  psMatrixImports,
} from "../../drizzle/tables/ps";
import { buildCanonicalTypeMap, CANONICAL_HEADERS } from "./ps.matrix-headers";
import { logPsAudit } from "./ps.audit";

// ── Types ────────────────────────────────────────────────────────────

interface SeedProfileData {
  pmiValue?: string | null;
  prince2Value?: string | null;
  isoValue?: string | null;
  ipmaValue?: string | null;
  cmmiValue?: string | null;
  aspiceValue?: string | null;
  leanMethodValue?: string | null;
  agileFrameworkValue?: string | null;
  traditionalMethodValue?: string | null;
  agileFrameworksValue?: string | null;
  hybridMethodValue?: string | null;
  caseScenario?: string | null;
  selectedStandards?: string | null;
  selectedFrameworks?: string | null;
}

interface SeedRecord {
  scopeLabel: string;
  scopeCode: string;
  sourceRowNumber: number;
  profile: SeedProfileData;
}

interface SeedPayload {
  matrixVersionSeed: {
    version: string;
    label: string;
    sourceType: string;
    sourceName: string;
  };
  headers: string[];
  records: SeedRecord[];
}

export interface SeedResult {
  versionId: number;
  version: string;
  scopesInserted: number;
  profilesInserted: number;
  importRecordId: number;
  warnings: string[];
}

// ── Validation ───────────────────────────────────────────────────────

const VALID_HEADER_TYPES = new Set([
  "Standard", "Method", "Framework",
  "Standards", "Methods", "Frameworks",
]);

function validateSeedData(data: SeedPayload): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Version metadata
  if (!data.matrixVersionSeed?.version?.trim()) {
    errors.push("Missing or empty matrixVersionSeed.version");
  }
  if (!data.matrixVersionSeed?.label?.trim()) {
    errors.push("Missing or empty matrixVersionSeed.label");
  }

  // Records
  if (!data.records || data.records.length === 0) {
    errors.push("No records to seed");
    return { valid: false, errors };
  }

  const seenCodes = new Set<string>();
  for (let i = 0; i < data.records.length; i++) {
    const r = data.records[i];

    if (!r.scopeLabel?.trim()) {
      errors.push(`Record ${i}: empty scopeLabel`);
    }
    if (!r.scopeCode?.trim()) {
      errors.push(`Record ${i}: empty scopeCode`);
    }
    if (seenCodes.has(r.scopeCode)) {
      errors.push(`Record ${i}: duplicate scopeCode "${r.scopeCode}"`);
    }
    seenCodes.add(r.scopeCode);

    if (typeof r.sourceRowNumber !== "number" || r.sourceRowNumber < 1) {
      errors.push(`Record ${i}: invalid sourceRowNumber`);
    }
  }

  // Validate type map
  const typeMap = buildCanonicalTypeMap();
  for (const [key, val] of Object.entries(typeMap)) {
    if (!VALID_HEADER_TYPES.has(val)) {
      errors.push(`Type map: invalid type "${val}" for key "${key}"`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Build raw row JSON from profile ──────────────────────────────────

function buildRawRowJson(record: SeedRecord): Record<string, unknown> {
  return {
    Scope: record.scopeLabel,
    "(Standard) PMI": record.profile.pmiValue ?? null,
    "(Standard) PRINCE2": record.profile.prince2Value ?? null,
    "(Standard) ISO": record.profile.isoValue ?? null,
    "(Standard) IPMA": record.profile.ipmaValue ?? null,
    "(Standard) CMMI": record.profile.cmmiValue ?? null,
    "(Standard) ASPICE": record.profile.aspiceValue ?? null,
    "(Method) Lean": record.profile.leanMethodValue ?? null,
    "(Framework) Agile": record.profile.agileFrameworkValue ?? null,
    "(Method) Traditional": record.profile.traditionalMethodValue ?? null,
    "(Framework) AgileFrameworks": record.profile.agileFrameworksValue ?? null,
    "(Method) Hybrid": record.profile.hybridMethodValue ?? null,
    CaseScenario: record.profile.caseScenario ?? null,
    SelectedStandards: record.profile.selectedStandards ?? null,
    SelectedFrameworks: record.profile.selectedFrameworks ?? null,
    _sourceRowNumber: record.sourceRowNumber,
  };
}

// ── Main Seed Function ───────────────────────────────────────────────

export async function seedScopeMatrix(
  actorId: number,
  seedData?: SeedPayload,
): Promise<SeedResult> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  // Load seed data
  let data: SeedPayload;
  if (seedData) {
    data = seedData;
  } else {
    // Default: load from bundled JSON
    data = (await import("./seed-data/scope-matrix-v1.json")).default as SeedPayload;
  }

  // Pre-validate
  const validation = validateSeedData(data);
  if (!validation.valid) {
    throw new Error(`Seed validation failed:\n${validation.errors.join("\n")}`);
  }

  const warnings: string[] = [];
  const typeMap = buildCanonicalTypeMap();
  const now = new Date();

  // Execute in a single transaction
  return await db.transaction(async (tx) => {
    // ── Step 1: Create matrix version ────────────────────────────────
    const [version] = await tx.insert(psMatrixVersions).values({
      version: data.matrixVersionSeed.version,
      label: data.matrixVersionSeed.label,
      status: "draft",
      sourceType: data.matrixVersionSeed.sourceType || "excel",
      sourceName: data.matrixVersionSeed.sourceName || null,
      createdBy: actorId,
      createdAt: now,
    }).returning();

    const versionId = version.id;

    // ── Step 2: Insert scopes ────────────────────────────────────────
    const scopeRows = data.records.map((r) => ({
      versionId,
      code: r.scopeCode,
      label: r.scopeLabel,
      description: null as string | null,
      family: null as string | null,
      isActive: 1,
      sourceRowNumber: r.sourceRowNumber,
      createdAt: now,
      updatedAt: now,
    }));

    const insertedScopes = await tx.insert(psScopeRegistry)
      .values(scopeRows)
      .returning();

    if (insertedScopes.length !== data.records.length) {
      throw new Error(
        `Scope insert count mismatch: expected ${data.records.length}, got ${insertedScopes.length}`,
      );
    }

    // Build code → scope ID lookup
    const scopeIdByCode = new Map<string, number>();
    for (const s of insertedScopes) {
      scopeIdByCode.set(s.code, s.id);
    }

    // ── Step 3: Insert scope profiles ────────────────────────────────
    const profileRows = data.records.map((r) => {
      const scopeId = scopeIdByCode.get(r.scopeCode);
      if (!scopeId) {
        throw new Error(`No scope ID found for code "${r.scopeCode}" — this should not happen`);
      }

      return {
        scopeId,
        pmiValue: r.profile.pmiValue ?? null,
        prince2Value: r.profile.prince2Value ?? null,
        isoValue: r.profile.isoValue ?? null,
        ipmaValue: r.profile.ipmaValue ?? null,
        cmmiValue: r.profile.cmmiValue ?? null,
        aspiceValue: r.profile.aspiceValue ?? null,
        leanMethodValue: r.profile.leanMethodValue ?? null,
        agileFrameworkValue: r.profile.agileFrameworkValue ?? null,
        traditionalMethodValue: r.profile.traditionalMethodValue ?? null,
        agileFrameworksValue: r.profile.agileFrameworksValue ?? null,
        hybridMethodValue: r.profile.hybridMethodValue ?? null,
        caseScenario: r.profile.caseScenario ?? null,
        selectedStandards: r.profile.selectedStandards ?? null,
        selectedFrameworks: r.profile.selectedFrameworks ?? null,
        rawRowJson: buildRawRowJson(r),
        typeMapJson: typeMap,
        createdAt: now,
        updatedAt: now,
      };
    });

    const insertedProfiles = await tx.insert(psScopeMatrixProfile)
      .values(profileRows)
      .returning();

    if (insertedProfiles.length !== data.records.length) {
      throw new Error(
        `Profile insert count mismatch: expected ${data.records.length}, got ${insertedProfiles.length}`,
      );
    }

    // ── Step 4: Insert import audit record ───────────────────────────
    const [importRecord] = await tx.insert(psMatrixImports).values({
      versionId,
      importType: "scope_matrix",
      sourceType: data.matrixVersionSeed.sourceType || "excel",
      sourceName: data.matrixVersionSeed.sourceName || null,
      sheetName: "2. DB Scoops Full Matrix",
      rawPayloadJson: {
        seedFile: "scope-matrix-v1.json",
        headerCount: data.headers.length,
        recordCount: data.records.length,
      },
      importStatus: "committed",
      totalRows: data.records.length,
      importedRows: insertedProfiles.length,
      skippedRows: 0,
      scopesCount: insertedScopes.length,
      questionsCount: 0,
      cellsCount: 0,
      warningsJson: warnings.length > 0 ? warnings : null,
      errorsJson: null,
      createdBy: actorId,
      createdAt: now,
      committedAt: now,
    }).returning();

    return {
      versionId,
      version: data.matrixVersionSeed.version,
      scopesInserted: insertedScopes.length,
      profilesInserted: insertedProfiles.length,
      importRecordId: importRecord.id,
      warnings,
    };
  });
}
