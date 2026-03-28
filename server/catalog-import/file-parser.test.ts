/**
 * File Parser — Unit Tests
 *
 * Tests CSV, JSON, YAML parsing, normalization, validation, and error handling.
 * Covers: valid imports, missing required fields, invalid enum/type, duplicate keys
 * in file, alias normalization, unsupported field handling, preview response
 * consistency across formats.
 *
 * Does NOT require a database — pure unit tests.
 */
import { describe, it, expect } from "vitest";
import { parseFileContent, detectFormat, buildFileImportPreview } from "./file-parser";

// ============================================================================
// Format Detection
// ============================================================================

describe("detectFormat", () => {
  it("detects JSON from extension", () => {
    expect(detectFormat("catalog.json", "")).toBe("json");
  });

  it("detects YAML from .yaml extension", () => {
    expect(detectFormat("catalog.yaml", "")).toBe("yaml");
  });

  it("detects YAML from .yml extension", () => {
    expect(detectFormat("catalog.yml", "")).toBe("yaml");
  });

  it("detects CSV from extension", () => {
    expect(detectFormat("catalog.csv", "")).toBe("csv");
  });

  it("detects JSON from content when extension is ambiguous", () => {
    expect(detectFormat("data.txt", '[{"name":"test"}]')).toBe("json");
  });

  it("detects YAML from content when extension is ambiguous", () => {
    expect(detectFormat("data.txt", "---\n- name: test")).toBe("yaml");
  });
});

// ============================================================================
// JSON Parsing
// ============================================================================

describe("parseFileContent — JSON", () => {
  it("parses a valid JSON array", () => {
    const content = JSON.stringify([
      { name: "test-provider", entryType: "provider", description: "A test provider" },
      { name: "test-model", entryType: "model" },
    ]);
    const result = parseFileContent(content, "catalog.json");

    expect(result.format).toBe("json");
    expect(result.parseErrors).toHaveLength(0);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].name).toBe("test-provider");
    expect(result.entries[0].type).toBe("provider");
    expect(result.entries[0].description).toBe("A test provider");
    expect(result.entries[0].source).toBe("file_import");
    expect(result.entries[1].name).toBe("test-model");
    expect(result.entries[1].type).toBe("model");
  });

  it("parses { entries: [...] } wrapper format", () => {
    const content = JSON.stringify({
      entries: [
        { name: "wrapped-entry", entryType: "llm" },
      ],
    });
    const result = parseFileContent(content, "catalog.json");

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].name).toBe("wrapped-entry");
    expect(result.entries[0].type).toBe("llm");
  });

  it("parses { data: [...] } wrapper format", () => {
    const content = JSON.stringify({
      data: [{ name: "data-entry", entryType: "bot" }],
    });
    const result = parseFileContent(content, "catalog.json");

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].type).toBe("bot");
  });

  it("fails on invalid JSON", () => {
    const result = parseFileContent("{invalid json", "catalog.json");
    expect(result.entries).toHaveLength(0);
    expect(result.parseErrors.length).toBeGreaterThan(0);
    expect(result.parseErrors[0]).toContain("Invalid JSON");
  });

  it("fails on non-array JSON", () => {
    const result = parseFileContent('{"name":"single object"}', "catalog.json");
    expect(result.entries).toHaveLength(0);
    expect(result.parseErrors[0]).toContain("array");
  });

  it("fails on empty array", () => {
    const result = parseFileContent("[]", "catalog.json");
    expect(result.entries).toHaveLength(0);
    expect(result.parseErrors[0]).toContain("no entries");
  });
});

// ============================================================================
// YAML Parsing
// ============================================================================

