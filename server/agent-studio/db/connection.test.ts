// F5-followup (2026-05-23): ASDB connection-layer guard test.
//
// Covers the "refuse to lazy-init when no usable URL is configured
// and we're not under NODE_ENV=test" branch added as the close-out
// for the post-#1688/#1689 verification fix plan. The pure URL
// resolver is exercised via the `__testing__` export so this suite
// stays cheap (no actual pg.Pool is opened on the refused path).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __testing__, getAsDb, resetAsDb } from "./connection";

const ORIGINAL_ENV = {
  DATABASE_URL_ASDB: process.env.DATABASE_URL_ASDB,
  DATABASE_URL: process.env.DATABASE_URL,
  NODE_ENV: process.env.NODE_ENV,
};

function setEnv(patch: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe("resolveAsDbUrl", () => {
  beforeEach(() => {
    setEnv({
      DATABASE_URL_ASDB: undefined,
      DATABASE_URL: undefined,
    });
  });

  afterEach(() => {
    setEnv(ORIGINAL_ENV);
  });

  it("prefers DATABASE_URL_ASDB when set", () => {
    setEnv({ DATABASE_URL_ASDB: "postgresql://user@host/asdb" });
    expect(__testing__.resolveAsDbUrl()).toEqual({
      url: "postgresql://user@host/asdb",
      source: "explicit",
    });
  });

  it("derives /asdb from DATABASE_URL when ASDB var is unset", () => {
    setEnv({
      DATABASE_URL: "postgresql://user@host/mynewap1claude",
    });
    expect(__testing__.resolveAsDbUrl()).toEqual({
      url: "postgresql://user@host/asdb",
      source: "derived",
    });
  });

  it("treats empty string DATABASE_URL_ASDB as unset", () => {
    setEnv({
      DATABASE_URL_ASDB: "",
      DATABASE_URL: "postgresql://user@host/main",
    });
    expect(__testing__.resolveAsDbUrl().source).toBe("derived");
  });

  it("falls back to the hardcoded literal when both are unset", () => {
    expect(__testing__.resolveAsDbUrl()).toEqual({
      url: "postgresql://localhost:5432/asdb",
      source: "literal",
    });
  });
});

describe("getAsDb F5-followup guard", () => {
  beforeEach(() => {
    resetAsDb();
    setEnv({
      DATABASE_URL_ASDB: undefined,
      DATABASE_URL: undefined,
    });
  });

  afterEach(() => {
    setEnv(ORIGINAL_ENV);
    resetAsDb();
  });

  it("refuses to init and returns null when no usable URL is configured and NODE_ENV is not 'test'", () => {
    setEnv({ NODE_ENV: "production" });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const db = getAsDb();
      expect(db).toBeNull();
      const messages = errSpy.mock.calls.flat().map(String);
      expect(
        messages.some((m) =>
          m.includes("DATABASE_URL_ASDB unset — refusing to init"),
        ),
      ).toBe(true);
    } finally {
      errSpy.mockRestore();
    }
  });

  it("does not refuse under NODE_ENV=test even with both vars unset", () => {
    setEnv({ NODE_ENV: "test" });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // The literal-fallback path is allowed in test; the call may
      // succeed or fail at pg layer, but the refusal path must NOT
      // be the reason for any null return.
      getAsDb();
      const refused = errSpy.mock.calls
        .flat()
        .map(String)
        .some((m) => m.includes("refusing to init"));
      expect(refused).toBe(false);
    } finally {
      errSpy.mockRestore();
    }
  });

  it("does not refuse when DATABASE_URL is set (derivation path)", () => {
    setEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user@unreachable-host/main",
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // Connection may fail at pg layer (host doesn't exist) but the
      // refusal branch is gated on `source === "literal"`, not on
      // whether the pool can actually connect.
      getAsDb();
      const refused = errSpy.mock.calls
        .flat()
        .map(String)
        .some((m) => m.includes("refusing to init"));
      expect(refused).toBe(false);
    } finally {
      errSpy.mockRestore();
    }
  });
});
