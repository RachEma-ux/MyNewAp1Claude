/**
 * File Parser Service — Parse CSV / JSON / YAML files into PreviewEntry[] format
 *
 * Supported file contracts:
 * - JSON: UTF-8, array of objects OR { "entries": [...] } / { "data": [...] } wrapper
 * - YAML: UTF-8, sequence of objects OR mapping with "entries"/"data" sequence
 * - CSV:  UTF-8, header row required, one row = one entry
 *
 * All formats normalize into a canonical import shape before validation.
 * Pipe-separated values (|) are used for arrays in CSV fields (tags, capabilities).
 *
 * See shared/catalog-import-types.ts for the full contract definition.
 */
import { randomUUID } from "crypto";
import Papa from "papaparse";
import * as yaml from "js-yaml";
import type {
  PreviewEntry,
  ValidationIssue,
  ValidationIssueCode,
  FileImportPreviewResponse,
} from "@shared/catalog-import-types";
import {
  IMPORT_FIELD_ALIASES,
  IMPORT_CANONICAL_FIELDS,
  VALID_IMPORT_ENTRY_TYPES,
} from "@shared/catalog-import-types";

// ============================================================================
// Constants
// ============================================================================

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_ENTRIES = 500;

/** Set of valid entry types for fast lookup */
const VALID_TYPES_SET = new Set<string>(VALID_IMPORT_ENTRY_TYPES);

// Build a complete alias map that also includes canonical names mapping to themselves
const FIELD_ALIASES: Record<string, string> = { ...IMPORT_FIELD_ALIASES };
for (const f of IMPORT_CANONICAL_FIELDS) {
  FIELD_ALIASES[f.toLowerCase()] = f;
}

// Set of lowercase canonical field names — used to distinguish "alias used" vs "canonical name"
const CANONICAL_LOWER = new Set([...IMPORT_CANONICAL_FIELDS].map((f) => f.toLowerCase()));

// ============================================================================
// Types
// ============================================================================

export type FileFormat = "json" | "yaml" | "csv";

export interface ParseResult {
  entries: PreviewEntry[];
  parseErrors: string[];
  format: FileFormat;
  /** Per-entry validation issues collected during normalization */
  allIssues: ValidationIssue[];
  /** File-level issues (not tied to a specific row) */
  globalIssues: string[];
}

interface RawRecord {
  [key: string]: unknown;
}

// ============================================================================
// Format Detection
// ============================================================================

export function detectFormat(filename: string, contentSample: string): FileFormat {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "json") return "json";
  if (ext === "yaml" || ext === "yml") return "yaml";
  if (ext === "csv") return "csv";

  // Heuristic fallback: try to detect from content
  const trimmed = contentSample.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) return "json";
  if (trimmed.startsWith("---") || /^[\w]+:/m.test(trimmed)) return "yaml";
  if (trimmed.includes(",") && trimmed.includes("\n")) return "csv";

  return "csv"; // default fallback
}

// ============================================================================
// Field Normalization
// ============================================================================

interface NormalizationResult {
  canonical: string | null;
  wasAlias: boolean;
  originalKey: string;
}

function normalizeFieldName(key: string): NormalizationResult {
  const lower = key.toLowerCase().trim();
  const canonical = FIELD_ALIASES[lower] ?? null;
  // It's an alias if the lowercase key is NOT a canonical name (case-insensitive)
  const wasAlias = canonical !== null && !CANONICAL_LOWER.has(lower);
  return { canonical, wasAlias, originalKey: key };
}

/**
 * Parse a string value into an array, supporting pipe-separated (|) or
 * comma-separated (,) formats. Pipe takes precedence if present.
 */