describe("parseFileContent — YAML", () => {
  it("parses a valid YAML array", () => {
    const content = `
- name: yaml-provider
  entryType: provider
  description: A YAML provider
- name: yaml-model
  entryType: model
`;
    const result = parseFileContent(content, "catalog.yaml");

    expect(result.format).toBe("yaml");
    expect(result.parseErrors).toHaveLength(0);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].name).toBe("yaml-provider");
    expect(result.entries[0].type).toBe("provider");
    expect(result.entries[1].name).toBe("yaml-model");
  });

  it("parses YAML with entries wrapper", () => {
    const content = `
entries:
  - name: wrapped
    entryType: llm
`;
    const result = parseFileContent(content, "catalog.yml");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].name).toBe("wrapped");
  });

  it("fails on invalid YAML", () => {
    const result = parseFileContent(":\n  invalid:\n- yaml::", "catalog.yaml");
    expect(result.entries).toHaveLength(0);
    expect(result.parseErrors.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// CSV Parsing
// ============================================================================

describe("parseFileContent — CSV", () => {
  it("parses a valid CSV with headers", () => {
    const content = `name,entryType,description
csv-provider,provider,A CSV provider
csv-model,model,A CSV model`;
    const result = parseFileContent(content, "catalog.csv");

    expect(result.format).toBe("csv");
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].name).toBe("csv-provider");
    expect(result.entries[0].type).toBe("provider");
    expect(result.entries[0].description).toBe("A CSV provider");
    expect(result.entries[1].name).toBe("csv-model");
  });

  it("handles field aliases (type → entryType)", () => {
    const content = `name,type,desc
alias-test,model,Test description`;
    const result = parseFileContent(content, "catalog.csv");

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].type).toBe("model");
    expect(result.entries[0].description).toBe("Test description");
  });

  it("handles CSV with pipe-separated tags", () => {
    const content = `name,entryType,tags
tagged-entry,provider,cloud|premium|fast`;
    const result = parseFileContent(content, "catalog.csv");

    expect(result.entries).toHaveLength(1);
    const meta = result.entries[0].metadata as Record<string, unknown>;
    expect(meta.tags).toEqual(["cloud", "premium", "fast"]);
  });

  it("handles CSV with pipe-separated capabilities", () => {
    const content = `name,entryType,capabilities
cap-entry,model,chat|vision|embedding`;
    const result = parseFileContent(content, "catalog.csv");

    expect(result.entries).toHaveLength(1);
    const meta = result.entries[0].metadata as Record<string, unknown>;
    expect(meta.capabilities).toEqual(["chat", "vision", "embedding"]);
  });

  it("handles CSV with comma-separated tags in quotes as fallback", () => {
    const content = `name,entryType,tags
tagged-entry,provider,"cloud,premium,fast"`;
    const result = parseFileContent(content, "catalog.csv");

    expect(result.entries).toHaveLength(1);
    const meta = result.entries[0].metadata as Record<string, unknown>;
    expect(meta.tags).toEqual(["cloud", "premium", "fast"]);
  });
});

// ============================================================================
// Validation
// ============================================================================

describe("parseFileContent — Validation", () => {
  it("flags missing name as error", () => {
    const content = JSON.stringify([{ entryType: "model" }]);
    const result = parseFileContent(content, "data.json");

    expect(result.entries).toHaveLength(1);
    const issues = result.entries[0].validationIssues;
    expect(issues.some((i) => i.field === "name" && i.severity === "error")).toBe(true);
    expect(result.entries[0].riskLevel).toBe("high");
  });

  it("flags invalid entryType as error", () => {
    const content = JSON.stringify([{ name: "test", entryType: "invalid_type" }]);
    const result = parseFileContent(content, "data.json");

    expect(result.entries).toHaveLength(1);
    const issues = result.entries[0].validationIssues;
    expect(issues.some((i) => i.field === "entryType" && i.severity === "error")).toBe(true);
  });

  it("accepts agent entryType without error", () => {
    const content = JSON.stringify([{ name: "my-agent", entryType: "agent" }]);
    const result = parseFileContent(content, "data.json");

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].type).toBe("agent");
    expect(result.entries[0].validationIssues).toHaveLength(0);
    expect(result.entries[0].riskLevel).toBe("low");
  });

  it("defaults entryType to model when missing but flags error", () => {
    const content = JSON.stringify([{ name: "no-type" }]);
    const result = parseFileContent(content, "data.json");

    expect(result.entries[0].type).toBe("model");
    // Missing entryType should be flagged as validation error
    const issues = result.entries[0].validationIssues;
    expect(issues.some((i) => i.field === "entryType" && i.severity === "error")).toBe(true);
  });

  it("flags name exceeding 255 chars as error", () => {
    const content = JSON.stringify([{ name: "x".repeat(300), entryType: "model" }]);
    const result = parseFileContent(content, "data.json");

    const issues = result.entries[0].validationIssues;
    expect(issues.some((i) => i.field === "name" && i.severity === "error")).toBe(true);
  });

  it("validates clean entries with no issues", () => {
    const content = JSON.stringify([
      { name: "clean-entry", entryType: "provider", description: "All good" },
    ]);
    const result = parseFileContent(content, "data.json");

    expect(result.entries[0].validationIssues).toHaveLength(0);
    expect(result.entries[0].riskLevel).toBe("low");
  });
});

