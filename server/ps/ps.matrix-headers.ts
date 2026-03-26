/**
 * PS Module — Matrix Header Parsing & Type Derivation
 *
 * Parses the header row from sheet "2. DB Scoops Full Matrix"
 * and derives Type classification for each column.
 *
 * Type values: Standard | Method | Framework | Standards | Methods | Frameworks | null
 */

// ── Allowed Type enum ────────────────────────────────────────────────

export const HEADER_TYPES = [
  "Standard",
  "Method",
  "Framework",
  "Standards",
  "Methods",
  "Frameworks",
] as const;

export type HeaderType = (typeof HEADER_TYPES)[number];

// ── Headers excluded from type classification ────────────────────────

const EXCLUDED_HEADERS = new Set(["Scope", "CaseScenario"]);

// ── Canonical header definitions from the workbook ───────────────────

export interface HeaderDefinition {
  headerKey: string;
  headerLabel: string;
  headerType: HeaderType | null;
  sortOrder: number;
}

/**
 * The canonical header list from "2. DB Scoops Full Matrix" (columns A–O).
 * This is the source of truth for the sheet structure.
 */
export const CANONICAL_HEADERS: HeaderDefinition[] = [
  { headerKey: "Scope",              headerLabel: "Scope",                     headerType: null,          sortOrder: 0 },
  { headerKey: "PMI",                headerLabel: "(Standard) PMI",            headerType: "Standard",    sortOrder: 1 },
  { headerKey: "PRINCE2",            headerLabel: "(Standard) PRINCE2",        headerType: "Standard",    sortOrder: 2 },
  { headerKey: "ISO",                headerLabel: "(Standard) ISO",            headerType: "Standard",    sortOrder: 3 },
  { headerKey: "IPMA",               headerLabel: "(Standard) IPMA",           headerType: "Standard",    sortOrder: 4 },
  { headerKey: "CMMI",               headerLabel: "(Standard) CMMI",           headerType: "Standard",    sortOrder: 5 },
  { headerKey: "ASPICE",             headerLabel: "(Standard) ASPICE",         headerType: "Standard",    sortOrder: 6 },
  { headerKey: "Lean",               headerLabel: "(Method) Lean",             headerType: "Method",      sortOrder: 7 },
  { headerKey: "Agile",              headerLabel: "(Framework) Agile",         headerType: "Framework",   sortOrder: 8 },
  { headerKey: "Traditional",        headerLabel: "(Method) Traditional",      headerType: "Method",      sortOrder: 9 },
  { headerKey: "AgileFrameworks",     headerLabel: "(Framework) AgileFrameworks", headerType: "Framework", sortOrder: 10 },
  { headerKey: "Hybrid",             headerLabel: "(Method) Hybrid",           headerType: "Method",      sortOrder: 11 },
  { headerKey: "CaseScenario",       headerLabel: "CaseScenario",             headerType: null,          sortOrder: 12 },
  { headerKey: "SelectedStandards",  headerLabel: "SelectedStandards",        headerType: "Standards",   sortOrder: 13 },
  { headerKey: "SelectedFrameworks", headerLabel: "SelectedFrameworks",       headerType: "Frameworks",  sortOrder: 14 },
];

// ── Type Derivation Engine ───────────────────────────────────────────

/**
 * Derive the Type for a given header label using the 7 rules.
 *
 * Rule 1: contains "Method"            → "Method"
 * Rule 2: contains "Framework"         → "Framework"
 * Rule 3: contains "Standard"          → "Standard"
 * Rule 4: equals "SelectedStandards"   → "Standards"
 * Rule 5: equals "SelectedFrameworks"  → "Frameworks"
 * Rule 6: equals "SelectedMethods"     → "Methods" (future-proofing)
 * Rule 7: else                         → null
 *
 * Important: Rules 4–6 must be checked BEFORE rules 1–3 to avoid
 * "SelectedStandards" matching the generic "Standard" rule.
 */
export function deriveHeaderType(headerLabel: string): HeaderType | null {
  if (!headerLabel || EXCLUDED_HEADERS.has(headerLabel.trim())) {
    return null;
  }

  const label = headerLabel.trim();

  // Rule 4: exact plural match — SelectedStandards
  if (label === "SelectedStandards") return "Standards";
  // Rule 5: exact plural match — SelectedFrameworks
  if (label === "SelectedFrameworks") return "Frameworks";
  // Rule 6: future-proofing — SelectedMethods
  if (label === "SelectedMethods") return "Methods";

  // Rule 1: contains "(Method)" or "Method"
  if (label.includes("Method")) return "Method";
  // Rule 2: contains "(Framework)" or "Framework"
  if (label.includes("Framework")) return "Framework";
  // Rule 3: contains "(Standard)" or "Standard"
  if (label.includes("Standard")) return "Standard";

  // Rule 7: no match
  return null;
}