function parseArrayString(value: string): string[] {
  if (value.includes("|")) {
    return value.split("|").map((s) => s.trim()).filter(Boolean);
  }
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

// ============================================================================
// Normalize a raw record into a PreviewEntry
// ============================================================================

function normalizeRecord(
  raw: RawRecord,
  index: number,
  format: FileFormat,
): { entry: PreviewEntry; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const mapped: Record<string, unknown> = {};
  const aliasesUsed: Array<{ from: string; to: string }> = [];
  const unsupportedFields: string[] = [];

  // Map raw fields to canonical names, track aliases and unsupported fields
  for (const [key, value] of Object.entries(raw)) {
    // Skip empty CSV columns (PapaParse can produce these)
    if (key.trim() === "") continue;

    const { canonical, wasAlias } = normalizeFieldName(key);
    if (canonical) {
      mapped[canonical] = value;
      if (wasAlias) {
        aliasesUsed.push({ from: key, to: canonical });
      }
    } else {
      unsupportedFields.push(key);
    }
  }

  // Emit alias-used warnings
  for (const alias of aliasesUsed) {
    issues.push({
      field: alias.to,
      message: `Field "${alias.from}" was mapped to "${alias.to}" via alias`,
      severity: "warning",
      rowIndex: index,
      code: "ALIAS_USED",
    });
  }

  // Emit unsupported field warnings
  for (const field of unsupportedFields) {
    issues.push({
      field,
      message: `Unsupported field "${field}" was ignored`,
      severity: "warning",
      rowIndex: index,
      code: "UNSUPPORTED_FIELD",
    });
  }

  // Extract and normalize fields
  const name = String(mapped.name || "").trim();
  const displayName = mapped.displayName
    ? String(mapped.displayName).trim()
    : undefined;
  const description = mapped.description ? String(mapped.description).trim() : null;
  const entryType = String(mapped.entryType || "").trim().toLowerCase();
  const category = mapped.category ? String(mapped.category).trim() : undefined;
  const subCategory = mapped.subCategory ? String(mapped.subCategory).trim() : undefined;
  const scope = mapped.scope ? String(mapped.scope).trim() : undefined;

  // Parse tags: string → array (pipe-separated in CSV, native arrays in JSON/YAML)
  let tags: string[] = [];
  if (Array.isArray(mapped.tags)) {
    tags = mapped.tags.map(String);
  } else if (typeof mapped.tags === "string" && mapped.tags.trim()) {
    tags = parseArrayString(mapped.tags);
  }

  // Parse capabilities: string → array
  let capabilities: string[] = [];
  if (Array.isArray(mapped.capabilities)) {
    capabilities = mapped.capabilities.map(String);
  } else if (typeof mapped.capabilities === "string" && mapped.capabilities.trim()) {
    capabilities = parseArrayString(mapped.capabilities);
  }

  // Parse config: JSON string → object
  let config: Record<string, unknown> = {};
  if (typeof mapped.config === "object" && mapped.config !== null && !Array.isArray(mapped.config)) {
    config = mapped.config as Record<string, unknown>;
  } else if (typeof mapped.config === "string" && mapped.config.trim()) {
    try {
      const parsed = JSON.parse(mapped.config);
      if (typeof parsed === "object" && parsed !== null) config = parsed;
    } catch {
      issues.push({
        field: "config",
        message: "Config field contains invalid JSON — ignored",
        severity: "warning",
        rowIndex: index,
        code: "INVALID_JSON",
      });
    }
  }

  // ---- Validation ----

  // Required: name
  if (!name) {
    issues.push({
      field: "name",
      message: "name is required",
      severity: "error",
      rowIndex: index,
      entryKey: name || undefined,
      code: "REQUIRED_FIELD_MISSING",
    });
  } else if (name.length > 255) {
    issues.push({
      field: "name",
      message: "name exceeds 255 characters",
      severity: "error",
      rowIndex: index,
      entryKey: name,
      code: "MAX_LENGTH_EXCEEDED",
    });
  }

  // Required: entryType
  if (!entryType) {
    issues.push({
      field: "entryType",
      message: "entryType is required",
      severity: "error",
      rowIndex: index,
      entryKey: name || undefined,
      code: "REQUIRED_FIELD_MISSING",
    });
  } else if (!VALID_TYPES_SET.has(entryType)) {
    issues.push({
      field: "entryType",
      message: `Invalid entryType "${entryType}". Must be: ${[...VALID_IMPORT_ENTRY_TYPES].join(", ")}`,
      severity: "error",
      rowIndex: index,
      entryKey: name || undefined,
      code: "INVALID_ENUM",
    });
  }

  // Optional field validation
  if (description && description.length > 5000) {
    issues.push({
      field: "description",
      message: "Description exceeds 5000 characters",
      severity: "warning",
      rowIndex: index,
      entryKey: name || undefined,
      code: "MAX_LENGTH_EXCEEDED",
    });
  }

  if (displayName && displayName.length > 255) {
    issues.push({
      field: "displayName",
      message: "displayName exceeds 255 characters",
      severity: "warning",
      rowIndex: index,
      entryKey: name || undefined,
      code: "MAX_LENGTH_EXCEEDED",
    });
  }

  // Determine risk level
  let riskLevel: "low" | "medium" | "high" = "low";
  if (issues.some((i) => i.severity === "error")) {
    riskLevel = "high";
  } else if (issues.length > 0) {
    riskLevel = "medium";
  }

  // Build metadata blob for storage in preview row
  const metadata: Record<string, unknown> = {
    ...config,
    ...(category && { category }),
    ...(subCategory && { subCategory }),
    ...(scope && { scope }),
    ...(tags.length > 0 && { tags }),
    ...(capabilities.length > 0 && { capabilities }),
    ...(displayName && { displayName }),
    importRowIndex: index,
    importFormat: format,
  };

  const validType = VALID_IMPORT_ENTRY_TYPES.includes(entryType as any)
    ? entryType
    : "model";

  const entry: PreviewEntry = {
    tempId: randomUUID(),
    type: validType,
    name: name || `unnamed-row-${index + 1}`,
    description,
    source: "file_import",
    metadata,
    duplicateStatus: "new", // will be set by dedup service
    riskLevel,
    validationIssues: issues,
  };

  return { entry, issues };
}

// ============================================================================
// Parsers
// ============================================================================

function parseJSON(content: string): { records: RawRecord[]; errors: string[] } {
  const errors: string[] = [];
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch (e: any) {
    return { records: [], errors: [`Invalid JSON: ${e.message}`] };
  }

  // Support both array and { entries: [...] } / { data: [...] } wrapper
  let records: unknown[];
  if (Array.isArray(parsed)) {
    records = parsed;
  } else if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as any).entries)) {
    records = (parsed as any).entries;
  } else if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as any).data)) {
    records = (parsed as any).data;
  } else {
    return { records: [], errors: ["JSON must be an array of objects, or an object with an 'entries' or 'data' array"] };
  }

  if (records.length === 0) {
    return { records: [], errors: ["File contains no entries"] };
  }

  if (records.length > MAX_ENTRIES) {
    errors.push(`File contains ${records.length} entries, truncated to ${MAX_ENTRIES}`);
    records = records.slice(0, MAX_ENTRIES);
  }

  const validRecords: RawRecord[] = [];
  for (let i = 0; i < records.length; i++) {
    const item = records[i];
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      errors.push(`Row ${i + 1}: not a valid object, skipped`);
      continue;
    }
    validRecords.push(item as RawRecord);
  }

  return { records: validRecords, errors };
}

