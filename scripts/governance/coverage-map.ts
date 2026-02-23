/**
 * Governance Coverage Map Generator
 * Scans router files for governedProcedure usage vs protectedProcedure
 * Exit code 1 if coverage drops below threshold
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Coverage threshold must only increase. Decreasing requires architectural review.
const THRESHOLD = 30; // minimum % governed
const SERVER_DIR = path.resolve(__dirname, "../../server");

interface FileReport {
  file: string;
  totalMutations: number;
  governedMutations: number;
  ungoverned: string[];
}

function scanFile(filePath: string): FileReport | null {
  const content = fs.readFileSync(filePath, "utf-8");

  // Only scan files that contain .mutation(
  if (!content.includes(".mutation(")) return null;

  const lines = content.split("\n");
  const report: FileReport = {
    file: path.relative(process.cwd(), filePath),
    totalMutations: 0,
    governedMutations: 0,
    ungoverned: [],
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes(".mutation(")) {
      report.totalMutations++;
      // Look backwards for procedure type
      const context = lines.slice(Math.max(0, i - 15), i + 1).join("\n");
      if (
        context.includes("governedProcedure") ||
        context.includes("governedAdminProcedure")
      ) {
        report.governedMutations++;
      } else {
        // Try to extract mutation name
        const nameMatch = context.match(
          /(\w+):\s*(governed|protected|admin|public)/
        );
        report.ungoverned.push(nameMatch?.[1] || `line ${i + 1}`);
      }
    }
  }

  return report.totalMutations > 0 ? report : null;
}

function walkDir(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (
      entry.isDirectory() &&
      !entry.name.startsWith(".") &&
      entry.name !== "node_modules"
    ) {
      results.push(...walkDir(fullPath, pattern));
    } else if (entry.isFile() && pattern.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

// Main
const files = walkDir(SERVER_DIR, /\.(ts|js)$/);
const reports: FileReport[] = [];

for (const file of files) {
  const report = scanFile(file);
  if (report) reports.push(report);
}

const totalMutations = reports.reduce((s, r) => s + r.totalMutations, 0);
const governedMutations = reports.reduce((s, r) => s + r.governedMutations, 0);
const coverage =
  totalMutations > 0
    ? Math.round((governedMutations / totalMutations) * 100)
    : 0;

console.log("\n=== Governance Coverage Report ===\n");
console.log(`Total mutations: ${totalMutations}`);
console.log(`Governed mutations: ${governedMutations}`);
console.log(`Coverage: ${coverage}%`);
console.log(`Threshold: ${THRESHOLD}%\n`);

for (const report of reports) {
  const pct =
    report.totalMutations > 0
      ? Math.round(
          (report.governedMutations / report.totalMutations) * 100
        )
      : 0;
  const status =
    report.governedMutations === report.totalMutations ? "\u2713" : "\u2717";
  console.log(
    `  ${status} ${report.file}: ${report.governedMutations}/${report.totalMutations} (${pct}%)`
  );
}

if (coverage < THRESHOLD) {
  console.error(
    `\n\u2717 FAIL: Coverage ${coverage}% is below threshold ${THRESHOLD}%`
  );
  process.exit(1);
} else {
  console.log(
    `\n\u2713 PASS: Coverage ${coverage}% meets threshold ${THRESHOLD}%`
  );
}
