#!/usr/bin/env tsx
/**
 * check:ports
 *
 * Static audit of the platform Port Registry:
 *   - the registry module exists and exports the public surface
 *   - default declarations are present and shape-valid
 *   - manifest `runtimePorts` blocks are shape-valid
 *   - building the registry from defaults + manifests reports zero
 *     declaration-level conflicts
 *
 * Exits non-zero on any blocker finding.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { resolveRepoRoot } from "../server/platform/modules/wiring-inventory";
import {
  __resetPortRegistryForTests,
  getPortRegistry,
  type ModulePortDeclaration,
} from "../server/platform/ports";
import { registerDefaultPortDeclarations } from "../server/platform/ports/default-declarations";

interface Finding {
  severity: "blocker" | "high" | "medium" | "low";
  message: string;
  hint?: string;
}

function read(p: string): string {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function isTestFile(name: string): boolean {
  return /\.(test|spec)\.tsx?$/.test(name);
}

function walk(root: string, predicate: (name: string) => boolean): string[] {
  const out: string[] = [];
  function w(d: string) {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const e of entries) {
      if (
        e === "node_modules" ||
        e === "dist" ||
        e === ".git" ||
        e === "build" ||
        e === ".vite" ||
        e === "coverage"
      )
        continue;
      const full = join(d, e);
      let s;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) w(full);
      else if (s.isFile() && predicate(e) && !isTestFile(e)) out.push(full);
    }
  }
  w(root);
  return out;
}

/**
 * Brace-balanced extractor. Walks `text` from `startIdx` and returns
 * the substring between the next `{` and its matching `}`. Aware of
 * string literals, template strings, line comments, and block
 * comments so braces inside them aren't counted.
 */
function extractBalancedBody(text: string, startIdx: number): string | null {
  const open = text.indexOf("{", startIdx);
  if (open === -1) return null;
  let depth = 0;
  let i = open;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;
  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];
    if (inLineComment) {
      if (c === "\n") inLineComment = false;
    } else if (inBlockComment) {
      if (c === "*" && n === "/") {
        inBlockComment = false;
        i++;
      }
    } else if (inSingle) {
      if (c === "\\") i++;
      else if (c === "'") inSingle = false;
    } else if (inDouble) {
      if (c === "\\") i++;
      else if (c === '"') inDouble = false;
    } else if (inBacktick) {
      if (c === "\\") i++;
      else if (c === "`") inBacktick = false;
    } else if (c === "/" && n === "/") {
      inLineComment = true;
      i++;
    } else if (c === "/" && n === "*") {
      inBlockComment = true;
      i++;
    } else if (c === "'") inSingle = true;
    else if (c === '"') inDouble = true;
    else if (c === "`") inBacktick = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(open + 1, i);
    }
    i++;
  }
  return null;
}

