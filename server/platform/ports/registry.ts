/**
 * Platform Port Registry — Implementation
 *
 * Process-singleton registry of port/URL declarations and live
 * reservations. Pure in-memory; no persistence — it's rebuilt on every
 * boot from manifest declarations + the default-declarations seed.
 *
 * Thread model: Node.js single-thread; mutations are synchronous so no
 * locks are needed. Any future move to worker_threads will need to
 * re-think this.
 */

import net from "node:net";
import type {
  ModulePortDeclaration,
  PortHealthStatus,
  PortReservation,
  PortStatusSnapshot,
} from "./types";

interface ConflictDetail {
  declarationA: ModulePortDeclaration;
  declarationB?: ModulePortDeclaration;
  reservationA?: PortReservation;
  reservationB?: PortReservation;
  host: string;
  port: number;
  reason: string;
}

class PortRegistry {
  private declarations = new Map<string, ModulePortDeclaration>();
  private reservations = new Map<string, PortReservation>();
  private nextReservationId = 1;

  registerDeclaration(decl: ModulePortDeclaration): void {
    const id = declarationId(decl.moduleKey, decl.key);
    const existing = this.declarations.get(id);
    if (existing) {
      // Re-registering with the same shape is a no-op (HMR friendly);
      // a different shape is a hard error so silent drift can't happen.
      if (sameShape(existing, decl)) return;
      throw new Error(
        `Port declaration ${id} already registered with a different shape`,
      );
    }
    if (decl.mode === "single" && typeof decl.defaultPort !== "number") {
      throw new Error(`Port declaration ${id} mode=single requires defaultPort`);
    }
    if (decl.mode === "range" && !decl.defaultRange) {
      throw new Error(`Port declaration ${id} mode=range requires defaultRange`);
    }
    if (decl.mode === "range" && decl.defaultRange) {
      const [min, max] = decl.defaultRange;
      if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
        throw new Error(
          `Port declaration ${id} defaultRange invalid: [${min}, ${max}]`,
        );
      }
    }
    this.declarations.set(id, decl);
  }

  listDeclarations(): ModulePortDeclaration[] {
    return Array.from(this.declarations.values());
  }

  getDeclaration(moduleKey: string, key: string): ModulePortDeclaration | undefined {
    return this.declarations.get(declarationId(moduleKey, key));
  }

  reservePort(args: {
    moduleKey: string;
    key: string;
    port: number;
    host?: string;
    ownerRef?: string;
    status?: PortHealthStatus;
  }): PortReservation {
    const decl = this.getDeclaration(args.moduleKey, args.key);
    if (!decl) {
      throw new Error(
        `reservePort: no declaration for ${args.moduleKey}/${args.key}`,
      );
    }
    if (decl.mode === "external" || decl.mode === "disabled") {
      throw new Error(
        `reservePort: declaration ${args.moduleKey}/${args.key} mode=${decl.mode} is not bindable`,
      );
    }
    if (decl.mode === "range" && decl.defaultRange) {
      const [min, max] = decl.defaultRange;
      if (args.port < min || args.port > max) {
        throw new Error(
          `reservePort: port ${args.port} outside declared range [${min}, ${max}] for ${args.moduleKey}/${args.key}`,
        );
      }
    }
    const host = args.host ?? decl.defaultHost ?? "127.0.0.1";
    const conflict = this.findReservationConflict(host, args.port);
    if (conflict) {
      throw new Error(
        `reservePort: ${host}:${args.port} already reserved by ${conflict.moduleKey}/${conflict.key}`,
      );
    }
    const now = Date.now();
    const reservation: PortReservation = {
      reservationId: `res_${this.nextReservationId++}`,
      moduleKey: args.moduleKey,
      key: args.key,
      port: args.port,
      host,
      protocol: decl.protocol,
      status: args.status ?? "reserved",
      ownerRef: args.ownerRef,
      createdAt: now,
      updatedAt: now,
    };
    this.reservations.set(reservation.reservationId, reservation);
    return reservation;
  }

  releasePort(reservationId: string): boolean {
    return this.reservations.delete(reservationId);
  }

  releaseByOwnerRef(moduleKey: string, key: string, ownerRef: string): number {
    let released = 0;
    for (const [id, res] of this.reservations) {
      if (
        res.moduleKey === moduleKey &&
        res.key === key &&
        res.ownerRef === ownerRef
      ) {
        this.reservations.delete(id);
        released++;
      }
    }
    return released;
  }

  updateReservationStatus(reservationId: string, status: PortHealthStatus): void {
    const res = this.reservations.get(reservationId);
    if (!res) return;
    res.status = status;
    res.updatedAt = Date.now();
  }

  listReservations(filter?: { moduleKey?: string; key?: string }): PortReservation[] {
    const all = Array.from(this.reservations.values());
    if (!filter) return all;
    return all.filter((r) =>
      (!filter.moduleKey || r.moduleKey === filter.moduleKey) &&
      (!filter.key || r.key === filter.key),
    );
  }

  /**
   * Returns one entry per static declaration collision (two `single`
   * declarations on the same host:port) plus one entry per pair of
   * reservations on the same host:port. Suitable for boot-time
   * fail-fast checks and for the check:ports script.
   */
  detectConflicts(): ConflictDetail[] {
    const conflicts: ConflictDetail[] = [];
    const seenDecl = new Map<string, ModulePortDeclaration>();
    for (const decl of this.declarations.values()) {
      if (decl.mode !== "single" || typeof decl.defaultPort !== "number") continue;
      const host = decl.defaultHost ?? "127.0.0.1";
      const key = `${host}:${decl.defaultPort}`;
      const prior = seenDecl.get(key);
      if (prior) {
        conflicts.push({
          declarationA: prior,
          declarationB: decl,
          host,
          port: decl.defaultPort,
          reason: `Two single-mode declarations claim ${key}`,
        });
      } else {
        seenDecl.set(key, decl);
      }
    }

    const byEndpoint = new Map<string, PortReservation[]>();
    for (const res of this.reservations.values()) {
      const key = `${res.host}:${res.port}`;
      const list = byEndpoint.get(key) ?? [];
      list.push(res);
      byEndpoint.set(key, list);
    }
    for (const [key, list] of byEndpoint) {
      if (list.length < 2) continue;
      const [host, portStr] = key.split(":");
      const port = Number(portStr);
      for (let i = 1; i < list.length; i++) {
        const a = list[0];
        const b = list[i];
        const declA = this.getDeclaration(a.moduleKey, a.key);
        if (!declA) continue;
        conflicts.push({
          declarationA: declA,
          reservationA: a,
          reservationB: b,
          host,
          port,
          reason: `Two reservations bound to ${key}`,
        });
      }
    }
    return conflicts;
  }

  snapshot(): PortStatusSnapshot[] {
    const conflicts = this.detectConflicts();
    const conflictsByDecl = new Map<string, ConflictDetail[]>();
    for (const c of conflicts) {
      const idA = declarationId(c.declarationA.moduleKey, c.declarationA.key);
      const listA = conflictsByDecl.get(idA) ?? [];
      listA.push(c);
      conflictsByDecl.set(idA, listA);
      if (c.declarationB) {
        const idB = declarationId(c.declarationB.moduleKey, c.declarationB.key);
        const listB = conflictsByDecl.get(idB) ?? [];
        listB.push(c);
        conflictsByDecl.set(idB, listB);
      }
    }

    return Array.from(this.declarations.values()).map((decl) => {
      const id = declarationId(decl.moduleKey, decl.key);
      const declConflicts = conflictsByDecl.get(id) ?? [];
      const reservations = this.listReservations({
        moduleKey: decl.moduleKey,
        key: decl.key,
      });

      let health: PortHealthStatus = "unknown";
      if (decl.mode === "disabled") health = "disabled";
      else if (declConflicts.length > 0) health = "conflict";
      else if (reservations.length > 0) {
        const allHealthy = reservations.every((r) => r.status === "healthy");
        const anyUnreachable = reservations.some((r) => r.status === "unreachable");
        if (anyUnreachable) health = "unreachable";
        else if (allHealthy) health = "healthy";
        else health = "reserved";
      }

      const url = renderUrl(decl, reservations[0]);
      return {
        moduleKey: decl.moduleKey,
        key: decl.key,
        label: decl.label,
        mode: decl.mode,
        protocol: decl.protocol,
        host: reservations[0]?.host ?? decl.defaultHost,
        port: reservations[0]?.port ?? decl.defaultPort,
        url,
        range: decl.defaultRange,
        health,
        conflictWith: declConflicts.flatMap((c) => {
          const out: Array<{ moduleKey: string; key: string }> = [];
          if (c.declarationB && declarationId(c.declarationB.moduleKey, c.declarationB.key) !== id) {
            out.push({ moduleKey: c.declarationB.moduleKey, key: c.declarationB.key });
          }
          if (c.declarationA && declarationId(c.declarationA.moduleKey, c.declarationA.key) !== id) {
            out.push({ moduleKey: c.declarationA.moduleKey, key: c.declarationA.key });
          }
          return out;
        }),
        reservations: reservations.length ? reservations : undefined,
        message: declConflicts[0]?.reason,
      };
    });
  }

  /**
   * Probe a host:port pair by attempting to bind to it. Returns true
   * if free. Mirrors server/_core/index.ts isPortAvailable so the
   * registry can replace it without behaviour drift.
   */
  async isPortFree(port: number, host = "127.0.0.1"): Promise<boolean> {
    return new Promise((resolve) => {
      const tester = net
        .createServer()
        .once("error", () => resolve(false))
        .once("listening", () => {
          tester.close(() => resolve(true));
        })
        .listen(port, host);
    });
  }

  /**
   * Find the next free port within the declared range for a
   * range-mode declaration, skipping ports already reserved by this
   * registry. Used by the OpenCode Web allocator and any future
   * range consumer.
   */
  async findFreePortInRange(
    moduleKey: string,
    key: string,
    host?: string,
  ): Promise<number | null> {
    const decl = this.getDeclaration(moduleKey, key);
    if (!decl || decl.mode !== "range" || !decl.defaultRange) {
      throw new Error(
        `findFreePortInRange: declaration ${moduleKey}/${key} not a range`,
      );
    }
    const [min, max] = decl.defaultRange;
    const targetHost = host ?? decl.defaultHost ?? "127.0.0.1";
    const reserved = new Set(
      this.listReservations({ moduleKey, key })
        .filter((r) => r.host === targetHost)
        .map((r) => r.port),
    );
    for (let port = min; port <= max; port++) {
      if (reserved.has(port)) continue;
      if (await this.isPortFree(port, targetHost)) return port;
    }
    return null;
  }

  /**
   * Find the next free port starting from a given port (single-mode
   * fallback). Mirrors server/_core/index.ts findAvailablePort.
   * `attempts` defaults to 20 to match the legacy behaviour.
   */
  async findFreePortFrom(
    startPort: number,
    options: { host?: string; attempts?: number } = {},
  ): Promise<number | null> {
    const host = options.host ?? "127.0.0.1";
    const attempts = options.attempts ?? 20;
    for (let i = 0; i < attempts; i++) {
      const candidate = startPort + i;
      if (await this.isPortFree(candidate, host)) return candidate;
    }
    return null;
  }

  private findReservationConflict(host: string, port: number): PortReservation | undefined {
    for (const res of this.reservations.values()) {
      if (res.host === host && res.port === port) return res;
    }
    return undefined;
  }

  /**
   * Test-only reset. The registry is a process singleton; this lets
   * vitest start each test from a clean slate.
   */
  __resetForTests(): void {
    this.declarations.clear();
    this.reservations.clear();
    this.nextReservationId = 1;
  }
}