// ============================================================================
// File Size
// ============================================================================

describe("parseFileContent — Size Limits", () => {
  it("rejects files larger than 2MB", () => {
    const content = "x".repeat(3 * 1024 * 1024);
    const result = parseFileContent(content, "huge.json");

    expect(result.entries).toHaveLength(0);
    expect(result.parseErrors[0]).toContain("too large");
  });
});

// ============================================================================
// Metadata Enrichment
// ============================================================================

describe("parseFileContent — Metadata", () => {
  it("carries displayName, category, tags into metadata", () => {
    const content = JSON.stringify([
      {
        name: "enriched",
        displayName: "Enriched Entry",
        entryType: "model",
        category: "base_llm",
        tags: ["fast", "premium"],
        capabilities: ["streaming", "embedding"],
      },
    ]);
    const result = parseFileContent(content, "data.json");

    const meta = result.entries[0].metadata as Record<string, unknown>;
    expect(meta.displayName).toBe("Enriched Entry");
    expect(meta.category).toBe("base_llm");
    expect(meta.tags).toEqual(["fast", "premium"]);
    expect(meta.capabilities).toEqual(["streaming", "embedding"]);
  });

  it("parses config as nested JSON object", () => {
    const content = JSON.stringify([
      {
        name: "with-config",
        entryType: "provider",
        config: { baseUrl: "https://api.example.com", type: "cloud" },
      },
    ]);
    const result = parseFileContent(content, "data.json");

    const meta = result.entries[0].metadata as Record<string, unknown>;
    expect(meta.baseUrl).toBe("https://api.example.com");
    expect(meta.type).toBe("cloud");
  });
});

// ============================================================================
// Alias Normalization
// ============================================================================

describe("parseFileContent — Alias Normalization", () => {
  it("maps 'key' alias to 'name'", () => {
    const content = JSON.stringify([{ key: "my-slug", entryType: "provider" }]);
    const result = parseFileContent(content, "data.json");

    expect(result.entries[0].name).toBe("my-slug");
    // Should have an alias-used warning
    const aliasIssue = result.entries[0].validationIssues.find(
      (i) => i.code === "ALIAS_USED" && i.field === "name",
    );
    expect(aliasIssue).toBeDefined();
  });

  it("maps 'slug' alias to 'name'", () => {
    const content = JSON.stringify([{ slug: "my-slug", entryType: "model" }]);
    const result = parseFileContent(content, "data.json");

    expect(result.entries[0].name).toBe("my-slug");
  });

  it("maps 'label' alias to 'displayName'", () => {
    const content = JSON.stringify([{ name: "test", entryType: "model", label: "Test Label" }]);
    const result = parseFileContent(content, "data.json");

    const meta = result.entries[0].metadata as Record<string, unknown>;
    expect(meta.displayName).toBe("Test Label");
  });

  it("maps 'title' alias to 'displayName'", () => {
    const content = JSON.stringify([{ name: "test", entryType: "model", title: "Test Title" }]);
    const result = parseFileContent(content, "data.json");

    const meta = result.entries[0].metadata as Record<string, unknown>;
    expect(meta.displayName).toBe("Test Title");
  });

  it("maps 'kind' alias to 'entryType'", () => {
    const content = JSON.stringify([{ name: "test", kind: "provider" }]);
    const result = parseFileContent(content, "data.json");

    expect(result.entries[0].type).toBe("provider");
  });

  it("maps 'entry_type' alias to 'entryType' in CSV", () => {
    const content = `name,entry_type
alias-csv,llm`;
    const result = parseFileContent(content, "data.csv");

    expect(result.entries[0].type).toBe("llm");
  });
});