function parseYAML(content: string): { records: RawRecord[]; errors: string[] } {
  const errors: string[] = [];
  let parsed: unknown;

  try {
    // Use DEFAULT_SCHEMA to block dangerous YAML types (!!python/object, etc.)
    parsed = yaml.load(content, { schema: yaml.DEFAULT_SCHEMA });
  } catch (e: any) {
    return { records: [], errors: [`Invalid YAML: ${e.message}`] };
  }

  // Support both array and { entries: [...] } / { data: [...] } wrapper
  let records: unknown[];
  if (Array.isArray(parsed)) {
    records = parsed;
  } else if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as any).entries)) {
    records = (parsed as any).entries;
  } else if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as any).data)) {
    records = (parsed as any).data;
  } else {
    return { records: [], errors: ["YAML must be a sequence of objects, or a mapping with an 'entries' or 'data' sequence"] };
  }

  if (records.length === 0) {
    return { records: [], errors: ["File contains no entries"] };
  }

  if (records.length > MAX_ENTRIES) {
    errors.push(`File contains ${records.length} entries, truncated to ${MAX_ENTRIES}`);
    records = records.slice(0, MAX_ENTRIES);
  }

  const validRecords: RawRecord[] = [];
  for (let i = 0; i < records.length; i++) {
    const item = records[i];
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      errors.push(`Row ${i + 1}: not a valid object, skipped`);
      continue;
    }
    validRecords.push(item as RawRecord);
  }

  return { records: validRecords, errors };
}

