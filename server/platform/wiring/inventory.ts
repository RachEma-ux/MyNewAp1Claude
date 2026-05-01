/**
 * Application Wiring Inventory — Builder
 *
 * Computes per-area wiring status for every module discovered by the
 * existing `server/platform/modules/wiring-inventory.ts` parser. AWI is
 * computed-only here; persistence to AWI tables is documented as
 * Phase 2 in `docs/architecture/modularity/APPLICATION_WIRING_INVENTORY.md`.
 *
 * The builder runs without:
 *   - importing module private internals
 *   - importing the manifests barrel (which has runtime side effects)
 *   - opening any DB connection
 *   - calling the OPA / governance engine
 *
 * Optional `RuntimeFacts` (gateway actions, registry state, event/handoff
 * stats) can be merged in by callers that have them — the AWI tRPC
 * surface in `server/hq/router.ts` does this, the static check scripts
 * do not.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import {
  buildFullInventory,
  KNOWN_MODULES,
  resolveRepoRoot,
  type DiscoveredModule,
} from "../modules/wiring-inventory";
import type { ModuleWiringInventory as LegacyInventory } from "../modules/wiring-types";
import { computeReadiness } from "./readiness";
import type {
  ModuleDependencyEdge,
  ModuleWiringAreaStatus,
  ModuleWiringInventory,
  WiringArea,
  WiringEvidence,
  WiringStatus,
} from "./types";

/* ------------------------------------------------------------------ */
/*  Runtime facts (optional)                                          */
/* ------------------------------------------------------------------ */

export interface AwiRuntimeFacts {
  /** Gateway-registered actions, from `listRegisteredActions()`. */
  registeredGatewayActions?: Array<{ module: string; action: string }>;
  /** Module registry state per module. */
  modulesInRegistry?: Array<{
    key: string;
    state: string;
    lastHealth?: string | null;
  }>;
  /** Aggregate event-bus stats for visibility scoring. */
  eventStats?: {
    outboxSize: number;
    deadLetter: number;
    criticalDeadLetter: number;
  };
  /** Aggregate handoff stats for visibility scoring. */
  handoffStats?: { total: number; failed: number };
}

/* ------------------------------------------------------------------ */
/*  Public entry                                                       */
/* ------------------------------------------------------------------ */

export interface BuildAwiOptions {
  repoRoot?: string;
  facts?: AwiRuntimeFacts;
}

export function buildApplicationWiringInventory(
  opts: BuildAwiOptions = {},
): ModuleWiringInventory[] {
  const repoRoot = opts.repoRoot ?? resolveRepoRoot();
  const legacy = buildFullInventory({ repoRoot });
  const legacyByKey = new Map(legacy.map((m) => [m.key, m]));
  return KNOWN_MODULES.map((mod) =>
    buildForModule(mod, legacyByKey.get(mod.key), repoRoot, opts.facts ?? {}),
  );
}

/* ------------------------------------------------------------------ */
/*  Per-module builder                                                 */
/* ------------------------------------------------------------------ */

