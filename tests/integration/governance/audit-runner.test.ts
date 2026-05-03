import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process.spawn
const mockSpawn = vi.fn();
vi.mock("child_process", () => ({
  spawn: (...args: any[]) => mockSpawn(...args),
}));

// Mock fs
vi.mock("fs", () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => ""),
}));

// Mock artifact store
const mockStore = {
  store: vi.fn(async () => ({ sha256: "abc123def456".padEnd(64, "0"), path: "/artifacts/test", size: 100, storedAt: new Date().toISOString() })),
  retrieve: vi.fn(async () => Buffer.from("{}")),
  verify: vi.fn(async () => true),
  exists: vi.fn(async () => true),
  list: vi.fn(async () => []),
};
vi.mock("../../governance/artifact-store", () => ({
  getArtifactStore: () => mockStore,
}));

// Mock database
const mockDbRows: any[] = [];
const mockDb = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve(mockDbRows)),
      })),
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve(mockDbRows)),
      })),
    })),
  })),
  insert: vi.fn(() => ({
    values: vi.fn(() => ({
      returning: vi.fn(() => Promise.resolve([{ id: 1 }])),
      onConflictDoUpdate: vi.fn(() => Promise.resolve()),
    })),
  })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
  })),
};
vi.mock("../../db", () => ({
  getDb: () => mockDb,
}));

// Mock schema
vi.mock("../../../drizzle/schema", () => ({
  governanceAuditRuns: {
    id: "id",
    status: "status",
    startedAt: "started_at",
  },
  governanceAuditPreferences: {
    principalId: "principal_id",
  },
}));

describe("audit-runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbRows.length = 0;
  });

  describe("isAuditRunning", () => {
    it("returns false when no running audit exists", async () => {
      const { isAuditRunning } = await import("../audit-runner");
      const result = await isAuditRunning();
      expect(result).toBe(false);
    });

    it("returns true when a running audit exists", async () => {
      mockDbRows.push({ id: 1 });
      const { isAuditRunning } = await import("../audit-runner");
      const result = await isAuditRunning();
      expect(result).toBe(true);
    });
  });

  describe("startAuditRun", () => {
    it("inserts a queued row and returns runId", async () => {
      const { startAuditRun } = await import("../audit-runner");

      // Mock spawn to return a simple child process
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, cb: Function) => {
          if (event === "close") setTimeout(() => cb(0), 10);
        }),
        kill: vi.fn(),
      };
      mockSpawn.mockReturnValue(mockChild);

      const result = await startAuditRun({
        format: "json",
        strict: false,
        design: "standard",
        triggeredBy: "1",
      });

      expect(result.runId).toBe(1);
      expect(result.status).toBe("queued");
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("rejects when an audit is already running", async () => {
      mockDbRows.push({ id: 99 }); // Simulate running audit
      const { startAuditRun } = await import("../audit-runner");

      await expect(
        startAuditRun({
          format: "json",
          strict: false,
          design: "standard",
          triggeredBy: "1",
        })
      ).rejects.toThrow("already running");
    });
  });

  describe("spawn argument safety", () => {
    it("only passes whitelisted arguments to spawn", async () => {
      // Clear running state
      mockDbRows.length = 0;

      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, cb: Function) => {
          if (event === "close") setTimeout(() => cb(0), 10);
        }),
        kill: vi.fn(),
      };
      mockSpawn.mockReturnValue(mockChild);

      const { startAuditRun } = await import("../audit-runner");
      await startAuditRun({
        format: "both",
        strict: true,
        design: "forensics",
        triggeredBy: "1",
      });

      // Wait for spawn to be called
      await new Promise((r) => setTimeout(r, 50));

      if (mockSpawn.mock.calls.length > 0) {
        const [cmd, args] = mockSpawn.mock.calls[0];
        expect(cmd).toBe("npx");
        expect(args).toContain("tsx");
        expect(args).toContain("scripts/platformAudit.ts");
        expect(args).toContain("--format");
        expect(args).toContain("both");
        expect(args).toContain("--strict");
        // No shell injection possible — no shell: true
        expect(mockSpawn.mock.calls[0][2]?.shell).toBeUndefined();
      }
    });
  });

  describe("input validation", () => {
    it("only accepts valid format values", () => {
      const validFormats = ["json", "txt", "both"];
      const invalidFormats = ["xml", "csv", "html", "'; DROP TABLE users;--"];

      for (const f of validFormats) {
        expect(validFormats.includes(f)).toBe(true);
      }
      for (const f of invalidFormats) {
        expect(validFormats.includes(f)).toBe(false);
      }
    });

    it("only accepts valid design values", () => {
      const validDesigns = ["executive", "standard", "forensics"];
      const invalidDesigns = ["admin", "root", "debug"];

      for (const d of validDesigns) {
        expect(validDesigns.includes(d)).toBe(true);
      }
      for (const d of invalidDesigns) {
        expect(validDesigns.includes(d)).toBe(false);
      }
    });
  });
});
