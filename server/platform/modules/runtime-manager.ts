/**
 * Runtime Manager — Platform Modular
 *
 * Boots modules in dependency order. Failures of optional modules mark
 * the module as `degraded`. Failures of required modules throw and are
 * expected to abort startup.
 *
 * The Runtime Manager owns boot/postListen/stop lifecycle, plus health
 * polling. It does NOT execute requests — that's the Module Gateway.
 */

import type {
  ModuleBootContext,
  ModuleHealthReport,
  ModuleManifest,
} from "./types";
import { getModuleRegistry } from "./registry";
import { getPortRegistry } from "../ports";

export interface RuntimeManagerOptions {
  /** Optional override for `appdb` accessor (used in tests). */
  appdb?: () => unknown;
  /** Optional logger override. */
  logger?: (level: "info" | "warn" | "error", msg: string, ...rest: unknown[]) => void;
}

export class RuntimeManager {
  private opts: RuntimeManagerOptions;
  private booted = false;
  private postListenDone = false;

  constructor(opts: RuntimeManagerOptions = {}) {
    this.opts = opts;
  }

  /** Boot all enabled modules in dependency order. */
  async boot(): Promise<void> {
    if (this.booted) return;
    this.booted = true;

    this.checkPortConflicts();

    const registry = getModuleRegistry();
    const order = registry.resolveBootOrder();

    for (const manifest of order) {
      await this.bootOne(manifest);
    }
  }

  /**
   * Surface declared port conflicts before any module boots. Static
   * (declaration-only) conflicts are always logged; whether they
   * abort startup is left to the caller via the optional
   * `failOnPortConflict` flag (default false to match prior behaviour
   * — modules with required=false never aborted startup before).
   */
  private checkPortConflicts(): void {
    try {
      const conflicts = getPortRegistry().detectConflicts();
      for (const c of conflicts) {
        const a = `${c.declarationA.moduleKey}/${c.declarationA.key}`;
        const b = c.declarationB
          ? `${c.declarationB.moduleKey}/${c.declarationB.key}`
          : c.reservationB
            ? `${c.reservationB.moduleKey}/${c.reservationB.key}`
            : "?";
        this.log(
          "warn",
          `[runtime] port conflict on ${c.host}:${c.port} between ${a} and ${b} — ${c.reason}`,
        );
      }
    } catch (err) {
      this.log("warn", `[runtime] port conflict check skipped — ${errMsg(err)}`);
    }
  }

  /** Run postListen hooks (after server.listen). */
  async postListen(): Promise<void> {
    if (this.postListenDone) return;
    this.postListenDone = true;

    const registry = getModuleRegistry();
    for (const manifest of registry.listEnabled()) {
      const state = registry.state(manifest.key);
      if (state?.state === "failed" || state?.state === "disabled") continue;
      if (!manifest.postListen) continue;
      try {
        await manifest.postListen(this.makeCtx(manifest));
      } catch (err) {
        const msg = errMsg(err);
        this.log("warn", `[runtime] postListen failed for '${manifest.key}': ${msg}`);
        registry.setState(manifest.key, "degraded", { bootError: msg });
      }
    }
  }

  /** Stop all modules in reverse boot order. */
  async stop(): Promise<void> {
    const registry = getModuleRegistry();
    const order = [...registry.resolveBootOrder()].reverse();
    for (const manifest of order) {
      if (!manifest.stop) continue;
      try {
        await manifest.stop(this.makeCtx(manifest));
        registry.setState(manifest.key, "stopped");
      } catch (err) {
        this.log("warn", `[runtime] stop failed for '${manifest.key}': ${errMsg(err)}`);
      }
    }
  }

  /** Run health on all modules and update registry. */
  async pollHealth(): Promise<ModuleHealthReport[]> {
    const registry = getModuleRegistry();
    const out: ModuleHealthReport[] = [];
    for (const m of registry.listEnabled()) {
      const report = await this.runHealth(m);
      registry.setHealth(m.key, report);
      out.push(report);
    }
    return out;
  }

  private async bootOne(manifest: ModuleManifest): Promise<void> {
    const registry = getModuleRegistry();

    // Check that all dependencies booted successfully.
    const deps = manifest.runtime.dependsOn ?? [];
    for (const dep of deps) {
      const depState = registry.state(dep);
      if (!depState || depState.state === "failed" || depState.state === "disabled") {
        const msg = `dependency '${dep}' is ${depState?.state ?? "missing"}`;
        if (manifest.runtime.required) {
          throw new Error(`[runtime] required module '${manifest.key}' cannot boot: ${msg}`);
        }
        this.log("warn", `[runtime] '${manifest.key}' marked degraded: ${msg}`);
        registry.setState(manifest.key, "degraded", { bootError: msg });
        return;
      }
    }

    registry.setState(manifest.key, "booting", { bootStartedAt: new Date().toISOString() });
    try {
      if (manifest.boot) {
        await manifest.boot(this.makeCtx(manifest));
      }
      registry.setState(manifest.key, "running", { bootCompletedAt: new Date().toISOString() });
    } catch (err) {
      const msg = errMsg(err);
      if (manifest.runtime.required) {
        registry.setState(manifest.key, "failed", { bootError: msg });
        throw new Error(`[runtime] required module '${manifest.key}' boot failed: ${msg}`);
      }
      this.log("warn", `[runtime] '${manifest.key}' boot failed (non-fatal): ${msg}`);
      registry.setState(manifest.key, "degraded", { bootError: msg, bootCompletedAt: new Date().toISOString() });
    }
  }

  private async runHealth(manifest: ModuleManifest): Promise<ModuleHealthReport> {
    if (!manifest.health) {
      return { state: "ok", checkedAt: new Date().toISOString(), message: "no health probe" };
    }
    try {
      const report = await manifest.health();
      return report;
    } catch (err) {
      return {
        state: "failed",
        checkedAt: new Date().toISOString(),
        message: errMsg(err),
      };
    }
  }

  private makeCtx(manifest: ModuleManifest): ModuleBootContext {
    return {
      env: process.env,
      appdb: this.opts.appdb ?? defaultAppdb,
      log: (level, msg, ...rest) => this.log(level, `[module:${manifest.key}] ${msg}`, ...rest),
    };
  }

  private log(level: "info" | "warn" | "error", msg: string, ...rest: unknown[]) {
    const fn = this.opts.logger ?? defaultLogger;
    fn(level, msg, ...rest);
  }
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

let _appdbAccessor: () => unknown = () => null;
function defaultAppdb() {
  return _appdbAccessor();
}

/** Wire the appdb accessor used by all module boot contexts. */
export function configureRuntime(appdb: () => unknown): void {
  _appdbAccessor = appdb;
}

function defaultLogger(level: "info" | "warn" | "error", msg: string, ...rest: unknown[]) {
  if (level === "error") console.error(msg, ...rest);
  else if (level === "warn") console.warn(msg, ...rest);
  else console.log(msg, ...rest);
}

let _runtime: RuntimeManager | null = null;
export function getRuntimeManager(opts?: RuntimeManagerOptions): RuntimeManager {
  if (!_runtime) _runtime = new RuntimeManager(opts);
  return _runtime;
}

/** Test-only. */
export function __resetRuntimeManagerForTests(): void {
  _runtime = null;
}
