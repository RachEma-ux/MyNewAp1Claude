/**
 * Module Wiring — Types
 *
 * Shared inventory model used by:
 *   - the wiring check scripts under `scripts/check-*-wiring.ts`
 *   - the wiring tests under `server/platform/**\/*-wiring.test.ts`
 *   - the wiring report writer (`wiring-report.ts`)
 *
 * The model intentionally describes BOTH what was *declared* in a
 * manifest and what was actually *registered* at runtime. The harness
 * exists to prove the two agree; declared-only items are the most
 * common wiring defect and must be visible.
 *
 * No runtime side effects in this file. No imports from module
 * internals. Pure types + helpers.
 */

import type {
  ModuleKey,
  ModuleRuntimeMode,
  ModuleDatabaseKind,
  ModuleHealthState,
} from "./types";

/* ------------------------------------------------------------------ */
/*  Status / severity                                                 */
/* ------------------------------------------------------------------ */

/**
 * `wired`           — declared AND registered at runtime; round-trip works.
 * `declared-only`   — declared in manifest but no runtime registration found.
 * `missing`         — required by another contract (e.g. handoff target) but
 *                     no declaration anywhere.
 * `not-applicable`  — module legitimately does not participate in this lane.
 */
export type WiringStatus =
  | "wired"
  | "declared-only"
  | "missing"
  | "not-applicable";

/**
 * Severity guides whether the harness fails (`blocker`/`high`) or merely
 * reports (`medium`/`low`/`follow-up`).
 *
 * `follow-up` is reserved for items the platform owner has *intentionally*
 * deferred — they appear in the report but do not fail the harness.
 */
export type WiringSeverity =
  | "blocker"
  | "high"
  | "medium"
  | "low"
  | "follow-up";

/* ------------------------------------------------------------------ */
/*  Per-lane inventory                                                */
/* ------------------------------------------------------------------ */

export interface PublicApiInventory {
  /** Action keys declared in the manifest's governanceActions. */
  declared: string[];
  /** Action keys actually registered via `registerPublicApi()`. */
  registered: string[];
  /** Actions whose descriptor has receiptRequired=true. */
  receiptRequired: string[];
  status: WiringStatus;
}

export interface EventInventory {
  emits: string[];
  consumes: string[];
  /** Subscriptions actually registered via `subscribeEvent()`. */
  subscribed: string[];
  /** Producers found by static grep (publishEvent / makeEnvelope). */
  producers: string[];
  status: WiringStatus;
}

export interface HandoffInventory {
  produces: string[];
  accepts: string[];
  /** Acceptors actually registered via `registerHandoffAcceptor()`. */
  registeredAcceptors: string[];
  /** Submitters found by static grep (submitHandoff). */
  submitters: string[];
  status: WiringStatus;
}

/**
 * Where a route is mounted. Mirrors `RouteSource` in
 * `scripts/module-tools/route-source.ts` so the static checks and
 * AWI agree on the same vocabulary.
 */
export type RouteSourceTag =
  | "app-platform-core"
  | "app-compatibility-redirect"
  | "module-manifest"
  | "module-mod-route"
  | "module-nav"
  | "deprecated"
  | "unknown";

export interface RouteInventory {
  /** Server-declared SPA paths from manifest.routes. */
  serverDeclared: string[];
  /** Routes the client manifest actually mounts. */
  clientRegistered: string[];
  /** Navigation entries from manifest.navigation. */
  nav: string[];
  /**
   * Per-path source tag — populated by the wiring builder when the
   * AWI integration knows where a route comes from. Empty during
   * Phase-0 for legacy manifests; populated for capsule-mounted
   * modules so AWI does not flag them as "missing".
   */
  routeSource?: Record<string, RouteSourceTag>;
  status: WiringStatus;
}

export interface RuntimeInventory {
  mode: ModuleRuntimeMode | null;
  required: boolean;
  bootDeclared: boolean;
  postListenDeclared: boolean;
  stopDeclared: boolean;
  healthDeclared: boolean;
  /** Top-level side-effect risk (timers, DB connections at import time). */
  importTimeSideEffects: string[];
  status: WiringStatus;
}