function declarationId(moduleKey: string, key: string): string {
  return `${moduleKey}/${key}`;
}

function sameShape(a: ModulePortDeclaration, b: ModulePortDeclaration): boolean {
  return (
    a.mode === b.mode &&
    a.protocol === b.protocol &&
    a.defaultPort === b.defaultPort &&
    a.defaultHost === b.defaultHost &&
    a.defaultUrl === b.defaultUrl &&
    JSON.stringify(a.defaultRange) === JSON.stringify(b.defaultRange) &&
    a.env === b.env &&
    a.envBase === b.envBase &&
    a.envMax === b.envMax
  );
}

function renderUrl(
  decl: ModulePortDeclaration,
  res?: PortReservation,
): string | undefined {
  if (decl.defaultUrl && !res) return decl.defaultUrl;
  if (!res && typeof decl.defaultPort !== "number") return undefined;
  const host = res?.host ?? decl.defaultHost ?? "127.0.0.1";
  const port = res?.port ?? decl.defaultPort;
  if (typeof port !== "number") return undefined;
  switch (decl.protocol) {
    case "http":
      return `http://${host}:${port}`;
    case "https":
      return `https://${host}:${port}`;
    case "ws":
      return `ws://${host}:${port}`;
    case "wss":
      return `wss://${host}:${port}`;
    case "postgres":
      return `postgres://${host}:${port}`;
    case "tcp":
    case "custom":
      return `${decl.protocol}://${host}:${port}`;
  }
}

let singleton: PortRegistry | null = null;

export function getPortRegistry(): PortRegistry {
  if (!singleton) singleton = new PortRegistry();
  return singleton;
}

export function __resetPortRegistryForTests(): void {
  if (singleton) singleton.__resetForTests();
  singleton = null;
}

export type { ConflictDetail, PortRegistry };
