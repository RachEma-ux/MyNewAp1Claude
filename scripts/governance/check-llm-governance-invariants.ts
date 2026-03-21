import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export interface Violation {
  file: string;
  rule: string;
  message: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");

export const GOVERNED_LLM_FILES = [
  "server/db/llms.ts",
  "server/routers/llm.ts",
  "server/routers/llm-creation.ts",
  "server/llm/authority.ts",
  "server/llm/project-output-registration.ts",
  "server/policies/llm-policy-engine.ts",
];

const CRITICAL_AUDIT_FUNCTIONS: Record<string, string[]> = {
  "server/db/llms.ts": [
    "createLLM",
    "updateLLM",
    "archiveLLM",
    "createLLMVersion",
    "updateLLMVersionCallable",
    "createPromotion",
    "approvePromotion",
    "rejectPromotion",
    "executePromotion",
  ],
  "server/llm/authority.ts": ["onboardLLMVersionToCatalogCandidate"],
  "server/llm/project-output-registration.ts": ["registerProjectOutputAsLLMVersionCandidate"],
};

function extractFunctionBlock(source: string, functionName: string): string | null {
  const exportSignature = "export async function " + functionName;
  const plainSignature = "function " + functionName;
  const exportIndex = source.indexOf(exportSignature);
  const plainIndex = source.indexOf(plainSignature);
  const start = exportIndex >= 0 ? exportIndex : plainIndex;

  if (start < 0) return null;

  const nextExport = source.indexOf("\nexport ", start + 1);
  return source.slice(start, nextExport >= 0 ? nextExport : undefined);
}

export function scanFileContent(file: string, source: string): Violation[] {
  const violations: Violation[] = [];

  if (/\b(actor|createdBy|approvedBy|publishedBy|rejectedBy)\s*:\s*(0|1)\b/.test(source)) {
    violations.push({
      file,
      rule: "hardcoded-principal",
      message: "Hardcoded principal or placeholder actor found on governed LLM path.",
    });
  }

  if (/\bTODO\b/i.test(source) || /\bbypass\b/i.test(source)) {
    violations.push({
      file,
      rule: "todo-or-bypass-marker",
      message: "TODO or bypass marker found in governed LLM path.",
    });
  }

  if (/return\s+\{\s*success\s*:\s*false\b/.test(source)) {
    violations.push({
      file,
      rule: "soft-denial",
      message: "Soft denial found in governed LLM mutation path; throw transport-level errors instead.",
    });
  }

  if (file === "server/db/llms.ts" && /requiredLLMAuditEvent\([\s\S]*?\.catch\(/.test(source)) {
    violations.push({
      file,
      rule: "fire-and-forget-audit",
      message: "Audit call is fire-and-forget in a critical governed LLM path.",
    });
  }

  if (file === "server/llm/authority.ts" && /catalogAuditEvents[\s\S]*?\.catch\(/.test(source)) {
    violations.push({
      file,
      rule: "fire-and-forget-audit",
      message: "Catalog onboarding audit must be blocking and durable.",
    });
  }

  const criticalFunctions = CRITICAL_AUDIT_FUNCTIONS[file] ?? [];
  for (const functionName of criticalFunctions) {
    const block = extractFunctionBlock(source, functionName);
    if (!block) {
      violations.push({
        file,
        rule: "missing-critical-function",
        message: "Critical governed mutation " + functionName + " was not found.",
      });
      continue;
    }

    const expectsCatalogAudit = file === "server/llm/authority.ts";
    const expectsCreationAudit = file === "server/llm/project-output-registration.ts";
    const hasRequiredAudit = expectsCatalogAudit
      ? block.includes("tx.insert(catalogAuditEvents)") && !block.includes(".catch(")
      : expectsCreationAudit
      ? block.includes("createLLMVersionWithExecutor(") && block.includes("tx.insert(llmCreationAuditEvents)")
      : block.includes("requiredLLMAuditEvent(");

    if (!hasRequiredAudit) {
      violations.push({
        file,
        rule: "missing-required-audit",
        message: "Critical governed mutation " + functionName + " is missing blocking audit coverage.",
      });
    }
  }

  if (file === "server/policies/llm-policy-engine.ts" && !source.includes("LLM_POLICY_AUTHORITY")) {
    violations.push({
      file,
      rule: "missing-policy-authority-clarification",
      message: "LLM policy authority constant is missing; the local-vs-OPA boundary is still ambiguous.",
    });
  }

  return violations;
}

export function scanRepo(rootDir: string = ROOT): Violation[] {
  const violations: Violation[] = [];
  for (const relativeFile of GOVERNED_LLM_FILES) {
    const absoluteFile = path.join(rootDir, relativeFile);
    const source = fs.readFileSync(absoluteFile, "utf8");
    violations.push(...scanFileContent(relativeFile, source));
  }
  return violations;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const violations = scanRepo();
  if (violations.length > 0) {
    console.error("LLM governance invariants failed:");
    for (const violation of violations) {
      console.error("- [" + violation.rule + "] " + violation.file + ": " + violation.message);
    }
    process.exit(1);
  }

  console.log("PASS: LLM governance invariants satisfied");
}
