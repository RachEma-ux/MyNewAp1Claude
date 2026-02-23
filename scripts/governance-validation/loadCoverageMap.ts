/**
 * Coverage Map Loader
 *
 * Reads the coverage map artifact OR generates one by scanning source.
 * Each entry represents a mutation entrypoint with governance classification.
 */

import * as fs from "fs";
import * as path from "path";

export interface CoverageEntry {
  file: string;
  line: number;
  procedureName: string;
  procedureType: "governedProcedure" | "governedAdminProcedure" | "protectedProcedure" | "adminProcedure" | "publicProcedure" | "unknown";
  isMutation: boolean;
  requiresGovernance: boolean;
}

/**
 * Load coverage map from artifact file or generate from source scan.
 */
export function loadCoverageMap(rootDir: string): CoverageEntry[] {
  // Try loading pre-generated artifact
  const artifactPath = path.join(rootDir, "artifacts/governance/reports/coverage/coverage-map.json");
  if (fs.existsSync(artifactPath)) {
    const raw = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
    if (Array.isArray(raw.entries)) return raw.entries;
  }

  // Generate from source scan
  return scanMutations(rootDir);
}

/**
 * Scan all server/*.ts for .mutation( calls and classify procedure type.
 */
export function scanMutations(rootDir: string): CoverageEntry[] {
  const serverDir = path.join(rootDir, "server");
  const entries: CoverageEntry[] = [];

  const files = walkDir(serverDir, /\.ts$/);
  for (const filePath of files) {
    if (filePath.includes(".test.") || filePath.includes(".spec.") || filePath.includes("node_modules")) continue;

    const content = fs.readFileSync(filePath, "utf-8");
    if (!content.includes(".mutation(")) continue;

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes(".mutation(")) continue;

      // Look backwards (up to 15 lines) for procedure type — matches coverage-map.ts
      const context = lines.slice(Math.max(0, i - 15), i + 1).join("\n");
      let procedureType: CoverageEntry["procedureType"] = "unknown";

      if (context.includes("governedAdminProcedure")) procedureType = "governedAdminProcedure";
      else if (context.includes("governedProcedure")) procedureType = "governedProcedure";
      else if (context.includes("adminProcedure")) procedureType = "adminProcedure";
      else if (context.includes("protectedProcedure")) procedureType = "protectedProcedure";
      else if (context.includes("publicProcedure")) procedureType = "publicProcedure";

      // Try to extract procedure name
      const nameMatch = context.match(/(\w+):\s*(governed|protected|admin|public)/);
      const relPath = path.relative(rootDir, filePath);

      entries.push({
        file: relPath,
        line: i + 1,
        procedureName: nameMatch?.[1] || `mutation_L${i + 1}`,
        procedureType,
        isMutation: true,
        requiresGovernance: procedureType === "governedProcedure" || procedureType === "governedAdminProcedure",
      });
    }
  }

  return entries;
}

function walkDir(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
      results.push(...walkDir(fullPath, pattern));
    } else if (entry.isFile() && pattern.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}