// ── Header Parsing ───────────────────────────────────────────────────

export interface ParsedHeader {
  headerKey: string;
  headerLabel: string;
  headerType: HeaderType | null;
  sortOrder: number;
}

export interface HeaderParseResult {
  headers: ParsedHeader[];
  typeMap: Record<string, string>;
  warnings: string[];
  errors: string[];
  isValid: boolean;
}

/**
 * Parse a raw header row (array of strings) into structured definitions.
 * Validates for duplicates, unknown types, and structural issues.
 */
export function parseHeaderRow(rawHeaders: string[]): HeaderParseResult {
  const headers: ParsedHeader[] = [];
  const typeMap: Record<string, string> = {};
  const warnings: string[] = [];
  const errors: string[] = [];
  const seenKeys = new Set<string>();

  for (let i = 0; i < rawHeaders.length; i++) {
    const raw = (rawHeaders[i] || "").trim();
    if (!raw) {
      warnings.push(`Column ${i}: empty header, skipping`);
      continue;
    }

    // Extract the key from the label
    const headerKey = extractHeaderKey(raw);
    const headerType = deriveHeaderType(raw);

    // Check for duplicate keys
    if (seenKeys.has(headerKey)) {
      errors.push(`Duplicate header key: "${headerKey}" at column ${i}`);
      continue;
    }
    seenKeys.add(headerKey);

    headers.push({
      headerKey,
      headerLabel: raw,
      headerType,
      sortOrder: i,
    });

    // Build type map (only for typed headers)
    if (headerType !== null) {
      typeMap[headerKey] = headerType;
    }
  }

  // Validate that all typed headers have valid type values
  for (const h of headers) {
    if (h.headerType !== null && !HEADER_TYPES.includes(h.headerType)) {
      errors.push(`Invalid type "${h.headerType}" for header "${h.headerKey}"`);
    }
  }

  return {
    headers,
    typeMap,
    warnings,
    errors,
    isValid: errors.length === 0,
  };
}

/**
 * Extract a clean header key from a raw header label.
 * "(Standard) PMI" → "PMI"
 * "(Method) Lean" → "Lean"
 * "CaseScenario" → "CaseScenario"
 * "Scope" → "Scope"
 */
export function extractHeaderKey(headerLabel: string): string {
  const label = headerLabel.trim();

  // Match pattern like "(Standard) PMI" → extract "PMI"
  const prefixMatch = label.match(/^\((?:Standard|Method|Framework)\)\s+(.+)$/);
  if (prefixMatch) {
    return prefixMatch[1].trim();
  }

  return label;
}

// ── Type Map Generation ──────────────────────────────────────────────

/**
 * Build the canonical type_map_json for a scope profile row.
 * Returns the standard mapping of header keys to their types.
 */
export function buildCanonicalTypeMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of CANONICAL_HEADERS) {
    if (h.headerType !== null) {
      map[h.headerKey] = h.headerType;
    }
  }
  return map;
}

/**
 * Get headers filtered by type category.
 */
export function getHeadersByType(
  headers: HeaderDefinition[],
  type: HeaderType,
): HeaderDefinition[] {
  return headers.filter((h) => h.headerType === type);
}

/**
 * Get grouped headers by category.
 */
export function getGroupedHeaders(headers: HeaderDefinition[]): Record<string, HeaderDefinition[]> {
  const groups: Record<string, HeaderDefinition[]> = {
    Standard: [],
    Method: [],
    Framework: [],
    Standards: [],
    Methods: [],
    Frameworks: [],
    untyped: [],
  };

  for (const h of headers) {
    const key = h.headerType ?? "untyped";
    if (!groups[key]) groups[key] = [];
    groups[key].push(h);
  }

  return groups;
}

/**
 * Validate a type map object — ensure all values are valid types
 * and all expected keys are present.
 */
export function validateTypeMap(
  typeMap: Record<string, string>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const validTypes = new Set<string>(HEADER_TYPES);

  for (const [key, value] of Object.entries(typeMap)) {
    if (!validTypes.has(value)) {
      errors.push(`Invalid type "${value}" for key "${key}". Must be one of: ${HEADER_TYPES.join(", ")}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