function parseManifestRuntimePorts(
  src: string,
  manifestPath: string,
): Array<{ moduleKey: string; decl: Partial<ModulePortDeclaration> }> {
  const results: Array<{ moduleKey: string; decl: Partial<ModulePortDeclaration> }> = [];
  const moduleKeyMatch = /key:\s*["']([\w.-]+)["']/.exec(src);
  const moduleKey = moduleKeyMatch?.[1];
  if (!moduleKey) return results;

  const portsIdx = src.search(/runtimePorts\s*:\s*\[/);
  if (portsIdx === -1) return results;

  // Find the array contents.
  const arrStart = src.indexOf("[", portsIdx);
  let depth = 0;
  let i = arrStart;
  let arrEnd = -1;
  while (i < src.length) {
    const c = src[i];
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) {
        arrEnd = i;
        break;
      }
    }
    i++;
  }
  if (arrEnd === -1) return results;
  const arrBody = src.slice(arrStart + 1, arrEnd);

  // Walk each top-level object literal in the array.
  let cursor = 0;
  while (cursor < arrBody.length) {
    const next = arrBody.indexOf("{", cursor);
    if (next === -1) break;
    const body = extractBalancedBody(arrBody, next);
    if (body === null) break;
    const decl: Partial<ModulePortDeclaration> = {};
    decl.key = /key:\s*["']([^"']+)["']/.exec(body)?.[1];
    decl.label = /label:\s*["']([^"']+)["']/.exec(body)?.[1];
    decl.mode = /mode:\s*["'](single|range|external|derived|disabled)["']/.exec(body)?.[1] as
      | ModulePortDeclaration["mode"]
      | undefined;
    decl.protocol = /protocol:\s*["'](http|https|tcp|ws|wss|postgres|custom)["']/.exec(body)?.[1] as
      | ModulePortDeclaration["protocol"]
      | undefined;
    const portMatch = /defaultPort:\s*(\d+)/.exec(body);
    if (portMatch) decl.defaultPort = Number(portMatch[1]);
    const rangeMatch = /defaultRange:\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]/.exec(body);
    if (rangeMatch) decl.defaultRange = [Number(rangeMatch[1]), Number(rangeMatch[2])];
    results.push({ moduleKey, decl });
    cursor = arrBody.indexOf("}", next);
    if (cursor === -1) break;
    cursor++;
  }
  return results;
}

async function main() {
  const repoRoot = resolveRepoRoot();
  const findings: Finding[] = [];

  // 1. Public-API surface check.
  const indexSrc = read(join(repoRoot, "server/platform/ports/index.ts"));
  for (const sym of ["getPortRegistry", "ModulePortDeclaration", "PortStatusSnapshot"]) {
    if (!new RegExp(`\\b${sym}\\b`).test(indexSrc)) {
      findings.push({
        severity: "blocker",
        message: `server/platform/ports/index.ts missing export '${sym}'`,
      });
    }
  }

  // 2. Default declarations file shape.
  const defaultsPath = join(repoRoot, "server/platform/ports/default-declarations.ts");
  if (!existsSync(defaultsPath)) {
    findings.push({
      severity: "blocker",
      message: "server/platform/ports/default-declarations.ts is missing",
    });
  } else {
    const defaultsSrc = read(defaultsPath);
    if (!/registerDefaultPortDeclarations/.test(defaultsSrc)) {
      findings.push({
        severity: "blocker",
        message: "default-declarations.ts must export registerDefaultPortDeclarations",
      });
    }
    for (const required of ["platform", "http", "postgres", "ollama"]) {
      if (!new RegExp(`["']${required}["']`).test(defaultsSrc)) {
        findings.push({
          severity: "high",
          message: `default-declarations.ts missing reference to '${required}'`,
        });
      }
    }
  }

  // 3. Build the registry from defaults + manifests and look for
  //    declaration-level conflicts.
  __resetPortRegistryForTests();
  const registry = getPortRegistry();
  registerDefaultPortDeclarations(registry);

  const manifestPaths = walk(join(repoRoot, "server"), (n) => n === "manifest.ts");
  for (const mp of manifestPaths) {
    const src = read(mp);
    const decls = parseManifestRuntimePorts(src, mp);
    for (const { moduleKey, decl } of decls) {
      if (!decl.key || !decl.mode || !decl.protocol) {
        findings.push({
          severity: "high",
          message: `${mp}: runtimePorts entry missing required field (key/mode/protocol)`,
        });
        continue;
      }
      try {
        registry.registerDeclaration({
          moduleKey,
          key: decl.key,
          label: decl.label ?? decl.key,
          mode: decl.mode,
          protocol: decl.protocol,
          defaultPort: decl.defaultPort,
          defaultRange: decl.defaultRange,
        });
      } catch (err) {
        findings.push({
          severity: "blocker",
          message: `${mp}: registerDeclaration rejected ${moduleKey}/${decl.key}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        });
      }
    }
  }

  const conflicts = registry.detectConflicts();
  for (const c of conflicts) {
    const a = `${c.declarationA.moduleKey}/${c.declarationA.key}`;
    const b = c.declarationB
      ? `${c.declarationB.moduleKey}/${c.declarationB.key}`
      : c.reservationB
        ? `${c.reservationB.moduleKey}/${c.reservationB.key}`
        : "?";
    findings.push({
      severity: "blocker",
      message: `Port conflict on ${c.host}:${c.port} between ${a} and ${b}`,
      hint: c.reason,
    });
  }

  // ---- Report --------------------------------------------------------
  const blockers = findings.filter((f) => f.severity === "blocker");
  const high = findings.filter((f) => f.severity === "high");
  const declarations = registry.listDeclarations();

  console.log("Port Registry Audit");
  console.log("===================");
  console.log(`Declarations: ${declarations.length}`);
  console.log(`Conflicts:    ${conflicts.length}`);
  console.log(`Blockers:     ${blockers.length}`);
  console.log(`High:         ${high.length}`);
  console.log("");

  if (findings.length === 0) {
    console.log("All declarations valid; no conflicts detected.");
    process.exit(0);
  }

  for (const f of findings) {
    const tag = f.severity.toUpperCase().padEnd(8);
    const hint = f.hint ? `  (${f.hint})` : "";
    console.log(`${tag} ${f.message}${hint}`);
  }

  if (blockers.length > 0) process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  console.error("check:ports failed:", err);
  process.exit(1);
});
