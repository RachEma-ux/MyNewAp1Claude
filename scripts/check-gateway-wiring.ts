#!/usr/bin/env tsx
/**
 * check:gateway-wiring
 *
 * Validates that the Module Gateway surface is coherent:
 *   - every governance action declared on a manifest is either
 *       (a) registered via registerPublicApi() somewhere reachable from
 *           the module's boot/manifest path, or
 *       (b) recorded as an intentional follow-up.
 *   - registered actions have unique (module, action) tuples (the gateway
 *     itself enforces this at runtime; we re-check statically).
 *   - actions with `receiptRequired: true` carry a clear marker so the
 *     gateway can enforce the receipt at runtime.
 *   - the gateway never advertises a private repository / DB action.
 *
 * This script does NOT import the manifest barrel. It scans manifest
 * source files + boot.ts + public-api.ts under server/<folder>/ and
 * uses a static parse via the wiring inventory.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import {
  buildFullInventory,
  KNOWN_MODULES,
  resolveRepoRoot,
} from "../server/platform/modules/wiring-inventory";
import type { WiringFinding } from "../server/platform/modules/wiring-types";

interface ParsedRegistration {
  module: string;
  action: string;
  receiptRequired: boolean;
  filepath: string;
  line: number;
}

const PRIVATE_FORBIDDEN = [
  ".repository",
  ".connection",
  ".service",
  ".db",
  ".executor",
];

function readSafe(p: string): string {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function isTestFile(name: string): boolean {
  return /\.(test|spec)\.tsx?$/.test(name);
}

function walkServer(root: string, opts?: { includeTests?: boolean }): string[] {
  const includeTests = opts?.includeTests ?? false;
  const out: string[] = [];
  function w(d: string) {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const e of entries) {
      if (e === "node_modules" || e === "dist" || e === ".git" || e === "build" || e === ".vite" || e === "coverage") {
        continue;
      }
      const full = join(d, e);
      let s;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) w(full);
      else if (s.isFile() && (e.endsWith(".ts") || e.endsWith(".tsx")) && !e.endsWith(".d.ts")) {
        if (!includeTests && isTestFile(e)) continue;
        out.push(full);
      }
    }
  }
  w(root);
  return out;
}

/**
 * Extract balanced `{...}` body starting at `openIdx` (which must point at
 * a `{`). Tracks string literals and template strings so braces inside
 * strings are ignored. Returns the body (between the braces) and the
 * index just past the closing brace, or null if unbalanced.
 */
function extractBalancedBody(
  src: string,
  openIdx: number,
): { body: string; end: number } | null {
  if (src[openIdx] !== "{") return null;
  let depth = 0;
  let i = openIdx;
  let inStr: '"' | "'" | "`" | null = null;
  let inLineComment = false;
  let inBlockComment = false;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (c === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inStr) {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === inStr) inStr = null;
      i++;
      continue;
    }
    if (c === "/" && next === "/") {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (c === "/" && next === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      i++;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        return { body: src.slice(openIdx + 1, i), end: i + 1 };
      }
    }
    i++;
  }
  return null;
}

