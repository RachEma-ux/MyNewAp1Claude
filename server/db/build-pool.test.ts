import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPoolWithErrorLogger } from "./build-pool";

describe("buildPoolWithErrorLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a pg.Pool with an error listener attached", () => {
    const pool = buildPoolWithErrorLogger(
      "postgresql://localhost:5432/nonexistent_test_db",
      "Database",
    );
    try {
      expect(pool.listenerCount("error")).toBeGreaterThanOrEqual(1);
    } finally {
      void pool.end();
    }
  });

  it("suppresses an emitted 'error' event so the process is not crashed", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const pool = buildPoolWithErrorLogger(
      "postgresql://localhost:5432/nonexistent_test_db",
      "ASDB",
    );
    try {
      const err = new Error("simulated idle client error");
      expect(() => pool.emit("error", err)).not.toThrow();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[ASDB] idle pg client error"),
        "simulated idle client error",
      );
    } finally {
      void pool.end();
    }
  });

  it("logs with the given label prefix", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const pool = buildPoolWithErrorLogger(
      "postgresql://localhost:5432/nonexistent_test_db",
      "MyCustomLabel",
    );
    try {
      pool.emit("error", new Error("boom"));
      const calls = errorSpy.mock.calls.flat().map(String);
      expect(calls.some((s) => s.includes("[MyCustomLabel]"))).toBe(true);
    } finally {
      void pool.end();
    }
  });

  it("renders non-Error throwables via String() without crashing", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const pool = buildPoolWithErrorLogger(
      "postgresql://localhost:5432/nonexistent_test_db",
      "Database",
    );
    try {
      expect(() => pool.emit("error", "string-shaped error" as never)).not.toThrow();
      const calls = errorSpy.mock.calls.flat().map(String);
      expect(calls.some((s) => s.includes("string-shaped error"))).toBe(true);
    } finally {
      void pool.end();
    }
  });
});
