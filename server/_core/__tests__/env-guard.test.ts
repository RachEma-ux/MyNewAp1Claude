import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("DEV_MODE production startup guard", () => {
  const originalEnv = { ...process.env };
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Reset module registry so env.ts re-evaluates on each import
    vi.resetModules();
    // Spy on process.exit to prevent actual exit
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("should exit when DEV_MODE=true and NODE_ENV=production", async () => {
    process.env.DEV_MODE = "true";
    process.env.NODE_ENV = "production";

    await import("../env.ts");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("DEV_MODE=true is not allowed")
    );
  });

  it("should NOT exit when DEV_MODE=true and NODE_ENV=development", async () => {
    process.env.DEV_MODE = "true";
    process.env.NODE_ENV = "development";

    await import("../env.ts");

    expect(exitSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("DEV_MODE=true")
    );
  });

  it("should NOT exit when NODE_ENV=production without DEV_MODE", async () => {
    delete process.env.DEV_MODE;
    process.env.NODE_ENV = "production";

    await import("../env.ts");

    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("should NOT exit when neither DEV_MODE nor production", async () => {
    delete process.env.DEV_MODE;
    process.env.NODE_ENV = "development";

    await import("../env.ts");

    expect(exitSpy).not.toHaveBeenCalled();
  });
});
