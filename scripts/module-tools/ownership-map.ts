/**
 * Ownership-map renderer.
 *
 * Produces the markdown view of the route inventory used by
 * `docs/architecture/frontend/ROUTE_OWNERSHIP_MAP.md`. Pure rendering
 * logic — the data is built by `route-inventory.ts`.
 */

import {
  buildRouteInventory,
  type RouteInventory,
  type RouteRow,
  type RouteStatus,
} from "./route-inventory";
import { isMigrated, RTLM_LIST, type RtlmKey } from "./migration-state";

const STATUS_BADGE: Record<RouteStatus, string> = {
  canonical: "✅ canonical",
  "compatibility-redirect": "↪️ compatibility-redirect",
  deprecated: "🚫 deprecated",
  "platform-core": "🏛 platform-core",
  orphan: "⚠️ orphan",
  unknown: "❓ unknown",
};

export interface RenderOptions {
  generatedAt?: Date;
}

/**
 * Render the full Route Ownership Map markdown document.
 */
export function renderOwnershipMap(
  inv: RouteInventory,
  opts: RenderOptions = {},
): string {
  const ts = (opts.generatedAt ?? new Date()).toISOString();
  const lines: string[] = [];

  lines.push("# Route Ownership Map");
  lines.push("");
  lines.push(`Generated: ${ts}`);
  lines.push("");
  lines.push(
    "Authoritative view of every URL the app exposes and which surface",
  );
  lines.push("owns it. Regenerate with `tsx scripts/generate-route-ownership-map.ts`.");
  lines.push("");

  /* ----- summary ----- */
  const counts = countByStatus(inv.rows);
  lines.push("## Summary");
  lines.push("");
  lines.push("| Status | Count |");
  lines.push("|---|---|");
  for (const [status, n] of counts) {
    lines.push(`| ${STATUS_BADGE[status]} | ${n} |`);
  }
  lines.push(`| **Total** | **${inv.rows.length}** |`);
  lines.push("");

  /* ----- per-RTLM tile ----- */
  lines.push("## Per-RTLM");
  lines.push("");
  lines.push("| RTLM | Migration | Declared paths | Manifest baseRoute |");
  lines.push("|---|---|---|---|");
  for (const k of RTLM_LIST) {
    const m = inv.manifests.find((mm) => mm.folder === folderFor(k));
    const declared = inv.perModulePathCount.get(k as RtlmKey) ?? 0;
    const status = isMigrated(k) ? "✅ migrated" : "⏳ pending";
    const base = m?.baseRoute ?? "—";
    lines.push(`| ${k} | ${status} | ${declared} | \`${base}\` |`);
  }
  lines.push("");

  /* ----- the route table ----- */
  lines.push("## Routes");
  lines.push("");
  lines.push("| Route | Owner | Source | Target | Status | Notes |");
  lines.push("|---|---|---|---|---|---|");
  for (const r of inv.rows) {
    lines.push(formatRouteRow(r));
  }
  lines.push("");

  /* ----- duplicate / orphan / unknown sections ----- */
  appendIssueSection(lines, "Orphan routes (nav-only)", inv.rows, "orphan");
  appendIssueSection(lines, "Deprecated routes", inv.rows, "deprecated");
  appendIssueSection(lines, "Unknown routes", inv.rows, "unknown");

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(
    "_This file is generated. Edits should be made to manifest sources or `App.tsx`, then the generator re-run._",
  );
  lines.push("");

  return lines.join("\n");
}

/**
 * Render the broader baseline document — covers everything in the
 * map plus cross-module API call findings, MainLayout imports,
 * unmigrated capsule status, etc.
 */