function parseCSV(content: string): { records: RawRecord[]; errors: string[] } {
  const errors: string[] = [];

  const result = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      errors.push(`Row ${(err.row ?? 0) + 1}: ${err.message}`);
    }
  }

  let records = result.data as RawRecord[];

  if (records.length === 0) {
    return { records: [], errors: ["CSV contains no data rows"] };
  }

  if (records.length > MAX_ENTRIES) {
    errors.push(`File contains ${records.length} rows, truncated to ${MAX_ENTRIES}`);
    records = records.slice(0, MAX_ENTRIES);
  }

  return { records, errors };
}

// ============================================================================
// Within-File Duplicate Detection
// ============================================================================

function detectWithinFileDuplicates(entries: PreviewEntry[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Map<string, number>(); // name → first row index

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const key = entry.name.toLowerCase();
    if (!key || key.startsWith("unnamed-row-")) continue;

    if (seen.has(key)) {
      issues.push({
        field: "name",
        message: `Duplicate name "${entry.name}" — first seen at row ${seen.get(key)! + 1}`,
        severity: "warning",
        rowIndex: i,
        entryKey: entry.name,
        code: "DUPLICATE_KEY_IN_FILE",
      });
    } else {
      seen.set(key, i);
    }
  }

  return issues;
}

// ============================================================================
// Main Parse Function
// ============================================================================

export function parseFileContent(
  content: string,
  filename: string,
): ParseResult {
  const globalIssues: string[] = [];

  // Size check
  const sizeBytes = Buffer.byteLength(content, "utf8");
  if (sizeBytes > MAX_FILE_SIZE) {
    return {
      entries: [],
      parseErrors: [`File too large: ${(sizeBytes / 1024 / 1024).toFixed(1)}MB exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`],
      format: "json",
      allIssues: [],
      globalIssues: [`File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB size limit`],
    };
  }

  const format = detectFormat(filename, content);
  let records: RawRecord[];
  let parseErrors: string[];

  switch (format) {
    case "json":
      ({ records, errors: parseErrors } = parseJSON(content));
      break;
    case "yaml":
      ({ records, errors: parseErrors } = parseYAML(content));
      break;
    case "csv":
      ({ records, errors: parseErrors } = parseCSV(content));
      break;
    default:
      return {
        entries: [],
        parseErrors: [`Unsupported format: ${format}`],
        format,
        allIssues: [],
        globalIssues: [`Unsupported file format: ${format}`],
      };
  }

  if (records.length === 0) {
    return { entries: [], parseErrors, format, allIssues: [], globalIssues: parseErrors };
  }

  // Normalize each record into a PreviewEntry, collecting all issues
  const allIssues: ValidationIssue[] = [];
  const entries: PreviewEntry[] = [];

  for (let i = 0; i < records.length; i++) {
    const { entry, issues } = normalizeRecord(records[i], i, format);
    entries.push(entry);
    allIssues.push(...issues);
  }

  // Within-file duplicate detection
  const dupIssues = detectWithinFileDuplicates(entries);
  allIssues.push(...dupIssues);

  // Attach duplicate issues to the relevant entries
  for (const issue of dupIssues) {
    if (issue.rowIndex !== undefined && entries[issue.rowIndex]) {
      entries[issue.rowIndex].validationIssues.push(issue);
      // Upgrade risk level if not already high
      if (entries[issue.rowIndex].riskLevel === "low") {
        entries[issue.rowIndex].riskLevel = "medium";
      }
    }
  }

  // Add parse errors to global issues
  globalIssues.push(...parseErrors);

  return { entries, parseErrors, format, allIssues, globalIssues };
}

// ============================================================================
// Build FileImportPreviewResponse from ParseResult + deduped entries
// ============================================================================

export function buildFileImportPreview(
  parseResult: ParseResult,
  dedupedEntries: PreviewEntry[],
): FileImportPreviewResponse {
  const invalidRecords = dedupedEntries.filter((e) =>
    e.validationIssues.some((i) => i.severity === "error"),
  ).length;
  const warningCount = dedupedEntries.reduce(
    (sum, e) => sum + e.validationIssues.filter((i) => i.severity === "warning").length,
    0,
  );

  return {
    fileType: parseResult.format,
    totalRecords: dedupedEntries.length,
    validRecords: dedupedEntries.length - invalidRecords,
    invalidRecords,
    warningCount,
    entries: dedupedEntries,
    issues: parseResult.allIssues,
    globalIssues: parseResult.globalIssues,
  };
}
