/**
 * Module graph — shared helper for boundary-enforcement scripts.
 *
 * Walks `server/` to build a map of:
 *   moduleKey -> { folder, privateFiles, publicFiles, dbConnectionFiles }
 * based on a static MODULE_MAP table.
 *
 * Scripts use this to detect cross-module imports without importing the
 * runtime module registry (which would couple to the platform's TS
 * compilation).
 */

import { readFileSync, statSync, readdirSync } from "fs";
import { join, relative, sep } from "path";

export interface ModuleDescriptor {
  key: string;
  folder: string; // server-relative folder, e.g. "prm" or "code-studio"
  /** Schema files in `drizzle/tables/` that are private to this module. */
  privateSchemas: string[];
  /** Connection accessor function names (e.g. "getPrmDb"). */
  connectionAccessors: string[];
  /** Filename suffixes considered private. */
  privateFileSuffixes?: string[];
  /** Filename suffixes considered public. */
  publicFileNames?: string[];
}

/**
 * The canonical module-to-folder map. Update when a module is added.
 * Keys correspond to manifest keys.
 */
export const MODULE_MAP: ModuleDescriptor[] = [
  {
    key: "prm",
    folder: "prm",
    privateSchemas: ["prmdb"],
    connectionAccessors: ["getPrmDb"],
  },
  {
    key: "psm",
    folder: "psm",
    privateSchemas: ["psmdb"],
    connectionAccessors: ["getPsmDb"],
  },
  {
    key: "codeStudio",
    folder: "code-studio",
    privateSchemas: ["codedb"],
    connectionAccessors: ["getCodeDb"],
  },
  {
    key: "agentStudio",
    folder: "agent-studio",
    privateSchemas: ["agent-studio"],
    connectionAccessors: ["getAsDb"],
  },
  {
    key: "sandboxWf",
    folder: "sandbox-wf",
    privateSchemas: ["wfdb"],
    connectionAccessors: ["getWfDb"],
  },
  {
    key: "rag",
    folder: "rag",
    privateSchemas: ["ragdb"],
    connectionAccessors: ["getRagDb"],
  },
  {
    key: "openRouter",
    folder: "openrouter",
    privateSchemas: [],
    connectionAccessors: [],
  },
  {
    key: "ps",
    folder: "ps",
    privateSchemas: ["ps", "ps-translator"],
    connectionAccessors: [],
  },
  {
    key: "hr",
    folder: "hr",
    privateSchemas: [
      "hr-core",
      "hr-organization",
      "hr-staffing",
      "hr-talent",
      "hr-engagement",
      "hr-performance",
      "hr-analytics",
      "hr-compensation",
      "hr-compliance",
      "hr-recruiting",
      "hr-relations",
      "hr-time",
      "hr-learning",
      "hr-lifecycle",
      "hr-role-definitions",
    ],
    connectionAccessors: [],
  },
  {
    key: "organizationManagement",
    folder: "organization-management",
    privateSchemas: ["organization-management"],
    connectionAccessors: [],
  },
  {
    key: "cultureValues",
    folder: "culture-values",
    privateSchemas: ["culture-values"],
    connectionAccessors: [],
  },
  {
    key: "kgraAgent",
    folder: "kgra-agent",
    privateSchemas: [],
    connectionAccessors: [],
  },
  {
    key: "communication",
    folder: "communication",
    privateSchemas: ["communicationdb"],
    connectionAccessors: ["getCommunicationDb"],
  },
  {
    key: "pmCentral",
    folder: "pm-central",
    privateSchemas: ["pmdb"],
    connectionAccessors: ["getPmDb"],
  },
  {
    key: "dataAnalysis",
    folder: "data-analysis",
    // Phase-1 staged ownership: graphrag tables physically live in the
    // shared platform DB but are declared Data Analysis-owned via the
    // manifest. The dedicated `dataanalysisdb` connector is in
    // server/data-analysis/connection.ts (`getDataAnalysisDb`).
    privateSchemas: ["graphrag"],
    connectionAccessors: ["getDataAnalysisDb"],
  },
];

/** Files that — regardless of their location — are public per-module. */
export const PUBLIC_FILE_NAMES = new Set([
  "public-api.ts",
  "contracts.ts",
  "ports.ts",
  "events.ts",
  "handoffs.ts",
  "types.ts",
  "manifest.ts",
]);

/** Files that — regardless of their location — are private per-module. */
export const PRIVATE_FILE_SUFFIXES = [
  ".repository.ts",
  ".connection.ts",
  ".service.ts",
  ".seed.ts",
  ".executor.ts",
];
export const PRIVATE_FILE_NAMES = new Set([
  "connection.ts",
  "seed.ts",
  "boot.ts",
  "executor.ts",
  "repository.ts",
  "service.ts",
  "schema.ts",
  "ide-proxy.ts",
]);

export function listSourceFiles(root: string): string[] {
  const out: string[] = [];
  function walk(dir: string) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === "node_modules" || entry === ".git" || entry === "dist" || entry === "build") {
        continue;
      }
      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full);
      } else if (
        st.isFile() &&
        (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
        !entry.endsWith(".d.ts")
      ) {
        out.push(full);
      }
    }
  }
  walk(root);
  return out;
}

export function readFile(path: string): string {
  return readFileSync(path, "utf8");
}

export function moduleOfPath(filepath: string, repoRoot: string): ModuleDescriptor | null {
  const rel = relative(repoRoot, filepath).split(sep).join("/");
  const m = rel.match(/^server\/([^/]+)\//);
  if (!m) return null;
  const folder = m[1];
  return MODULE_MAP.find((d) => d.folder === folder) ?? null;
}

export function isInsideModule(filepath: string, descriptor: ModuleDescriptor, repoRoot: string): boolean {
  const rel = relative(repoRoot, filepath).split(sep).join("/");
  return rel.startsWith(`server/${descriptor.folder}/`);
}

export function isInsideCoordinator(filepath: string, repoRoot: string): boolean {
  const rel = relative(repoRoot, filepath).split(sep).join("/");
  return (
    rel.startsWith("server/orchestrator/") ||
    rel.startsWith("server/platform/coordinator/")
  );
}

/** Files allowed to do almost anything: the platform bootstrap and the
 *  routers barrel, plus the manifests barrel. */
export function isPlatformBootstrap(filepath: string, repoRoot: string): boolean {
  const rel = relative(repoRoot, filepath).split(sep).join("/");
  return (
    rel === "server/_core/index.ts" ||
    rel === "server/routers.ts" ||
    rel === "server/platform/modules/manifests.ts" ||
    rel === "server/platform/modules/module-routers.ts"
  );
}

export interface Violation {
  rule: string;
  file: string;
  line: number;
  message: string;
  severity: "error" | "warning" | "info";
}

export function isAllowedPublicImport(specifier: string): boolean {
  // Allowed cross-module entry points
  return /\/(public-api|contracts|ports|events|handoffs|types|manifest)(\.ts)?$/.test(specifier);
}

export const REPO_ROOT = process.cwd();
