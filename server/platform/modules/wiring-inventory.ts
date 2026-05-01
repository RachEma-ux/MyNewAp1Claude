/**
 * Module Wiring — Inventory Builder
 *
 * Builds a static `ModuleWiringInventory` for every module in the platform
 * by reading manifest source files and grepping `boot()` bodies for the
 * runtime registration calls (`registerPublicApi`, `subscribeEvent`,
 * `registerHandoffAcceptor`, `submitHandoff`, `publishEvent`).
 *
 * The builder is intentionally side-effect-free: it does NOT import
 * manifest modules or trigger any module boot. Instead it reads source
 * code from disk so the wiring checks can run before/without booting
 * the platform.
 *
 * Test harnesses that want runtime-truth (e.g. confirming a manifest
 * boot hook actually called `registerPublicApi` after import) should
 * call `mergeRuntimeFacts()` after running the boot hooks themselves.
 */

import { existsSync, readFileSync } from "fs";
import { join, relative } from "path";
import {
  emptyInventory,
  type EventInventory,
  type HandoffInventory,
  type ModuleWiringInventory,
  type PublicApiInventory,
  type RouteInventory,
  type RuntimeInventory,
} from "./wiring-types";

/**
 * Module discovery — kept intentionally local so this file does not
 * import the static `MODULE_MAP` from `scripts/lib/`. The two should
 * agree, and `check-module-wiring.ts` cross-validates them.
 */
export interface DiscoveredModule {
  key: string;
  name: string;
  folder: string;
  /** Optional client folder under client/src/. */
  clientFolder?: string;
}

export const KNOWN_MODULES: DiscoveredModule[] = [
  { key: "prm", name: "PRM", folder: "prm" },
  { key: "psm", name: "PSM", folder: "psm" },
  { key: "codeStudio", name: "Code Studio", folder: "code-studio" },
  { key: "agentStudio", name: "Agent Studio", folder: "agent-studio" },
  { key: "sandboxWf", name: "Sandbox WF", folder: "sandbox-wf" },
  { key: "rag", name: "RAG", folder: "rag" },
  { key: "openRouter", name: "OpenRouter", folder: "openrouter" },
  { key: "ps", name: "PS", folder: "ps" },
  { key: "hr", name: "HR", folder: "hr" },
  {
    key: "organizationManagement",
    name: "Organization Management",
    folder: "organization-management",
  },
  { key: "cultureValues", name: "Culture Values", folder: "culture-values" },
  { key: "aiTypes", name: "AI Types", folder: "ai-types" },
  { key: "kgraAgent", name: "KGRA Agent", folder: "kgra-agent" },
];

/* ------------------------------------------------------------------ */
/*  Static parsing helpers                                            */
/* ------------------------------------------------------------------ */

