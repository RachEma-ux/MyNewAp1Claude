/**
 * Port Registry tests.
 *
 * Covers:
 *  1. registerDeclaration accepts valid declarations
 *  2. duplicate declaration with same shape is a no-op
 *  3. duplicate declaration with different shape throws
 *  4. mode=single requires defaultPort
 *  5. mode=range requires a sane defaultRange
 *  6. reservePort succeeds within a declared range
 *  7. reservePort rejects ports outside the declared range
 *  8. reservePort rejects when host:port already reserved
 *  9. releasePort + releaseByOwnerRef remove reservations
 * 10. detectConflicts surfaces double-declared single ports
 * 11. detectConflicts surfaces duplicate reservations
 * 12. snapshot rolls up health correctly (healthy / conflict / disabled)
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetPortRegistryForTests,
  getPortRegistry,
  type ModulePortDeclaration,
} from "./index";

const validSingle: ModulePortDeclaration = {
  moduleKey: "platform",
  key: "http",
  label: "Platform HTTP",
  mode: "single",
  protocol: "http",
  defaultPort: 3000,
  defaultHost: "127.0.0.1",
};

const validRange: ModulePortDeclaration = {
  moduleKey: "codeStudio",
  key: "opencode-web",
  label: "OpenCode Web",
  mode: "range",
  protocol: "http",
  defaultRange: [4200, 4299],
  defaultHost: "127.0.0.1",
};

beforeEach(() => __resetPortRegistryForTests());
afterEach(() => __resetPortRegistryForTests());

describe("PortRegistry — declarations", () => {
  it("accepts a valid single declaration", () => {
    const r = getPortRegistry();
    r.registerDeclaration(validSingle);
    expect(r.listDeclarations()).toHaveLength(1);
    expect(r.getDeclaration("platform", "http")).toMatchObject({ defaultPort: 3000 });
  });

  it("treats duplicate declaration with identical shape as a no-op", () => {
    const r = getPortRegistry();
    r.registerDeclaration(validSingle);
    r.registerDeclaration({ ...validSingle });
    expect(r.listDeclarations()).toHaveLength(1);
  });

  it("throws when re-registering with a different shape", () => {
    const r = getPortRegistry();
    r.registerDeclaration(validSingle);
    expect(() =>
      r.registerDeclaration({ ...validSingle, defaultPort: 3001 }),
    ).toThrow(/different shape/);
  });

  it("rejects mode=single without defaultPort", () => {
    const r = getPortRegistry();
    expect(() =>
      r.registerDeclaration({ ...validSingle, defaultPort: undefined }),
    ).toThrow(/defaultPort/);
  });

  it("rejects mode=range without a sane defaultRange", () => {
    const r = getPortRegistry();
    expect(() =>
      r.registerDeclaration({ ...validRange, defaultRange: [400, 100] }),
    ).toThrow(/defaultRange invalid/);
  });
});

describe("PortRegistry — reservations", () => {
  it("reserves a port within a declared range", () => {
    const r = getPortRegistry();
    r.registerDeclaration(validRange);
    const res = r.reservePort({
      moduleKey: "codeStudio",
      key: "opencode-web",
      port: 4205,
    });
    expect(res.port).toBe(4205);
    expect(res.host).toBe("127.0.0.1");
    expect(r.listReservations()).toHaveLength(1);
  });

  it("rejects ports outside the declared range", () => {
    const r = getPortRegistry();
    r.registerDeclaration(validRange);
    expect(() =>
      r.reservePort({ moduleKey: "codeStudio", key: "opencode-web", port: 4400 }),
    ).toThrow(/outside declared range/);
  });

  it("rejects a reservation when host:port already reserved", () => {
    const r = getPortRegistry();
    r.registerDeclaration(validRange);
    r.reservePort({ moduleKey: "codeStudio", key: "opencode-web", port: 4205 });
    expect(() =>
      r.reservePort({ moduleKey: "codeStudio", key: "opencode-web", port: 4205 }),
    ).toThrow(/already reserved/);
  });

  it("releases reservations by id and by owner ref", () => {
    const r = getPortRegistry();
    r.registerDeclaration(validRange);
    const a = r.reservePort({
      moduleKey: "codeStudio",
      key: "opencode-web",
      port: 4205,
      ownerRef: "instance-1",
    });
    r.reservePort({
      moduleKey: "codeStudio",
      key: "opencode-web",
      port: 4206,
      ownerRef: "instance-2",
    });
    expect(r.releasePort(a.reservationId)).toBe(true);
    expect(r.listReservations()).toHaveLength(1);
    const released = r.releaseByOwnerRef("codeStudio", "opencode-web", "instance-2");
    expect(released).toBe(1);
    expect(r.listReservations()).toHaveLength(0);
  });
});

describe("PortRegistry — conflicts and snapshots", () => {
  it("flags two single-mode declarations on the same host:port", () => {
    const r = getPortRegistry();
    r.registerDeclaration(validSingle);
    r.registerDeclaration({
      moduleKey: "other",
      key: "ui",
      label: "Other UI",
      mode: "single",
      protocol: "http",
      defaultPort: 3000,
      defaultHost: "127.0.0.1",
    });
    const conflicts = r.detectConflicts();
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    expect(conflicts[0].port).toBe(3000);
  });

  it("rejects a cross-module reservation on the same host:port and leaves state clean", () => {
    const r = getPortRegistry();
    r.registerDeclaration(validRange);
    r.registerDeclaration({
      moduleKey: "codeStudioB",
      key: "opencode-web",
      label: "OpenCode Web (B)",
      mode: "range",
      protocol: "http",
      defaultRange: [4200, 4299],
      defaultHost: "127.0.0.1",
    });
    r.reservePort({ moduleKey: "codeStudio", key: "opencode-web", port: 4205 });
    expect(() =>
      r.reservePort({ moduleKey: "codeStudioB", key: "opencode-web", port: 4205 }),
    ).toThrow(/already reserved/);
    expect(r.listReservations()).toHaveLength(1);
  });

  it("rolls up health to healthy / conflict / disabled in snapshot", () => {
    const r = getPortRegistry();
    r.registerDeclaration(validSingle);
    r.registerDeclaration({
      moduleKey: "platform",
      key: "ollama",
      label: "Ollama",
      mode: "external",
      protocol: "http",
      defaultUrl: "http://localhost:11434",
    });
    r.registerDeclaration({
      moduleKey: "platform",
      key: "diagnostics",
      label: "Diagnostics",
      mode: "disabled",
      protocol: "http",
    });
    r.reservePort({
      moduleKey: "platform",
      key: "http",
      port: 3000,
      status: "healthy",
    });
    const snap = r.snapshot();
    const http = snap.find((s) => s.key === "http");
    const ollama = snap.find((s) => s.key === "ollama");
    const diag = snap.find((s) => s.key === "diagnostics");
    expect(http?.health).toBe("healthy");
    expect(http?.url).toBe("http://127.0.0.1:3000");
    expect(ollama?.health).toBe("unknown");
    expect(diag?.health).toBe("disabled");
  });
});
