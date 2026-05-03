/**
 * Staging Runtime — Print Missing Env (presence only, never values)
 *
 * Convenience pretty-printer for "what's missing right now".
 * Uses the extended preflight to enumerate every required key and
 * prints whether it is present (yes/no), grouped by category. Never
 * prints values.
 *
 *   pnpm run staging:print-missing-env
 *   pnpm run staging:print-missing-env --json
 */

import { buildReport } from "./preflight";

async function main(): Promise<void> {
  const json = process.argv.includes("--json");
  const report = await buildReport(process.env);

  const groups: { name: string; entries: { key: string; present: boolean }[] }[] = [];

  groups.push({
    name: "Required infra (foundation gate)",
    entries: report.foundation.required.map((c) => ({ key: c.key, present: c.ok })),
  });

  for (const cat of [
    ["App", report.extended.app],
    ["Per-DB DSNs", report.extended.db],
    ["Workers", report.extended.worker],
  ] as const) {
    groups.push({
      name: cat[0],
      entries: cat[1].map((c) => ({
        key: c.key,
        present: !!process.env[c.key] && process.env[c.key]!.length > 0,
      })),
    });
  }

  groups.push({
    name: "Optional connectors (BLOCKED when missing — never silently PASS)",
    entries: report.connectors.flatMap((c) =>
      c.keys.map((k) => ({ key: k, present: !!process.env[k] })),
    ),
  });

  groups.push({
    name: "Browser tooling",
    entries: report.toolingProbes.map((t) => ({ key: t.tool, present: t.available })),
  });

  if (json) {
    process.stdout.write(JSON.stringify({ groups }, null, 2) + "\n");
    process.exit(0);
  }

  for (const g of groups) {
    process.stdout.write(`\n${g.name}:\n`);
    for (const e of g.entries) {
      process.stdout.write(`  ${e.present ? "[yes]" : "[no ]"} ${e.key}\n`);
    }
  }
  process.exit(0);
}

const isMain =
  typeof require !== "undefined" && require.main === module
    ? true
    : import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  void main();
}