function buildForModule(
  mod: DiscoveredModule,
  legacy: LegacyInventory | undefined,
  repoRoot: string,
  facts: AwiRuntimeFacts,
): ModuleWiringInventory {
  const areas: ModuleWiringAreaStatus[] = [];

  if (!legacy) {
    // Module is in KNOWN_MODULES but the parser could not produce data;
    // surface a single manifest-area blocker.
    areas.push(
      makeArea(mod.key, "manifest", {
        status: "missing",
        severity: "blocker",
        score: 0,
        required: true,
        evidence: [
          {
            kind: "manifest",
            path: `server/${mod.folder}/manifest.ts`,
            description: "Server manifest file not found",
            present: false,
          },
        ],
        missing: ["server/manifest.ts"],
      }),
    );
    const { score, status, blockers, warnings } = computeReadiness(areas);
    return {
      moduleKey: mod.key,
      moduleName: mod.name,
      areas,
      dependencies: [],
      readinessScore: score,
      readinessStatus: status,
      blockers,
      warnings,
    };
  }

  const runtimeRecord = facts.modulesInRegistry?.find((r) => r.key === mod.key);

  /* ----- 1. manifest ----- */
  areas.push(buildManifestArea(legacy));

  /* ----- 2. server-router ----- */
  areas.push(buildServerRouterArea(legacy));

  /* ----- 3. client-route ----- */
  areas.push(buildClientRouteArea(legacy));

  /* ----- 4. navigation ----- */
  areas.push(buildNavigationArea(legacy));

  /* ----- 5. public-api ----- */
  areas.push(buildPublicApiArea(legacy));

  /* ----- 6. gateway ----- */
  areas.push(buildGatewayArea(legacy, facts));

  /* ----- 7. database ----- */
  areas.push(buildDatabaseArea(legacy));

  /* ----- 8. permission ----- */
  areas.push(buildPermissionArea(legacy, repoRoot, mod.folder));

  /* ----- 9. governance ----- */
  areas.push(buildGovernanceArea(legacy));

  /* ----- 10. event ----- */
  areas.push(buildEventArea(legacy));

  /* ----- 11. handoff ----- */
  areas.push(buildHandoffArea(legacy));

  /* ----- 12. runtime ----- */
  areas.push(buildRuntimeArea(legacy, runtimeRecord));

  /* ----- 13. port-endpoint ----- */
  areas.push(buildPortEndpointArea(legacy));

  /* ----- 14. agent-provider ----- */
  areas.push(buildAgentProviderArea(repoRoot, mod.folder, mod.key));

  /* ----- 15. observability ----- */
  areas.push(buildObservabilityArea(legacy, runtimeRecord));

  /* ----- 16. test ----- */
  areas.push(buildTestArea(repoRoot, mod.folder));

  /* ----- 17. documentation ----- */
  areas.push(buildDocumentationArea(repoRoot, mod.folder, mod.key));

  /* ----- dependencies ----- */
  const dependencies = buildDependencyEdges(mod.key, legacy);

  const { score, status, blockers, warnings } = computeReadiness(areas);

  return {
    moduleKey: mod.key,
    moduleName: mod.name,
    runtimeMode: legacy.runtime.mode ?? undefined,
    databaseKind: legacy.database.kind,
    lastHealth: (runtimeRecord?.lastHealth as never) ?? null,
    lifecycleStatus: runtimeRecord?.state,
    areas,
    dependencies,
    readinessScore: score,
    readinessStatus: status,
    blockers,
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/*  Area builders                                                      */
/* ------------------------------------------------------------------ */

function makeArea(
  moduleKey: string,
  area: WiringArea,
  partial: Omit<ModuleWiringAreaStatus, "moduleKey" | "area">,
): ModuleWiringAreaStatus {
  return { moduleKey, area, ...partial };
}

function buildManifestArea(legacy: LegacyInventory): ModuleWiringAreaStatus {
  const evidence: WiringEvidence[] = [
    {
      kind: "manifest",
      path: `${legacy.folder}/manifest.ts`,
      description: "Module manifest file",
      present: legacy.serverManifestExists,
    },
  ];
  const status: WiringStatus = legacy.serverManifestExists ? "wired" : "missing";
  return makeArea(legacy.key, "manifest", {
    status,
    severity: status === "wired" ? "none" : "blocker",
    score: status === "wired" ? 100 : 0,
    required: true,
    evidence,
    missing: status === "wired" ? [] : ["server manifest"],
  });
}

function buildServerRouterArea(legacy: LegacyInventory): ModuleWiringAreaStatus {
  const present = legacy.routerRegistered;
  // Some modules are intentionally backend-only with no router (e.g. RAG
  // exposes its surface via kgra-agent). Mark as not-applicable when
  // neither router nor routerKey is declared AND no routes are declared.
  const routesDeclared = legacy.routes.serverDeclared.length > 0;
  if (!present && !routesDeclared) {
    return makeArea(legacy.key, "server-router", {
      status: "not-applicable",
      severity: "none",
      score: 0,
      required: false,
      evidence: [
        {
          kind: "router",
          description: "No router declared (module is backend-only or proxied)",
          present: false,
        },
      ],
      missing: [],
    });
  }
  return makeArea(legacy.key, "server-router", {
    status: present ? "wired" : "missing",
    severity: present ? "none" : "high",
    score: present ? 100 : 0,
    required: true,
    evidence: [
      {
        kind: "router",
        description: "Manifest declares router / routerKey",
        present,
      },
    ],
    missing: present ? [] : ["manifest.router"],
  });
}

function buildClientRouteArea(legacy: LegacyInventory): ModuleWiringAreaStatus {
  const declared = legacy.routes.serverDeclared.length;
  const registered = legacy.routes.clientRegistered.length;
  if (declared === 0) {
    return makeArea(legacy.key, "client-route", {
      status: "not-applicable",
      severity: "none",
      score: 0,
      required: false,
      evidence: [],
      missing: [],
    });
  }
  let status: WiringStatus;
  let score: number;
  if (registered === 0) {
    status = "declared-only";
    score = 25;
  } else if (registered >= declared) {
    status = "wired";
    score = 100;
  } else {
    status = "partial";
    score = Math.round((registered / declared) * 100);
  }
  return makeArea(legacy.key, "client-route", {
    status,
    severity:
      status === "wired"
        ? "none"
        : status === "partial"
          ? "medium"
          : "high",
    score,
    required: true,
    evidence: [
      {
        kind: "client-route",
        description: `Server declared ${declared} route(s); client registered ${registered}`,
        present: registered > 0,
      },
    ],
    missing: registered >= declared
      ? []
      : legacy.routes.serverDeclared.filter(
          (p) => !legacy.routes.clientRegistered.includes(p),
        ),
  });
}

function buildNavigationArea(legacy: LegacyInventory): ModuleWiringAreaStatus {
  const navCount = legacy.routes.nav.length;
  const routesDeclared = legacy.routes.serverDeclared.length;
  if (routesDeclared === 0) {
    return makeArea(legacy.key, "navigation", {
      status: "not-applicable",
      severity: "none",
      score: 0,
      required: false,
      evidence: [],
      missing: [],
    });
  }
  if (navCount === 0) {
    return makeArea(legacy.key, "navigation", {
      status: "missing",
      severity: "low",
      score: 30,
      required: false,
      evidence: [
        {
          kind: "nav",
          description: "Module has UI routes but no navigation entries",
          present: false,
        },
      ],
      missing: ["manifest.navigation"],
    });
  }
  return makeArea(legacy.key, "navigation", {
    status: "wired",
    severity: "none",
    score: 100,
    required: false,
    evidence: [
      { kind: "nav", description: `${navCount} navigation entry(ies) declared`, present: true },
    ],
    missing: [],
  });
}

function buildPublicApiArea(legacy: LegacyInventory): ModuleWiringAreaStatus {
  const declared = legacy.publicApi.declared.length;
  const registered = legacy.publicApi.registered.length;
  if (declared === 0) {
    return makeArea(legacy.key, "public-api", {
      status: "not-applicable",
      severity: "none",
      score: 0,
      required: false,
      evidence: [],
      missing: [],
    });
  }
  let status: WiringStatus;
  let score: number;
  if (registered === 0) {
    status = "declared-only";
    score = 30;
  } else if (registered >= declared) {
    status = "wired";
    score = 100;
  } else {
    status = "partial";
    score = Math.round((registered / declared) * 100);
  }
  return makeArea(legacy.key, "public-api", {
    status,
    severity: status === "wired" ? "none" : status === "partial" ? "medium" : "follow-up",
    score,
    required: true,
    evidence: [
      {
        kind: "gateway",
        description: `${declared} action(s) declared; ${registered} have registerPublicApi handlers`,
        present: registered > 0,
      },
    ],
    missing: legacy.publicApi.declared.filter((k) => !legacy.publicApi.registered.includes(k)),
  });
}

function buildGatewayArea(
  legacy: LegacyInventory,
  facts: AwiRuntimeFacts,
): ModuleWiringAreaStatus {
  const declared = legacy.publicApi.declared;
  if (declared.length === 0) {
    return makeArea(legacy.key, "gateway", {
      status: "not-applicable",
      severity: "none",
      score: 0,
      required: false,
      evidence: [],
      missing: [],
    });
  }
  // Prefer runtime facts when caller passed them in; fall back to the
  // static parser's view (which only sees `registerPublicApi(` literals
  // in source).
  const runtimeRegistered = facts.registeredGatewayActions
    ?.filter((a) => a.module === legacy.key)
    .map((a) => a.action) ?? legacy.publicApi.registered;
  const matched = declared.filter((k) => runtimeRegistered.includes(k));
  let status: WiringStatus;
  let score: number;
  if (matched.length === 0) {
    status = "declared-only";
    score = 25;
  } else if (matched.length >= declared.length) {
    status = "wired";
    score = 100;
  } else {
    status = "partial";
    score = Math.round((matched.length / declared.length) * 100);
  }
  return makeArea(legacy.key, "gateway", {
    status,
    severity: status === "wired" ? "none" : status === "partial" ? "medium" : "follow-up",
    score,
    required: true,
    evidence: [
      {
        kind: "gateway",
        description: facts.registeredGatewayActions
          ? "Runtime gateway registry consulted"
          : "Static parse of registerPublicApi() calls",
        present: matched.length > 0,
      },
    ],
    missing: declared.filter((k) => !matched.includes(k)),
  });
}

function buildDatabaseArea(legacy: LegacyInventory): ModuleWiringAreaStatus {
  const kind = legacy.database.kind;
  if (kind === "none") {
    return makeArea(legacy.key, "database", {
      status: "not-applicable",
      severity: "none",
      score: 0,
      required: false,
      evidence: [
        { kind: "db", description: "Module declares no database", present: true },
      ],
      missing: [],
    });
  }
  const ownedTables = legacy.database.ownedTables;
  const ownedKey = legacy.database.ownedKey;
  const broken = kind === "owned" && !ownedKey;
  const status: WiringStatus = broken ? "broken" : "wired";
  return makeArea(legacy.key, "database", {
    status,
    severity: status === "wired" ? "none" : "blocker",
    score: status === "wired" ? 100 : 0,
    required: true,
    evidence: [
      {
        kind: "db",
        description:
          kind === "owned"
            ? `Owned DB '${ownedKey ?? "?"}' with ${ownedTables.length} tracked table(s)`
            : `Shared DB; ${ownedTables.length} owned table prefix(es)`,
        present: !broken,
      },
    ],
    missing: broken ? ["database.key for owned DB"] : [],
  });
}

function buildPermissionArea(
  legacy: LegacyInventory,
  repoRoot: string,
  folder: string,
): ModuleWiringAreaStatus {
  const manifestSrc = safeRead(join(repoRoot, "server", folder, "manifest.ts"));
  if (!manifestSrc) {
    return makeArea(legacy.key, "permission", {
      status: "missing",
      severity: "high",
      score: 0,
      required: true,
      evidence: [],
      missing: ["manifest.permissions"],
    });
  }
  const block = /permissions\s*:\s*\{[\s\S]*?keys\s*:\s*\[([\s\S]*?)\]/m.exec(manifestSrc);
  const keys = block
    ? [...block[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1])
    : [];
  if (keys.length === 0) {
    return makeArea(legacy.key, "permission", {
      status: "missing",
      severity: "medium",
      score: 30,
      required: false,
      evidence: [
        { kind: "manifest", description: "No permission keys declared", present: false },
      ],
      missing: ["manifest.permissions.keys"],
    });
  }
  return makeArea(legacy.key, "permission", {
    status: "wired",
    severity: "none",
    score: 100,
    required: true,
    evidence: [
      { kind: "manifest", description: `${keys.length} permission key(s) declared`, present: true },
    ],
    missing: [],
  });
}

function buildGovernanceArea(legacy: LegacyInventory): ModuleWiringAreaStatus {
  const declared = legacy.governanceActions.declared;
  if (declared === 0) {
    return makeArea(legacy.key, "governance", {
      status: "not-applicable",
      severity: "none",
      score: 0,
      required: false,
      evidence: [],
      missing: [],
    });
  }
  return makeArea(legacy.key, "governance", {
    status: "wired",
    severity: "none",
    score: 100,
    required: true,
    evidence: [
      {
        kind: "governance",
        description: `${declared} governance action(s) declared (${legacy.governanceActions.receiptRequired} require receipts)`,
        present: true,
      },
    ],
    missing: [],
  });
}

function buildEventArea(legacy: LegacyInventory): ModuleWiringAreaStatus {
  const { emits, consumes, subscribed } = legacy.events;
  if (emits.length === 0 && consumes.length === 0) {
    return makeArea(legacy.key, "event", {
      status: "not-applicable",
      severity: "none",
      score: 0,
      required: false,
      evidence: [],
      missing: [],
    });
  }
  const consumesMissing = consumes.filter((c) => !subscribed.includes(c));
  const status: WiringStatus =
    consumesMissing.length === 0
      ? "wired"
      : consumesMissing.length === consumes.length
        ? "declared-only"
        : "partial";
  const score =
    consumes.length === 0
      ? 100
      : Math.round(((consumes.length - consumesMissing.length) / consumes.length) * 100);
  return makeArea(legacy.key, "event", {
    status,
    severity: status === "wired" ? "none" : "medium",
    score: status === "wired" ? 100 : score,
    required: false,
    evidence: [
      {
        kind: "event",
        description: `Emits ${emits.length}; consumes ${consumes.length}; subscriptions ${subscribed.length}`,
        present: status === "wired",
      },
    ],
    missing: consumesMissing,
  });
}

function buildHandoffArea(legacy: LegacyInventory): ModuleWiringAreaStatus {
  const { produces, accepts, registeredAcceptors } = legacy.handoffs;
  if (produces.length === 0 && accepts.length === 0) {
    return makeArea(legacy.key, "handoff", {
      status: "not-applicable",
      severity: "none",
      score: 0,
      required: false,
      evidence: [],
      missing: [],
    });
  }
  const acceptsMissing = accepts.filter((a) => !registeredAcceptors.includes(a));
  const status: WiringStatus =
    acceptsMissing.length === 0
      ? "wired"
      : acceptsMissing.length === accepts.length
        ? "declared-only"
        : "partial";
  const score =
    accepts.length === 0
      ? 100
      : Math.round(((accepts.length - acceptsMissing.length) / accepts.length) * 100);
  return makeArea(legacy.key, "handoff", {
    status,
    severity: status === "wired" ? "none" : "high",
    score: status === "wired" ? 100 : score,
    required: false,
    evidence: [
      {
        kind: "handoff",
        description: `Produces ${produces.length}; accepts ${accepts.length}; acceptor handlers ${registeredAcceptors.length}`,
        present: status === "wired",
      },
    ],
    missing: acceptsMissing,
  });
}

function buildRuntimeArea(
  legacy: LegacyInventory,
  runtimeRecord: AwiRuntimeFacts["modulesInRegistry"] extends Array<infer T> ? T | undefined : undefined,
): ModuleWiringAreaStatus {
  const mode = legacy.runtime.mode;
  if (!mode) {
    return makeArea(legacy.key, "runtime", {
      status: "missing",
      severity: "blocker",
      score: 0,
      required: true,
      evidence: [
        { kind: "runtime", description: "manifest.runtime.mode missing", present: false },
      ],
      missing: ["manifest.runtime.mode"],
    });
  }
  const sideEffects = legacy.runtime.importTimeSideEffects;
  const broken = sideEffects.length > 0;
  let status: WiringStatus = "wired";
  if (broken) status = "broken";
  else if (
    runtimeRecord &&
    (runtimeRecord.state === "failed" || runtimeRecord.state === "degraded")
  ) {
    status = runtimeRecord.state === "failed" ? "broken" : "partial";
  }
  return makeArea(legacy.key, "runtime", {
    status,
    severity: status === "wired" ? "none" : status === "partial" ? "medium" : "high",
    score:
      status === "wired" ? 100 : status === "partial" ? 50 : broken ? 20 : 60,
    required: true,
    evidence: [
      {
        kind: "runtime",
        description: `mode=${mode}; required=${legacy.runtime.required}; boot=${legacy.runtime.bootDeclared}; health=${legacy.runtime.healthDeclared}`,
        present: true,
      },
      ...(sideEffects.length
        ? [
            {
              kind: "runtime" as const,
              description: `Import-time side effects: ${sideEffects.join(", ")}`,
              present: true,
            },
          ]
        : []),
    ],
    missing: sideEffects,
    notes: runtimeRecord?.state ? `Runtime state: ${runtimeRecord.state}` : undefined,
  });
}

function buildPortEndpointArea(legacy: LegacyInventory): ModuleWiringAreaStatus {
  // The port-endpoint area covers the *logical* ports declared in
  // manifest.ports.{provided,consumed}. The new platform Port Registry
  // (see PR #51 — separate landing) covers the runtime endpoints; AWI
  // here only validates the manifest declarations are present.
  const provided = (legacy as any).ports?.provided ?? [];
  const consumed = (legacy as any).ports?.consumed ?? [];
  if ((provided?.length ?? 0) === 0 && (consumed?.length ?? 0) === 0) {
    return makeArea(legacy.key, "port-endpoint", {
      status: "not-applicable",
      severity: "none",
      score: 0,
      required: false,
      evidence: [],
      missing: [],
    });
  }
  return makeArea(legacy.key, "port-endpoint", {
    status: "wired",
    severity: "none",
    score: 100,
    required: false,
    evidence: [
      {
        kind: "manifest",
        description: `Ports — provided ${provided.length}, consumed ${consumed.length}`,
        present: true,
      },
    ],
    missing: [],
  });
}

function buildAgentProviderArea(
  repoRoot: string,
  folder: string,
  moduleKey: string,
): ModuleWiringAreaStatus {
  // Agent/provider binding is only checked statically — we look for the
  // module declaring an aiTypes.catalog consumption (most modules go
  // through aiTypes for model selection) OR a contracts/ports file
  // that references provider/agent identifiers.
  const portsSrc = safeRead(join(repoRoot, "server", folder, "ports.ts")) ?? "";
  const contractsSrc = safeRead(join(repoRoot, "server", folder, "contracts.ts")) ?? "";
  const consumesAiTypes = /aiTypes\.catalog/.test(portsSrc) || /aiTypes\.catalog/.test(contractsSrc);
  const looksAi =
    /agent|provider|llm|model|inference/i.test(portsSrc) ||
    /agent|provider|llm|model|inference/i.test(contractsSrc);
  if (!looksAi && !consumesAiTypes) {
    return makeArea(moduleKey, "agent-provider", {
      status: "not-applicable",
      severity: "none",
      score: 0,
      required: false,
      evidence: [],
      missing: [],
    });
  }
  return makeArea(moduleKey, "agent-provider", {
    status: consumesAiTypes ? "wired" : "declared-only",
    severity: consumesAiTypes ? "none" : "low",
    score: consumesAiTypes ? 100 : 50,
    required: false,
    evidence: [
      {
        kind: "manifest",
        description: consumesAiTypes
          ? "Module consumes aiTypes.catalog (provider/agent gateway)"
          : "References agent/provider/model concepts but no aiTypes.catalog binding declared",
        present: true,
      },
    ],
    missing: consumesAiTypes ? [] : ["aiTypes.catalog port consumption"],
  });
}

function buildObservabilityArea(
  legacy: LegacyInventory,
  runtimeRecord: AwiRuntimeFacts["modulesInRegistry"] extends Array<infer T> ? T | undefined : undefined,
): ModuleWiringAreaStatus {
  const healthDeclared = legacy.runtime.healthDeclared;
  const inSnapshot = legacy.digitalHq.inSnapshot;
  const lastHealth = runtimeRecord?.lastHealth ?? legacy.digitalHq.lastHealth ?? null;
  const status: WiringStatus = healthDeclared && inSnapshot ? "wired" : healthDeclared ? "partial" : "missing";
  const score = healthDeclared && inSnapshot ? 100 : healthDeclared ? 60 : 20;
  return makeArea(legacy.key, "observability", {
    status,
    severity: status === "wired" ? "none" : status === "partial" ? "low" : "medium",
    score,
    required: true,
    evidence: [
      {
        kind: "runtime",
        description: `health()=${healthDeclared}; HQ snapshot=${inSnapshot}; lastHealth=${lastHealth ?? "n/a"}`,
        present: healthDeclared,
      },
    ],
    missing: healthDeclared ? [] : ["manifest.health()"],
  });
}

function buildTestArea(repoRoot: string, folder: string): ModuleWiringAreaStatus {
  const dir = join(repoRoot, "server", folder);
  const files = listFilesRecursive(dir, 4).filter((f) =>
    /\.(test|spec)\.tsx?$/.test(f),
  );
  // A platform-wiring test also counts toward observability of the
  // module — but we only credit *direct* tests under the module folder.
  if (files.length === 0) {
    return makeArea(folderToKey(folder), "test", {
      status: "missing",
      severity: "medium",
      score: 0,
      required: false,
      evidence: [
        { kind: "test", description: "No *.test.ts under server/<folder>", present: false },
      ],
      missing: ["module-level vitest"],
    });
  }
  return makeArea(folderToKey(folder), "test", {
    status: "wired",
    severity: "none",
    score: Math.min(100, files.length * 25 + 50),
    required: false,
    evidence: [
      {
        kind: "test",
        description: `${files.length} test file(s) under server/${folder}`,
        present: true,
      },
    ],
    missing: [],
  });
}

function buildDocumentationArea(
  repoRoot: string,
  folder: string,
  moduleKey: string,
): ModuleWiringAreaStatus {
  const candidates = [
    join(repoRoot, "docs", folder),
    join(repoRoot, "docs", "modules", folder),
    join(repoRoot, "docs", "architecture", folder),
    join(repoRoot, "docs", "architecture", "modularity", folder),
    join(repoRoot, "server", folder, "README.md"),
  ];
  let found: string | null = null;
  for (const c of candidates) {
    if (existsSync(c)) {
      found = c;
      break;
    }
  }
  if (!found) {
    return makeArea(moduleKey, "documentation", {
      status: "missing",
      severity: "low",
      score: 0,
      required: false,
      evidence: [
        { kind: "doc", description: "No module-level docs found", present: false },
      ],
      missing: ["docs/<folder>/* or server/<folder>/README.md"],
    });
  }
  return makeArea(moduleKey, "documentation", {
    status: "wired",
    severity: "none",
    score: 100,
    required: false,
    evidence: [
      { kind: "doc", path: relativeFromRoot(found, repoRoot), description: "Module documentation found", present: true },
    ],
    missing: [],
  });
}

/* ------------------------------------------------------------------ */
/*  Dependencies                                                       */
/* ------------------------------------------------------------------ */

function buildDependencyEdges(
  moduleKey: string,
  legacy: LegacyInventory,
): ModuleDependencyEdge[] {
  const edges: ModuleDependencyEdge[] = [];

  // 1. Module-owned DB → DB node.
  if (legacy.database.kind === "owned" && legacy.database.ownedKey) {
    edges.push({
      sourceModule: moduleKey,
      target: `db:${legacy.database.ownedKey}`,
      targetType: "database",
      dependencyType: "owned",
      required: true,
    });
  } else if (legacy.database.kind === "shared") {
    edges.push({
      sourceModule: moduleKey,
      target: "db:appdb",
      targetType: "database",
      dependencyType: "shared",
      required: true,
    });
  }

  // 2. Events emitted/consumed → event nodes.
  for (const e of legacy.events.emits) {
    edges.push({
      sourceModule: moduleKey,
      target: `event:${e}`,
      targetType: "event",
      dependencyType: "emits",
      required: false,
    });
  }
  for (const c of legacy.events.consumes) {
    edges.push({
      sourceModule: moduleKey,
      target: `event:${c}`,
      targetType: "event",
      dependencyType: "consumes",
      required: false,
    });
  }

  // 3. Handoffs produced/accepted → handoff nodes.
  for (const h of legacy.handoffs.produces) {
    edges.push({
      sourceModule: moduleKey,
      target: `handoff:${h}`,
      targetType: "handoff",
      dependencyType: "produces",
      required: false,
    });
  }
  for (const h of legacy.handoffs.accepts) {
    edges.push({
      sourceModule: moduleKey,
      target: `handoff:${h}`,
      targetType: "handoff",
      dependencyType: "accepts",
      required: true,
    });
  }

  // 4. Governance actions → governance node.
  if (legacy.governanceActions.declared > 0) {
    edges.push({
      sourceModule: moduleKey,
      target: `gov:${moduleKey}`,
      targetType: "governance",
      dependencyType: "declares",
      required: true,
    });
  }

  // 5. Provided/consumed ports → API nodes (port = logical service).
  const provided = (legacy as any).ports?.provided ?? [];
  const consumed = (legacy as any).ports?.consumed ?? [];
  for (const p of provided) {
    edges.push({
      sourceModule: moduleKey,
      target: `port:${p}`,
      targetType: "port",
      dependencyType: "provides",
      required: false,
    });
  }
  for (const c of consumed) {
    edges.push({
      sourceModule: moduleKey,
      target: `port:${c}`,
      targetType: "port",
      dependencyType: "consumes",
      required: true,
    });
    // If the consumed port has the form `<otherModule>.<verb>`, derive a
    // module → module dependency.
    const dot = c.indexOf(".");
    if (dot > 0) {
      const target = c.slice(0, dot);
      if (target !== moduleKey) {
        edges.push({
          sourceModule: moduleKey,
          target: `module:${target}`,
          targetType: "module",
          dependencyType: "consumes-port",
          required: true,
          evidence: c,
        });
      }
    }
  }

  return edges;
}

/* ------------------------------------------------------------------ */
/*  File helpers                                                       */
/* ------------------------------------------------------------------ */

function safeRead(p: string): string | null {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

function listFilesRecursive(dir: string, maxDepth: number): string[] {
  const out: string[] = [];
  function walk(d: string, depth: number) {
    if (depth > maxDepth) return;
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const e of entries) {
      if (e === "node_modules" || e === ".git" || e === "dist" || e === "build") continue;
      const full = join(d, e);
      let s;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) walk(full, depth + 1);
      else if (s.isFile()) out.push(full);
    }
  }
  walk(dir, 0);
  return out;
}

function relativeFromRoot(p: string, repoRoot: string): string {
  return p.startsWith(repoRoot) ? p.slice(repoRoot.length + 1) : p;
}

function folderToKey(folder: string): string {
  // Map known folder → module key (camelCase). Mirrors KNOWN_MODULES.
  const m = KNOWN_MODULES.find((m) => m.folder === folder);
  return m?.key ?? folder;
}