// ============================================================================
// Unsupported Field Handling
// ============================================================================

describe("parseFileContent — Unsupported Fields", () => {
  it("warns about unsupported fields", () => {
    const content = JSON.stringify([
      { name: "test", entryType: "model", unknownField: "some value", anotherExtra: 42 },
    ]);
    const result = parseFileContent(content, "data.json");

    const unsupportedIssues = result.entries[0].validationIssues.filter(
      (i) => i.code === "UNSUPPORTED_FIELD",
    );
    expect(unsupportedIssues.length).toBe(2);
    expect(unsupportedIssues.map((i) => i.field).sort()).toEqual(["anotherExtra", "unknownField"]);
  });

  it("does not reject entries with unsupported fields", () => {
    const content = JSON.stringify([
      { name: "valid-entry", entryType: "provider", extraField: "ignored" },
    ]);
    const result = parseFileContent(content, "data.json");

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].name).toBe("valid-entry");
    // Entry should be valid (only warnings, no errors)
    expect(result.entries[0].validationIssues.every((i) => i.severity === "warning")).toBe(true);
  });
});

// ============================================================================
// Duplicate Keys Within File
// ============================================================================

describe("parseFileContent — Within-File Duplicates", () => {
  it("detects duplicate names within the uploaded file", () => {
    const content = JSON.stringify([
      { name: "duplicate-name", entryType: "model" },
      { name: "unique-name", entryType: "provider" },
      { name: "duplicate-name", entryType: "llm" },
    ]);
    const result = parseFileContent(content, "data.json");

    expect(result.entries).toHaveLength(3);
    // The second occurrence should have a DUPLICATE_KEY_IN_FILE issue
    const dupIssues = result.allIssues.filter((i) => i.code === "DUPLICATE_KEY_IN_FILE");
    expect(dupIssues.length).toBe(1);
    expect(dupIssues[0].rowIndex).toBe(2);
    expect(dupIssues[0].entryKey).toBe("duplicate-name");
  });

  it("duplicate detection is case-insensitive", () => {
    const content = JSON.stringify([
      { name: "My-Model", entryType: "model" },
      { name: "my-model", entryType: "model" },
    ]);
    const result = parseFileContent(content, "data.json");

    const dupIssues = result.allIssues.filter((i) => i.code === "DUPLICATE_KEY_IN_FILE");
    expect(dupIssues.length).toBe(1);
  });
});

// ============================================================================
// Validation Issue Codes
// ============================================================================

describe("parseFileContent — Issue Codes", () => {
  it("assigns REQUIRED_FIELD_MISSING code for missing name", () => {
    const content = JSON.stringify([{ entryType: "model" }]);
    const result = parseFileContent(content, "data.json");

    const issue = result.entries[0].validationIssues.find(
      (i) => i.field === "name" && i.code === "REQUIRED_FIELD_MISSING",
    );
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
    expect(issue?.rowIndex).toBe(0);
  });

  it("assigns REQUIRED_FIELD_MISSING code for missing entryType", () => {
    const content = JSON.stringify([{ name: "test" }]);
    const result = parseFileContent(content, "data.json");

    const issue = result.entries[0].validationIssues.find(
      (i) => i.field === "entryType" && i.code === "REQUIRED_FIELD_MISSING",
    );
    expect(issue).toBeDefined();
  });

  it("assigns INVALID_ENUM code for bad entryType", () => {
    const content = JSON.stringify([{ name: "test", entryType: "widget" }]);
    const result = parseFileContent(content, "data.json");

    const issue = result.entries[0].validationIssues.find(
      (i) => i.field === "entryType" && i.code === "INVALID_ENUM",
    );
    expect(issue).toBeDefined();
  });

  it("accepts agent entryType with no validation error code", () => {
    const content = JSON.stringify([{ name: "my-agent", entryType: "agent" }]);
    const result = parseFileContent(content, "data.json");

    expect(result.entries[0].type).toBe("agent");
    expect(result.entries[0].validationIssues).toHaveLength(0);
  });

  it("assigns MAX_LENGTH_EXCEEDED code for long name", () => {
    const content = JSON.stringify([{ name: "x".repeat(300), entryType: "model" }]);
    const result = parseFileContent(content, "data.json");

    const issue = result.entries[0].validationIssues.find(
      (i) => i.code === "MAX_LENGTH_EXCEEDED" && i.field === "name",
    );
    expect(issue).toBeDefined();
  });
});

