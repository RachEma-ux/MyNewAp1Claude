/**
 * Platform Modular — Module Manifest Types
 *
 * Modules self-register via a typed manifest. The manifest is the single
 * source of truth for:
 *   - module identity (key, name, version)
 *   - tRPC router
 *   - runtime mode (shared / embedded / worker / external)
 *   - database ownership
 *   - permissions and governance actions
 *   - HTTP/SPA routes and navigation hints (frontend manifest)
 *   - boot / postListen / stop hooks
 *   - health
 *   - public API, events, handoffs (the cross-module contract surface)
 *   - provided ports (this module exposes to others)
 *   - consumed ports (this module needs from others)
 *   - communication modes (port / gateway / handoff / event / coordinator)
 *
 * The Runtime Manager and Router Composer read this manifest. No platform
 * core file should hard-import a module's private internals.
 */

import type { AnyRouter } from "@trpc/server";

/* ------------------------------------------------------------------ */
/*  Identity                                                          */
/* ------------------------------------------------------------------ */

export type ModuleKey = string;
export type ModuleVersion = `${number}.${number}.${number}` | string;

/* ------------------------------------------------------------------ */
/*  Runtime                                                           */
/* ------------------------------------------------------------------ */

export type ModuleRuntimeMode =
  | "shared"
  | "embedded"
  | "worker"
  | "external";

export interface ModuleRuntimeDescriptor {
  mode: ModuleRuntimeMode;
  /** If true, a boot failure blocks platform startup. Default: false. */
  required?: boolean;
  /** Optional list of module keys this module depends on (boot ordering). */
  dependsOn?: ModuleKey[];
}

/* ------------------------------------------------------------------ */
/*  Database                                                          */
/* ------------------------------------------------------------------ */

export type ModuleDatabaseKind = "none" | "shared" | "owned";

export interface ModuleDatabaseOwned {
  kind: "owned";
  /** Logical key, e.g. "prmdb", "psmdb", "codedb". */
  key: string;
  /** Lazy connector — used for health probes only. Must not import other modules. */
  connect?: () => unknown | Promise<unknown>;
  /** Tables/relations the module owns inside its own DB. */
  ownedTables?: string[];
}

export interface ModuleDatabaseShared {
  kind: "shared";
  /** Logical schema name in the platform DB (informational only). */
  schema?: string;
  /** Tables this module owns within the shared platform DB. */
  ownedTables?: string[];
}

export interface ModuleDatabaseNone {
  kind: "none";
}

export type ModuleDatabaseDescriptor =
  | ModuleDatabaseOwned
  | ModuleDatabaseShared
  | ModuleDatabaseNone;

/* ------------------------------------------------------------------ */
/*  Permissions / Governance                                          */
/* ------------------------------------------------------------------ */

export interface ModulePermissionDescriptor {
  /** Permission keys this module defines. */
  keys: string[];
}

export interface ModuleGovernanceActionDescriptor {
  /** Stable action key, e.g. "prm.method.publish". */
  key: string;
  /** Human description. */
  description: string;
  /** Risk classification. */
  risk?: "low" | "medium" | "high";
  /** Whether a governance receipt is required when this action is invoked
   *  via Gateway / Handoff / Coordinator. */
  receiptRequired?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Routes / Navigation                                               */
/* ------------------------------------------------------------------ */

export interface ModuleRouteDescriptor {
  /** SPA path, e.g. "/prm". */
  path: string;
  /** Navigation label. */
  label?: string;
  /** Required permissions. */
  permissions?: string[];
}

export interface ModuleNavigationDescriptor {
  group?: string;
  label: string;
  icon?: string;
  /** Order within group (lower = earlier). */
  order?: number;
  routes?: ModuleRouteDescriptor[];
}

/* ------------------------------------------------------------------ */
/*  Public API / Events / Handoffs / Ports                            */
/* ------------------------------------------------------------------ */

export interface ModulePublicApiDescriptor {
  /** Where the module's `public-api.ts` lives, relative to repo root. */
  path: string;
}

export interface ModuleEventDescriptor {
  emits?: string[];
  consumes?: string[];
}

export interface ModuleHandoffDescriptor {
  produces?: string[];
  accepts?: string[];
}

export interface ModulePortDescriptor {
  /** Ports this module provides to others (sync interfaces). */
  provided?: string[];
  /** Ports this module consumes from others. */
  consumed?: string[];
}

export interface ModuleCommunicationDescriptor {
  /** Lanes this module participates in. */
  modes?: Array<"port" | "gateway" | "handoff" | "event" | "coordinator">;
}

/* ------------------------------------------------------------------ */
/*  Health                                                            */
/* ------------------------------------------------------------------ */

export type ModuleHealthState = "ok" | "degraded" | "failed" | "disabled";

export interface ModuleHealthReport {
  state: ModuleHealthState;
  message?: string;
  details?: Record<string, unknown>;
  checkedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Lifecycle hooks                                                   */
/* ------------------------------------------------------------------ */

export type ModuleBootContext = {
  env: NodeJS.ProcessEnv;
  /** Lazy access — modules must not capture and reuse this elsewhere. */
  appdb: () => unknown;
  /** Logger that prefixes lines with `[module:<key>]`. */
  log: (level: "info" | "warn" | "error", message: string, ...rest: unknown[]) => void;
};

export type ModuleHook = (ctx: ModuleBootContext) => void | Promise<void>;

/* ------------------------------------------------------------------ */
/*  Manifest                                                          */
/* ------------------------------------------------------------------ */

export interface ModuleManifest {
  key: ModuleKey;
  name: string;
  version: ModuleVersion;

  runtime: ModuleRuntimeDescriptor;
  database: ModuleDatabaseDescriptor;

  /** tRPC router — mounted at `appRouter[<key>]` unless `routerKey` overrides. */
  router?: AnyRouter;
  routerKey?: string;

  permissions?: ModulePermissionDescriptor;
  governanceActions?: ModuleGovernanceActionDescriptor[];

  routes?: ModuleRouteDescriptor[];
  navigation?: ModuleNavigationDescriptor[];

  boot?: ModuleHook;
  postListen?: ModuleHook;
  stop?: ModuleHook;
  health?: () => ModuleHealthReport | Promise<ModuleHealthReport>;

  publicApi?: ModulePublicApiDescriptor;
  events?: ModuleEventDescriptor;
  handoffs?: ModuleHandoffDescriptor;
  ports?: ModulePortDescriptor;
  communication?: ModuleCommunicationDescriptor;

  /** Optional disable flag, e.g. driven by env. */
  enabled?: boolean | (() => boolean);
}

/* ------------------------------------------------------------------ */
/*  Runtime state                                                     */
/* ------------------------------------------------------------------ */

export type ModuleRuntimeStateName =
  | "registered"
  | "booting"
  | "running"
  | "degraded"
  | "failed"
  | "disabled"
  | "stopped";

export interface ModuleRuntimeState {
  key: ModuleKey;
  state: ModuleRuntimeStateName;
  bootError?: string;
  bootStartedAt?: string;
  bootCompletedAt?: string;
  lastHealth?: ModuleHealthReport;
}