function parseRegistrations(repoRoot: string): ParsedRegistration[] {
  const files = walkServer(join(repoRoot, "server"));
  const out: ParsedRegistration[] = [];
  for (const f of files) {
    const src = readSafe(f);
    if (!src.includes("registerPublicApi")) continue;
    // Locate every `registerPublicApi(` then extract the balanced `{...}`
    // that follows. Brace-counting handles handlers that contain inline
    // object literals like `repo.update(id, { ...patch })`.
    const callRe = /registerPublicApi\s*\(\s*/g;
    let cm: RegExpExecArray | null;
    while ((cm = callRe.exec(src))) {
      const after = cm.index + cm[0].length;
      if (src[after] !== "{") continue;
      const balanced = extractBalancedBody(src, after);
      if (!balanced) continue;
      const body = balanced.body;
      const moduleName = /module\s*:\s*["'`]([^"'`]+)["'`]/.exec(body)?.[1];
      const actionName = /action\s*:\s*["'`]([^"'`]+)["'`]/.exec(body)?.[1];
      if (!moduleName || !actionName) continue;
      const receiptRequired = /receiptRequired\s*:\s*true/.test(body);
      const lineNo = src.slice(0, cm.index).split("\n").length;
      out.push({
        module: moduleName,
        action: actionName,
        receiptRequired,
        filepath: relative(repoRoot, f),
        line: lineNo,
      });
    }
  }
  return out;
}

function checkPrivateLeak(repoRoot: string): WiringFinding[] {
  const out: WiringFinding[] = [];
  const files = walkServer(join(repoRoot, "server"));
  for (const f of files) {
    const src = readSafe(f);
    if (!src.includes("registerPublicApi")) continue;
    const re = /registerPublicApi\s*\(\s*\{([\s\S]*?)handler\s*:\s*([A-Za-z_][\w.]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const handlerSym = m[2];
      for (const banned of PRIVATE_FORBIDDEN) {
        if (handlerSym.includes(banned)) {
          out.push({
            module: "(platform)",
            lane: "publicApi",
            status: "wired",
            severity: "blocker",
            message: `Private symbol exposed via gateway: ${handlerSym} (in ${relative(repoRoot, f)})`,
            hint: "Wrap private symbols in a public-api function before exposing",
          });
        }
      }
    }
  }
  return out;
}

async function main() {
  const repoRoot = resolveRepoRoot();
  const inventory = buildFullInventory({ repoRoot });
  const findings: WiringFinding[] = [];

  const registrations = parseRegistrations(repoRoot);

  // ---- 1. Uniqueness of (module, action) -------------------------
  const seen = new Map<string, ParsedRegistration>();
  for (const r of registrations) {
    const key = `${r.module}::${r.action}`;
    const prev = seen.get(key);
    if (prev) {
      findings.push({
        module: r.module,
        lane: "publicApi",
        status: "wired",
        severity: "blocker",
        message: `Duplicate registerPublicApi for ${key}`,
        hint: `Locations: ${prev.filepath}:${prev.line} AND ${r.filepath}:${r.line}`,
      });
    }
    seen.set(key, r);
  }

  // ---- 2. Cross-check declared vs registered ---------------------
  const registeredByModule = new Map<string, Set<string>>();
  for (const r of registrations) {
    if (!registeredByModule.has(r.module)) registeredByModule.set(r.module, new Set());
    registeredByModule.get(r.module)!.add(r.action);
  }

  for (const inv of inventory) {
    const reg = registeredByModule.get(inv.key) ?? new Set<string>();
    const declared = inv.publicApi.declared;
    const required = inv.publicApi.receiptRequired;

    if (declared.length === 0) continue;

    const unregistered = declared.filter((d) => !reg.has(d));
    if (unregistered.length > 0) {
      findings.push({
        module: inv.key,
        lane: "publicApi",
        status: "declared-only",
        severity: "follow-up",
        message: `${unregistered.length} declared action(s) lack registerPublicApi: ${unregistered.join(", ")}`,
        hint: "Wire in module boot() — see WIRING_VERIFICATION_GUIDE.md",
      });
    }

    // Receipt-required actions: when registered, must carry the marker.
    for (const action of required) {
      const found = registrations.find(
        (r) => r.module === inv.key && r.action === action,
      );
      if (found && !found.receiptRequired) {
        findings.push({
          module: inv.key,
          lane: "publicApi",
          status: "wired",
          severity: "high",
          message: `Action ${action} declared receiptRequired but registerPublicApi() did not pass receiptRequired=true`,
          hint: `Set descriptor.receiptRequired in ${found.filepath}:${found.line}`,
        });
      }
    }
  }

  // ---- 3. Private symbol leak check -------------------------------
  findings.push(...checkPrivateLeak(repoRoot));

  // ---- 4. Print + exit --------------------------------------------
  console.log("=== check:gateway-wiring ===");
  console.log(`\nDiscovered ${registrations.length} registerPublicApi() call(s).`);
  for (const r of registrations) {
    const tag = r.receiptRequired ? " [receipt]" : "";
    console.log(`  ${r.module}.${r.action}${tag}  (${r.filepath}:${r.line})`);
  }
  if (registrations.length === 0) {
    console.log(
      "  (none — public APIs are declared on manifests but not wired into gateway yet)",
    );
  }

  console.log(`\n${findings.length} finding(s):`);
  for (const f of findings) {
    console.log(`  [${f.severity}] ${f.module} ${f.lane}: ${f.message}`);
  }

  const blocking = findings.filter(
    (f) => f.severity === "blocker" || f.severity === "high",
  );
  if (blocking.length > 0) {
    console.error(`\n${blocking.length} blocking finding(s).`);
    process.exit(1);
  }
  console.log("\nOK — gateway wiring within tolerance.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[FATAL] check:gateway-wiring", err);
  process.exit(2);
});