// ============================================================================
// Preview Response Consistency Across Formats
// ============================================================================

describe("buildFileImportPreview — Cross-Format Consistency", () => {
  const jsonInput = JSON.stringify([
    { name: "cross-format", entryType: "provider", description: "Test" },
    { name: "invalid-entry" }, // missing entryType
  ]);

  const yamlInput = `
- name: cross-format
  entryType: provider
  description: Test
- name: invalid-entry
`;

  const csvInput = `name,entryType,description
cross-format,provider,Test
invalid-entry,,`;

  it("produces consistent preview shape for JSON", () => {
    const result = parseFileContent(jsonInput, "test.json");
    const preview = buildFileImportPreview(result, result.entries);

    expect(preview.fileType).toBe("json");
    expect(preview.totalRecords).toBe(2);
    expect(preview.validRecords).toBe(1);
    expect(preview.invalidRecords).toBe(1);
    expect(preview.entries).toHaveLength(2);
    expect(Array.isArray(preview.issues)).toBe(true);
    expect(Array.isArray(preview.globalIssues)).toBe(true);
  });

  it("produces consistent preview shape for YAML", () => {
    const result = parseFileContent(yamlInput, "test.yaml");
    const preview = buildFileImportPreview(result, result.entries);

    expect(preview.fileType).toBe("yaml");
    expect(preview.totalRecords).toBe(2);
    expect(preview.validRecords).toBe(1);
    expect(preview.invalidRecords).toBe(1);
  });

  it("produces consistent preview shape for CSV", () => {
    const result = parseFileContent(csvInput, "test.csv");
    const preview = buildFileImportPreview(result, result.entries);

    expect(preview.fileType).toBe("csv");
    expect(preview.totalRecords).toBe(2);
    expect(preview.validRecords).toBe(1);
    expect(preview.invalidRecords).toBe(1);
  });

  it("all three formats produce the same valid/invalid counts for equivalent data", () => {
    const jsonResult = parseFileContent(jsonInput, "test.json");
    const yamlResult = parseFileContent(yamlInput, "test.yaml");
    const csvResult = parseFileContent(csvInput, "test.csv");

    const jsonPreview = buildFileImportPreview(jsonResult, jsonResult.entries);
    const yamlPreview = buildFileImportPreview(yamlResult, yamlResult.entries);
    const csvPreview = buildFileImportPreview(csvResult, csvResult.entries);

    expect(jsonPreview.validRecords).toBe(yamlPreview.validRecords);
    expect(jsonPreview.validRecords).toBe(csvPreview.validRecords);
    expect(jsonPreview.invalidRecords).toBe(yamlPreview.invalidRecords);
    expect(jsonPreview.invalidRecords).toBe(csvPreview.invalidRecords);
  });
});

// ============================================================================
// Global Issues & ParseResult Shape
// ============================================================================

describe("parseFileContent — ParseResult Shape", () => {
  it("returns allIssues and globalIssues fields", () => {
    const content = JSON.stringify([{ name: "test", entryType: "model" }]);
    const result = parseFileContent(content, "data.json");

    expect(result).toHaveProperty("allIssues");
    expect(result).toHaveProperty("globalIssues");
    expect(Array.isArray(result.allIssues)).toBe(true);
    expect(Array.isArray(result.globalIssues)).toBe(true);
  });

  it("includes parse errors in globalIssues for oversized files", () => {
    const content = "x".repeat(3 * 1024 * 1024);
    const result = parseFileContent(content, "huge.json");

    expect(result.globalIssues.length).toBeGreaterThan(0);
    expect(result.globalIssues[0]).toContain("size limit");
  });
});