function safeRead(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function extractStringArray(source: string, fieldName: string): string[] {
  // Match `fieldName: ["a", "b", ...]` (greedy across newlines).
  const re = new RegExp(`${fieldName}\\s*:\\s*\\[([\\s\\S]*?)\\]`, "m");
  const m = re.exec(source);
  if (!m) return [];
  const inner = m[1];
  return [...inner.matchAll(/["'`]([^"'`\n]+)["'`]/g)].map((x) => x[1]);
}

function extractObjectField(source: string, fieldName: string): string | null {
  const re = new RegExp(`${fieldName}\\s*:\\s*([^,\\n]+)`, "m");
  const m = re.exec(source);
  return m ? m[1].trim().replace(/[",;]+$/, "") : null;
}

function hasIdentifier(source: string, ident: string): boolean {
  const re = new RegExp(`(^|[^A-Za-z0-9_])${ident}\\s*\\(`);
  return re.test(source);
}

function extractGovernanceActionKeys(source: string): {
  keys: string[];
  receiptRequired: string[];
} {
  // Match `governanceActions: [ { key: "...", ..., receiptRequired: true } ]`
  const blockRe = /governanceActions\s*:\s*\[([\s\S]*?)\]/m;
  const m = blockRe.exec(source);
  if (!m) return { keys: [], receiptRequired: [] };
  const block = m[1];
  const keys: string[] = [];
  const receiptRequired: string[] = [];
  // Walk each `{ ... }` entry in the array.
  const objRe = /\{([\s\S]*?)\}/g;
  let entry: RegExpExecArray | null;
  while ((entry = objRe.exec(block))) {
    const inner = entry[1];
    const kMatch = /key\s*:\s*["'`]([^"'`]+)["'`]/.exec(inner);
    if (!kMatch) continue;
    const k = kMatch[1];
    keys.push(k);
    if (/receiptRequired\s*:\s*true/.test(inner)) {
      receiptRequired.push(k);
    }
  }
  return { keys, receiptRequired };
}

/* ------------------------------------------------------------------ */
/*  Per-module builder                                                */
/* ------------------------------------------------------------------ */

export interface BuildOptions {
  repoRoot: string;
}

export function buildInventoryFor(
  mod: DiscoveredModule,
  opts: BuildOptions,
): ModuleWiringInventory {
  const inv = emptyInventory(mod.key, mod.name, `server/${mod.folder}`);

  const manifestPath = join(opts.repoRoot, "server", mod.folder, "manifest.ts");
  const bootPath = join(opts.repoRoot, "server", mod.folder, "boot.ts");
  const eventsPath = join(opts.repoRoot, "server", mod.folder, "events.ts");
  const handoffsPath = join(opts.repoRoot, "server", mod.folder, "handoffs.ts");
  const publicApiPath = join(
    opts.repoRoot,
    "server",
    mod.folder,
    "public-api.ts",
  );

  const manifestSrc = safeRead(manifestPath);
  inv.serverManifestExists = manifestSrc !== null;
  if (!manifestSrc) {
    return inv;
  }

  /* ----- runtime ----- */
  inv.runtime = parseRuntime(manifestSrc, bootPath, opts.repoRoot, mod.folder);

  /* ----- database ----- */
  const dbKindRaw = extractObjectField(manifestSrc, "kind");
  const dbBlockRe = /database\s*:\s*\{([\s\S]*?)\}/m;
  const dbMatch = dbBlockRe.exec(manifestSrc);
  if (dbMatch) {
    const dbInner = dbMatch[1];
    const k = /kind\s*:\s*["'`]([^"'`]+)["'`]/.exec(dbInner)?.[1];
    const ownedKey = /key\s*:\s*["'`]([^"'`]+)["'`]/.exec(dbInner)?.[1];
    const ownedTables = extractStringArray(dbInner, "ownedTables");
    if (k === "owned" || k === "shared" || k === "none") {
      inv.database = {
        kind: k,
        ownedKey,
        ownedTables,
        status: k === "none" ? "not-applicable" : "wired",
      };
    }
  } else if (dbKindRaw) {
    inv.database.status = "missing";
  }

  /* ----- public API ----- */
  const govActions = extractGovernanceActionKeys(manifestSrc);
  inv.governanceActions = {
    declared: govActions.keys.length,
    receiptRequired: govActions.receiptRequired.length,
    status: govActions.keys.length > 0 ? "wired" : "not-applicable",
  };

  // Public API actions == governance action keys (the same set that the
  // gateway exposes). We approximate the registered set by grepping
  // `boot.ts` (or the manifest itself) for `registerPublicApi(`.
  const registeredApis = collectRegisteredApis(
    [bootPath, manifestPath].map((p) => safeRead(p) ?? ""),
  );
  inv.publicApi = buildPublicApi(govActions, registeredApis);

  /* ----- events ----- */
  inv.events = parseEvents(manifestSrc, [bootPath, eventsPath].map((p) => safeRead(p) ?? ""));

  /* ----- handoffs ----- */
  inv.handoffs = parseHandoffs(
    manifestSrc,
    [bootPath, handoffsPath, publicApiPath].map((p) => safeRead(p) ?? ""),
  );

  /* ----- routes / nav ----- */
  inv.routes = parseRoutes(manifestSrc, opts.repoRoot, mod);

  /* ----- communication modes ----- */
  inv.declaredCommunicationModes = extractStringArray(manifestSrc, "modes");

  /* ----- client manifest existence ----- */
  inv.clientManifestExists = existsSync(
    join(opts.repoRoot, "client", "src", "modules", mod.folder, "manifest.ts"),
  ) ||
    existsSync(
      join(opts.repoRoot, "client", "src", "platform", "modules", mod.folder, "manifest.ts"),
    );

  /* ----- router registered (cross-checked by check-module-wiring) ----- */
  // The cheap heuristic: manifest exports `router` or `routerKey`.
  inv.routerRegistered =
    /router\s*[:?]?\s*[A-Za-z_]/.test(manifestSrc) ||
    /routerKey\s*:\s*["'`]/.test(manifestSrc);

  /* ----- digital HQ visibility (static guess; runtime check confirms) ----- */
  // If the module appears in the manifests barrel, HQ will see it once
  // the registry boots. Cheap proxy: it's in KNOWN_MODULES.
  inv.digitalHq = {
    inSnapshot: true,
    lastHealth: null,
    status: "wired",
  };

  return inv;
}

function parseRuntime(
  manifestSrc: string,
  bootPath: string,
  repoRoot: string,
  folder: string,
): RuntimeInventory {
  const modeRaw = /runtime\s*:\s*\{[\s\S]*?mode\s*:\s*["'`]([^"'`]+)["'`]/m.exec(
    manifestSrc,
  )?.[1];
  const required = /required\s*:\s*true/.test(manifestSrc);
  const bootDeclared = /(^|\s)boot\s*[:?]?\s*[A-Za-z_(]/m.test(manifestSrc);
  const postListenDeclared = /postListen\s*[:?]?\s*[A-Za-z_(]/m.test(manifestSrc);
  const stopDeclared = /\bstop\s*[:?]?\s*[A-Za-z_(]/m.test(manifestSrc);
  const healthDeclared = /\bhealth\s*[:?]?\s*[A-Za-z_(]/m.test(manifestSrc);

  // Top-level side effects to check for in boot.ts and manifest.ts.
  const importTimeSideEffects: string[] = [];
  for (const path of [
    join(repoRoot, "server", folder, "boot.ts"),
    join(repoRoot, "server", folder, "manifest.ts"),
  ]) {
    const src = safeRead(path);
    if (!src) continue;
    // Strip exported function bodies — anything inside `export function` /
    // `export const X = (...) =>` is intentional. Top-level expressions
    // outside such guards are flagged.
    const stripped = src
      .replace(/^import[^;]*;?\s*$/gm, "")
      .replace(/^export[^;{]*\{[\s\S]*?^\}/gm, "")
      .replace(/^export\s+(const|let|var|function|async)[\s\S]*?(?=^export|^\/\*|^$)/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");

    const offenders: Array<[RegExp, string]> = [
      [/^\s*setInterval\s*\(/m, "setInterval at top level"],
      [/^\s*setTimeout\s*\(/m, "setTimeout at top level"],
      [/^\s*new\s+pg\.(Client|Pool)/m, "Postgres connection at top level"],
      [/^\s*new\s+Worker\s*\(/m, "Worker thread at top level"],
      [/^\s*await\s+\w/m, "top-level await"],
    ];
    for (const [re, msg] of offenders) {
      if (re.test(stripped)) importTimeSideEffects.push(msg);
    }
  }

  const validModes: ReadonlySet<string> = new Set([
    "shared",
    "embedded",
    "worker",
    "external",
  ]);
  return {
    mode: modeRaw && validModes.has(modeRaw) ? (modeRaw as RuntimeInventory["mode"]) : null,
    required,
    bootDeclared,
    postListenDeclared,
    stopDeclared,
    healthDeclared,
    importTimeSideEffects,
    status: modeRaw ? "wired" : "missing",
  };
  // bootPath is read by `parseRuntime`-internal logic above; argument retained
  // for callers that want to extend with additional file paths in the future.
  void bootPath;
}

function collectRegisteredApis(sources: string[]): {
  registered: Set<string>;
} {
  const registered = new Set<string>();
  const re = /registerPublicApi\s*\(\s*\{[^}]*?action\s*:\s*["'`]([^"'`]+)["'`]/g;
  for (const src of sources) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) registered.add(m[1]);
  }
  return { registered };
}

function buildPublicApi(
  gov: { keys: string[]; receiptRequired: string[] },
  reg: { registered: Set<string> },
): PublicApiInventory {
  const declared = gov.keys.slice();
  const registered = declared.filter((k) => reg.registered.has(k));
  let status: PublicApiInventory["status"];
  if (declared.length === 0) status = "not-applicable";
  else if (registered.length === declared.length) status = "wired";
  else status = "declared-only";
  return {
    declared,
    registered,
    receiptRequired: gov.receiptRequired,
    status,
  };
}

function parseEvents(manifestSrc: string, otherSources: string[]): EventInventory {
  const eventsBlock = /events\s*:\s*\{([\s\S]*?)\}/m.exec(manifestSrc)?.[1] ?? "";
  const emits = extractStringArray(eventsBlock, "emits");
  const consumes = extractStringArray(eventsBlock, "consumes");
  const subscribed: string[] = [];
  const producers: string[] = [];

  const subRe = /subscribeEvent\s*\(\s*["'`]([^"'`]+)["'`]/g;
  const pubRe = /publishEvent\s*\(/g;
  const envRe = /makeEnvelope\s*\(\s*\{[\s\S]*?eventType\s*:\s*["'`]([^"'`]+)["'`]/g;

  for (const src of otherSources) {
    let m: RegExpExecArray | null;
    while ((m = subRe.exec(src))) subscribed.push(m[1]);
    while ((m = envRe.exec(src))) producers.push(m[1]);
    if (pubRe.test(src) && producers.length === 0) {
      // We saw publishEvent but couldn't statically resolve eventType.
      producers.push("(dynamic)");
    }
  }

  let status: EventInventory["status"];
  if (emits.length === 0 && consumes.length === 0) status = "not-applicable";
  else if (consumes.length > 0 && subscribed.length === 0) status = "declared-only";
  else status = "wired";

  return { emits, consumes, subscribed, producers, status };
}

function parseHandoffs(manifestSrc: string, otherSources: string[]): HandoffInventory {
  const handoffsBlock = /handoffs\s*:\s*\{([\s\S]*?)\}/m.exec(manifestSrc)?.[1] ?? "";
  const produces = extractStringArray(handoffsBlock, "produces");
  const accepts = extractStringArray(handoffsBlock, "accepts");

  const registeredAcceptors: string[] = [];
  const submitters: string[] = [];

  const acceptorRe = /registerHandoffAcceptor\s*\(\s*["'`][^"'`]+["'`]\s*,\s*["'`]([^"'`]+)["'`]/g;
  const submitRe = /submitHandoff\s*\(\s*\{[\s\S]*?type\s*:\s*["'`]([^"'`]+)["'`]/g;
  for (const src of otherSources) {
    let m: RegExpExecArray | null;
    while ((m = acceptorRe.exec(src))) registeredAcceptors.push(m[1]);
    while ((m = submitRe.exec(src))) submitters.push(m[1]);
  }

  let status: HandoffInventory["status"];
  if (produces.length === 0 && accepts.length === 0) status = "not-applicable";
  else if (accepts.length > 0 && registeredAcceptors.length === 0) status = "declared-only";
  else status = "wired";

  return { produces, accepts, registeredAcceptors, submitters, status };
}

function parseRoutes(
  manifestSrc: string,
  repoRoot: string,
  mod: DiscoveredModule,
): RouteInventory {
  const routesBlock = /routes\s*:\s*\[([\s\S]*?)\]/m.exec(manifestSrc)?.[1] ?? "";
  const serverDeclared = [...routesBlock.matchAll(/path\s*:\s*["'`]([^"'`]+)["'`]/g)].map(
    (m) => m[1],
  );

  const navBlock = /navigation\s*:\s*\[([\s\S]*?)\]/m.exec(manifestSrc)?.[1] ?? "";
  const nav = [...navBlock.matchAll(/label\s*:\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);

  const clientManifest =
    safeRead(
      join(repoRoot, "client", "src", "modules", mod.folder, "manifest.ts"),
    ) ??
    safeRead(
      join(repoRoot, "client", "src", "platform", "modules", mod.folder, "manifest.ts"),
    ) ??
    "";

  const clientRegistered = [
    ...clientManifest.matchAll(/path\s*:\s*["'`]([^"'`]+)["'`]/g),
  ].map((m) => m[1]);

  let status: RouteInventory["status"];
  if (serverDeclared.length === 0) status = "not-applicable";
  else if (clientRegistered.length === 0) status = "declared-only";
  else status = "wired";

  return { serverDeclared, clientRegistered, nav, status };
}

/* ------------------------------------------------------------------ */
/*  Top-level entry                                                   */
/* ------------------------------------------------------------------ */

export function buildFullInventory(opts: BuildOptions): ModuleWiringInventory[] {
  return KNOWN_MODULES.map((m) => buildInventoryFor(m, opts));
}

/* ------------------------------------------------------------------ */
/*  Runtime fact merge — used by tests after they boot a mock module  */
/* ------------------------------------------------------------------ */

export interface RuntimeFacts {
  registeredPublicApis?: Array<{ module: string; action: string }>;
  registeredHandoffAcceptors?: Array<{ module: string; type: string }>;
  registeredEventSubscriptions?: Array<{ pattern: string }>;
  modulesInRegistry?: Array<{ key: string; lastHealth?: string | null }>;
}

export function mergeRuntimeFacts(
  inventory: ModuleWiringInventory[],
  facts: RuntimeFacts,
): void {
  if (facts.registeredPublicApis) {
    const byModule = new Map<string, Set<string>>();
    for (const r of facts.registeredPublicApis) {
      if (!byModule.has(r.module)) byModule.set(r.module, new Set());
      byModule.get(r.module)!.add(r.action);
    }
    for (const inv of inventory) {
      const set = byModule.get(inv.key);
      if (!set) continue;
      const reg = inv.publicApi.declared.filter((k) => set.has(k));
      inv.publicApi.registered = reg;
      if (inv.publicApi.declared.length > 0) {
        inv.publicApi.status =
          reg.length === inv.publicApi.declared.length ? "wired" : "declared-only";
      }
    }
  }
  if (facts.registeredHandoffAcceptors) {
    const byModule = new Map<string, Set<string>>();
    for (const r of facts.registeredHandoffAcceptors) {
      if (!byModule.has(r.module)) byModule.set(r.module, new Set());
      byModule.get(r.module)!.add(r.type);
    }
    for (const inv of inventory) {
      const set = byModule.get(inv.key);
      if (!set) continue;
      inv.handoffs.registeredAcceptors = inv.handoffs.accepts.filter((t) => set.has(t));
      inv.handoffs.status =
        inv.handoffs.accepts.length === 0
          ? inv.handoffs.status
          : inv.handoffs.registeredAcceptors.length === inv.handoffs.accepts.length
            ? "wired"
            : "declared-only";
    }
  }
  if (facts.registeredEventSubscriptions) {
    const subs = facts.registeredEventSubscriptions.map((r) => r.pattern);
    for (const inv of inventory) {
      const matched = inv.events.consumes.filter((c) =>
        subs.some((p) => patternMatches(p, c)),
      );
      inv.events.subscribed = matched;
      if (inv.events.consumes.length > 0) {
        inv.events.status =
          matched.length === inv.events.consumes.length ? "wired" : "declared-only";
      }
    }
  }
  if (facts.modulesInRegistry) {
    const map = new Map(facts.modulesInRegistry.map((r) => [r.key, r]));
    for (const inv of inventory) {
      const fact = map.get(inv.key);
      if (!fact) {
        inv.digitalHq.inSnapshot = false;
        inv.digitalHq.status = "missing";
        continue;
      }
      inv.digitalHq.inSnapshot = true;
      inv.digitalHq.lastHealth = (fact.lastHealth as never) ?? null;
      inv.digitalHq.status = "wired";
    }
  }
}

function patternMatches(pattern: string, eventType: string): boolean {
  if (pattern === "*") return true;
  if (pattern === eventType) return true;
  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -2);
    return eventType.startsWith(prefix + ".");
  }
  return false;
}

/* ------------------------------------------------------------------ */
/*  Misc                                                              */
/* ------------------------------------------------------------------ */

export function resolveRepoRoot(): string {
  // CWD when the check scripts run is the repo root.
  return process.cwd();
}

export function relativeFromRepo(path: string, repoRoot: string): string {
  return relative(repoRoot, path);
}
