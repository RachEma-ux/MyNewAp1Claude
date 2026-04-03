import * as yaml from "js-yaml";
import { ZodError, z } from "zod";
import { templateDefinitionSchema } from "./shared/schemas";

type TemplateDefinition = z.infer<typeof templateDefinitionSchema>;

function detectFormat(fileName: string, content: string): "json" | "yaml" {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
  if (lower.endsWith(".json")) return "json";

  const trimmed = content.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[") ? "json" : "yaml";
}

function toUserError(prefix: string, error: unknown): Error {
  if (error instanceof ZodError) {
    const detail = error.issues
      .map(issue => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");
    return new Error(`${prefix}: ${detail}`);
  }

  if (error instanceof Error) {
    return new Error(`${prefix}: ${error.message}`);
  }

  return new Error(prefix);
}

export function parseTemplateImportFile(
  fileName: string,
  content: string
): TemplateDefinition[] {
  let raw: unknown;

  try {
    raw =
      detectFormat(fileName, content) === "yaml"
        ? yaml.load(content)
        : JSON.parse(content);
  } catch (error) {
    throw toUserError("Template file could not be parsed", error);
  }

  let candidateTemplates: unknown;

  if (Array.isArray(raw)) {
    candidateTemplates = raw;
  } else if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as any).templates)
  ) {
    candidateTemplates = (raw as any).templates;
  } else {
    throw new Error(
      'Invalid template file. Expected an array or an object with a "templates" array.'
    );
  }

  try {
    return templateDefinitionSchema.array().min(1).parse(candidateTemplates);
  } catch (error) {
    throw toUserError("Template file is invalid", error);
  }
}

export function buildTemplateImportPreview(fileName: string, content: string) {
  const templates = parseTemplateImportFile(fileName, content);
  return templates.map(template => ({
    name: template.name,
    category: template.category,
    templateType: template.templateType,
    variableCount: template.variableSchema?.length ?? 0,
  }));
}