// ============================================================================
// Agent Entry Import (project-context-translator style)
// ============================================================================

describe("parseFileContent — Agent Entry Import", () => {
  it("parses a JSON agent entry with nested runtime config", () => {
    const content = JSON.stringify([
      {
        name: "ps.agent.context_translator",
        displayName: "Project Context Translator",
        entryType: "agent",
        description: "Transforms unstructured input into PS Ideation fields.",
        category: "specialist",
        subCategory: "ideation",
        tags: ["ps", "ideation", "context-translator"],
        capabilities: ["translate", "ideation"],
        scope: "app",
        config: {
          version: "1.0.0",
          agentType: "context_translator",
          runtime: {
            kind: "service",
            serviceKind: "python",
            serviceName: "project-context-translator",
            serviceUrlEnv: "PROJECT_CONTEXT_TRANSLATOR_URL",
            serviceUrlDefault: "http://localhost:8585",
            healthEndpoint: "/health",
            statusEndpoint: "/status",
            translateEndpoint: "/translate",
            capabilityTags: ["ps-ideation", "wizard-handoff"],
            bounded: true,
          },
        },
      },
    ]);
    const result = parseFileContent(content, "pct.json");

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].type).toBe("agent");
    expect(result.entries[0].name).toBe("ps.agent.context_translator");
    expect(result.entries[0].validationIssues).toHaveLength(0);
    expect(result.entries[0].riskLevel).toBe("low");

    const meta = result.entries[0].metadata as Record<string, unknown>;
    expect(meta.tags).toEqual(["ps", "ideation", "context-translator"]);
    expect(meta.capabilities).toEqual(["translate", "ideation"]);
    // Nested runtime config preserved
    const runtime = (meta as any).runtime;
    expect(runtime).toBeDefined();
    expect(runtime.kind).toBe("service");
    expect(runtime.serviceKind).toBe("python");
    expect(runtime.healthEndpoint).toBe("/health");
    expect(runtime.translateEndpoint).toBe("/translate");
    expect(runtime.bounded).toBe(true);
  });

  it("parses a YAML agent entry with nested runtime config", () => {
    const content = `
- name: ps.agent.context_translator
  displayName: Project Context Translator
  entryType: agent
  description: Transforms unstructured input into PS Ideation fields.
  category: specialist
  subCategory: ideation
  tags:
    - ps
    - ideation
    - context-translator
  capabilities:
    - translate
    - ideation
  scope: app
  config:
    version: "1.0.0"
    agentType: context_translator
    runtime:
      kind: service
      serviceKind: python
      serviceName: project-context-translator
      serviceUrlEnv: PROJECT_CONTEXT_TRANSLATOR_URL
      serviceUrlDefault: "http://localhost:8585"
      healthEndpoint: /health
      translateEndpoint: /translate
      bounded: true
`;
    const result = parseFileContent(content, "pct.yaml");

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].type).toBe("agent");
    expect(result.entries[0].validationIssues).toHaveLength(0);

    const meta = result.entries[0].metadata as Record<string, unknown>;
    const runtime = (meta as any).runtime;
    expect(runtime).toBeDefined();
    expect(runtime.kind).toBe("service");
    expect(runtime.serviceKind).toBe("python");
  });

  it("builds a valid preview for agent entries", () => {
    const content = JSON.stringify([
      { name: "agent-a", entryType: "agent", config: { port: 8585 } },
      { name: "agent-b", entryType: "agent", config: { port: 9090 } },
    ]);
    const result = parseFileContent(content, "agents.json");
    const preview = buildFileImportPreview(result, result.entries);

    expect(preview.totalRecords).toBe(2);
    expect(preview.validRecords).toBe(2);
    expect(preview.invalidRecords).toBe(0);
  });
});