export function renderBaselineDoc(
  inv: RouteInventory,
  baseline: BaselineFindings,
  opts: RenderOptions = {},
): string {
  const ts = (opts.generatedAt ?? new Date()).toISOString();
  const lines: string[] = [];

  lines.push("# Module Client Capsule — Baseline");
  lines.push("");
  lines.push(`Generated: ${ts}`);
  lines.push("");
  lines.push(
    "Snapshot of the frontend modularity surface at the start of the migration. Each subsequent migration PR should drive these counts down.",
  );
  lines.push("");

  /* App.tsx hardcoded routes */
  lines.push("## App.tsx hardcoded routes");
  lines.push("");
  lines.push(`Total \`<Route>\` declarations in App.tsx: **${inv.appRoutes.length}**`);
  lines.push("");
  lines.push(`Compatibility redirects in App.tsx: **${inv.appRedirects.size}**`);
  lines.push("");

  /* Module manifest routes */
  lines.push("## Module manifest routes");
  lines.push("");
  lines.push("| Module | manifest.routes | routeInventory | nav.ts hrefs | warnings |");
  lines.push("|---|---|---|---|---|");
  for (const m of inv.manifests) {
    lines.push(
      `| ${m.folder} | ${m.routes.length} | ${m.routeInventory.length} | ${m.navHrefs.length} | ${m.warnings.length} |`,
    );
  }
  lines.push("");

  /* Duplicate paths */
  lines.push("## Duplicate paths");
  lines.push("");
  if (baseline.duplicatePaths.length === 0) {
    lines.push("_None._");
  } else {
    lines.push("| Path | Sources |");
    lines.push("|---|---|");
    for (const d of baseline.duplicatePaths) {
      lines.push(`| \`${d.path}\` | ${d.sources.join(", ")} |`);
    }
  }
  lines.push("");

  /* Orphan / unknown */
  lines.push("## Orphan / unknown routes");
  lines.push("");
  const orphans = inv.rows.filter((r) => r.status === "orphan" || r.status === "unknown");
  if (orphans.length === 0) {
    lines.push("_None._");
  } else {
    lines.push("| Path | Source | Owner | Notes |");
    lines.push("|---|---|---|---|");
    for (const r of orphans) {
      lines.push(`| \`${r.path}\` | ${r.source} | ${r.owner ?? "—"} | ${r.notes.join("; ") || ""} |`);
    }
  }
  lines.push("");

  /* Cross-module frontend API */
  lines.push("## Cross-module frontend API findings");
  lines.push("");
  if (baseline.crossModuleApi.length === 0) {
    lines.push("_None._");
  } else {
    lines.push("| File | Foreign call | Foreign module |");
    lines.push("|---|---|---|");
    for (const f of baseline.crossModuleApi) {
      lines.push(`| \`${f.file}\` | \`${f.callsite}\` | ${f.foreignModule} |`);
    }
  }
  lines.push("");

  /* MainLayout imports */
  lines.push("## MainLayout imports under client/src/modules");
  lines.push("");
  if (baseline.mainLayoutImports.length === 0) {
    lines.push("_None — modules cleanly avoid mounting MainLayout._");
  } else {
    lines.push("| File |");
    lines.push("|---|");
    for (const f of baseline.mainLayoutImports) lines.push(`| \`${f}\` |`);
  }
  lines.push("");

  /* AWI client-route readiness */
  lines.push("## AWI client-route baseline");
  lines.push("");
  lines.push("Tracked separately by `pnpm run check:awi` and the wiring inventory.");
  lines.push("");

  /* Unmigrated capsule status */
  lines.push("## Unmigrated RTLM capsule status");
  lines.push("");
  lines.push("| Module | manifest | baseRoute | capsuleEntrypoint | layoutMode | routeInventory |");
  lines.push("|---|---|---|---|---|---|");
  for (const m of inv.manifests) {
    if (!RTLM_LIST.includes((m.key ?? m.folder) as any)) continue;
    lines.push(
      `| ${m.folder} | ${tick(m.manifestExists)} | ${tick(!!m.baseRoute)} | ${tick(!!m.capsuleEntrypoint)} | ${tick(!!m.layoutMode)} | ${tick(m.routeInventory.length > 0)} |`,
    );
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("_Baseline warnings are expected on unmigrated modules._");
  lines.push("");

  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Findings collected from elsewhere in the toolchain                 */
/* ------------------------------------------------------------------ */

export interface BaselineFindings {
  duplicatePaths: { path: string; sources: string[] }[];
  crossModuleApi: { file: string; callsite: string; foreignModule: string }[];
  mainLayoutImports: string[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function countByStatus(rows: RouteRow[]): Array<[RouteStatus, number]> {
  const order: RouteStatus[] = [
    "canonical",
    "compatibility-redirect",
    "deprecated",
    "platform-core",
    "orphan",
    "unknown",
  ];
  const m = new Map<RouteStatus, number>();
  for (const s of order) m.set(s, 0);
  for (const r of rows) m.set(r.status, (m.get(r.status) ?? 0) + 1);
  return order.map((s) => [s, m.get(s)!]);
}

function appendIssueSection(
  lines: string[],
  title: string,
  rows: RouteRow[],
  status: RouteStatus,
): void {
  const subset = rows.filter((r) => r.status === status);
  if (subset.length === 0) return;
  lines.push(`## ${title}`);
  lines.push("");
  lines.push("| Path | Source | Owner | Notes |");
  lines.push("|---|---|---|---|");
  for (const r of subset) {
    lines.push(
      `| \`${r.path}\` | ${r.source} | ${r.owner ?? "—"} | ${r.notes.join("; ") || ""} |`,
    );
  }
  lines.push("");
}

function formatRouteRow(r: RouteRow): string {
  const target = r.target ? `\`${r.target}\`` : "—";
  const owner = r.owner ?? "—";
  return `| \`${r.path}\` | ${owner} | ${r.source} | ${target} | ${STATUS_BADGE[r.status]} | ${r.notes.join("; ")} |`;
}

function tick(v: boolean): string {
  return v ? "✅" : "⚪";
}

function folderFor(rtlm: string): string {
  // Lazy reverse-lookup to avoid importing RTLM_FOLDER_MAP again here.
  // (Used for table rows only.)
  return rtlm.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
}

/* Re-export for the generator script. */
export { buildRouteInventory };
