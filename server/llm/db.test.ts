import { describe, it, expect, beforeEach, vi } from "vitest";
import * as llmDb from "./db";
import { getDb } from "../db";

// Mock the database
vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

describe("LLM Database Operations", () => {
  const mockDb = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    as: vi.fn().mockReturnThis(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getDb as any).mockReturnValue(mockDb);
  });

  describe("createLlm", () => {
    it("should create a new LLM and return it", async () => {
      const mockLlm = {
        id: 1,
        name: "Test LLM",
        description: "Test Description",
        runtime: "local" as const,
        provider: "ollama",
        archived: false,
        createdBy: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.returning.mockResolvedValue([mockLlm]);

      const result = await llmDb.createLlm({
        name: "Test LLM",
        description: "Test Description",
        runtime: "local",
        provider: "ollama",
        createdBy: 1,
      });

      expect(result).toEqual(mockLlm);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalled();
      expect(mockDb.returning).toHaveBeenCalled();
    });
  });

  describe("getLlmById", () => {
    it("should return LLM when found", async () => {
      const mockLlm = {
        id: 1,
        name: "Test LLM",
        runtime: "local" as const,
        archived: false,
      };

      mockDb.from.mockReturnValue({
        ...mockDb,
        where: vi.fn().mockResolvedValue([mockLlm]),
      });

      const result = await llmDb.getLlmById(1);

      expect(result).toEqual(mockLlm);
    });

    it("should return undefined when LLM not found", async () => {
      mockDb.from.mockReturnValue({
        ...mockDb,
        where: vi.fn().mockResolvedValue([]),
      });

      const result = await llmDb.getLlmById(999);

      expect(result).toBeUndefined();
    });
  });

  describe("archiveLlm", () => {
    it("should set archived flag to true", async () => {
      mockDb.where.mockResolvedValue(undefined);

      await llmDb.archiveLlm(1);

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith({ archived: true });
      expect(mockDb.where).toHaveBeenCalled();
    });
  });

  describe("deleteLlm", () => {
    it("should delete all versions then delete the LLM", async () => {
      mockDb.where.mockResolvedValue(undefined);

      await llmDb.deleteLlm(1);

      expect(mockDb.delete).toHaveBeenCalledTimes(2);
      expect(mockDb.where).toHaveBeenCalledTimes(2);
    });
  });

  describe("createLlmVersion", () => {
    it("should create a new version and return it", async () => {
      const mockVersion = {
        id: 1,
        llmId: 1,
        version: 1,
        config: { model: "llama2" },
        changeNotes: "Initial version",
        changeType: "created" as const,
        createdBy: 1,
        createdAt: new Date(),
      };

      mockDb.returning.mockResolvedValue([mockVersion]);

      const result = await llmDb.createLlmVersion({
        llmId: 1,
        version: 1,
        config: { model: "llama2" },
        changeNotes: "Initial version",
        changeType: "created",
        createdBy: 1,
      });

      expect(result).toEqual(mockVersion);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalled();
      expect(mockDb.returning).toHaveBeenCalled();
    });
  });

  describe("getLatestLlmVersion", () => {
    it("should return the latest version", async () => {
      const mockVersion = {
        id: 3,
        llmId: 1,
        version: 3,
        config: { model: "llama2-v3" },
      };

      mockDb.limit.mockResolvedValue([mockVersion]);

      const result = await llmDb.getLatestLlmVersion(1);

      expect(result).toEqual(mockVersion);
      expect(mockDb.orderBy).toHaveBeenCalled();
      expect(mockDb.limit).toHaveBeenCalledWith(1);
    });

    it("should return undefined when no versions exist", async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await llmDb.getLatestLlmVersion(1);

      expect(result).toBeUndefined();
    });
  });

  describe("getNextVersionNumber", () => {
    it("should return next version number", async () => {
      const mockVersion = {
        id: 2,
        llmId: 1,
        version: 2,
      };

      mockDb.limit.mockResolvedValue([mockVersion]);

      const result = await llmDb.getNextVersionNumber(1);

      expect(result).toBe(3);
    });

    it("should return 1 when no versions exist", async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await llmDb.getNextVersionNumber(1);

      expect(result).toBe(1);
    });
  });

  describe("listLlmsWithLatestVersions", () => {
    it("should return all LLMs with their latest versions using a single query", async () => {
      const mockResults = [
        {
          llm: { id: 1, name: "LLM 1", runtime: "local" as const },
          version: { id: 1, llmId: 1, version: 1, config: {} },
        },
        {
          llm: { id: 2, name: "LLM 2", runtime: "cloud" as const },
          version: { id: 2, llmId: 2, version: 2, config: {} },
        },
      ];

      // Mock the query chain for the optimized JOIN query
      mockDb.orderBy.mockResolvedValue(mockResults);

      const result = await llmDb.listLlmsWithLatestVersions(false);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("llm");
      expect(result[0]).toHaveProperty("version");
      // Verify we're using JOIN instead of multiple queries
      expect(mockDb.leftJoin).toHaveBeenCalled();
    });

    it("should handle LLMs without versions", async () => {
      const mockResults = [
        {
          llm: { id: 1, name: "LLM 1", runtime: "local" as const },
          version: null,
        },
      ];

      mockDb.orderBy.mockResolvedValue(mockResults);

      const result = await llmDb.listLlmsWithLatestVersions(false);

      expect(result).toHaveLength(1);
      expect(result[0].version).toBeUndefined();
    });

    it("should include archived LLMs when requested", async () => {
      const mockResults = [
        {
          llm: { id: 1, name: "LLM 1", runtime: "local" as const, archived: true },
          version: { id: 1, llmId: 1, version: 1, config: {} },
        },
      ];

      mockDb.orderBy.mockResolvedValue(mockResults);

      const result = await llmDb.listLlmsWithLatestVersions(true);

      expect(result).toHaveLength(1);
      // Verify archived filter was not applied
      expect(mockDb.where).not.toHaveBeenCalled();
    });
  });
});