export interface DatabaseInventory {
  kind: ModuleDatabaseKind;
  ownedKey?: string;
  ownedTables: string[];
  status: WiringStatus;
}

export interface GovernanceActionInventory {
  declared: number;
  /** Action keys declared with receiptRequired=true. */
  receiptRequired: number;
  status: WiringStatus;
}

export interface DigitalHqVisibility {
  /** True when the module shows up in the HQ snapshot's modules list. */
  inSnapshot: boolean;
  /** Last-seen health state if any. */
  lastHealth: ModuleHealthState | null;
  status: WiringStatus;
}

/* ------------------------------------------------------------------ */
/*  Module-level inventory                                            */
/* ------------------------------------------------------------------ */

export interface ModuleWiringInventory {
  key: ModuleKey;
  name: string;
  /** server/<folder> path relative to repo root. */
  folder: string;

  serverManifestExists: boolean;
  clientManifestExists: boolean;
  routerRegistered: boolean;

  runtime: RuntimeInventory;
  database: DatabaseInventory;
  publicApi: PublicApiInventory;
  events: EventInventory;
  handoffs: HandoffInventory;
  routes: RouteInventory;
  governanceActions: GovernanceActionInventory;
  digitalHq: DigitalHqVisibility;

  /** Lanes the manifest claims to participate in. */
  declaredCommunicationModes: string[];
}

/* ------------------------------------------------------------------ */
/*  Findings + report                                                 */
/* ------------------------------------------------------------------ */

export interface WiringFinding {
  module: ModuleKey | "(platform)";
  lane:
    | "manifest"
    | "router"
    | "runtime"
    | "database"
    | "publicApi"
    | "event"
    | "handoff"
    | "route"
    | "governance"
    | "digitalHq"
    | "coordinator";
  status: WiringStatus;
  severity: WiringSeverity;
  message: string;
  /** Optional pointer for the operator. */
  hint?: string;
}

export interface WiringReport {
  generatedAt: string;
  /** Commit SHA the report was generated against, when available. */
  commit?: string;
  modules: ModuleWiringInventory[];
  findings: WiringFinding[];
  /** Roll-ups for the dashboard. */
  totals: {
    modules: number;
    fullyWired: number;
    declaredOnly: number;
    blockers: number;
    followUps: number;
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

export function isFollowUp(severity: WiringSeverity): boolean {
  return severity === "follow-up";
}

export function isBlocking(severity: WiringSeverity): boolean {
  return severity === "blocker" || severity === "high";
}

export function emptyInventory(
  key: ModuleKey,
  name: string,
  folder: string,
): ModuleWiringInventory {
  return {
    key,
    name,
    folder,
    serverManifestExists: false,
    clientManifestExists: false,
    routerRegistered: false,
    runtime: {
      mode: null,
      required: false,
      bootDeclared: false,
      postListenDeclared: false,
      stopDeclared: false,
      healthDeclared: false,
      importTimeSideEffects: [],
      status: "missing",
    },
    database: {
      kind: "none",
      ownedTables: [],
      status: "not-applicable",
    },
    publicApi: {
      declared: [],
      registered: [],
      receiptRequired: [],
      status: "not-applicable",
    },
    events: {
      emits: [],
      consumes: [],
      subscribed: [],
      producers: [],
      status: "not-applicable",
    },
    handoffs: {
      produces: [],
      accepts: [],
      registeredAcceptors: [],
      submitters: [],
      status: "not-applicable",
    },
    routes: {
      serverDeclared: [],
      clientRegistered: [],
      nav: [],
      status: "not-applicable",
    },
    governanceActions: {
      declared: 0,
      receiptRequired: 0,
      status: "not-applicable",
    },
    digitalHq: {
      inSnapshot: false,
      lastHealth: null,
      status: "missing",
    },
    declaredCommunicationModes: [],
  };
}
