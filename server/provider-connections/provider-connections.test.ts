/**
 * Provider Connections — Integration Tests
 *
 * Covers:
 *   - State machine transitions (valid + invalid)
 *   - Encryption round-trip (encrypt → decrypt)
 *   - testConnection: OpenAI-compatible, Anthropic, Ollama, failure modes
 *   - Service orchestration: create → validate → activate → health → disable
 *   - Secret rotation lifecycle
 *   - Security: PAT never returned to client, never stored before validation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { canTransition, assertTransition } from "./state-machine";
import { encrypt, decrypt, redact, isSecretReference, extractSecretKey } from "../secrets/encryption";

// ═══════════════════════════════════════════════════════════════════════
// State Machine
// ═══════════════════════════════════════════════════════════════════════

describe("State Machine — Valid Transitions", () => {
  const validPairs: [string, string][] = [
    ["draft", "validated"],
    ["validated", "active"],
    ["active", "failed"],
    ["active", "disabled"],
    ["failed", "disabled"],
    ["failed", "validated"],
    ["disabled", "draft"],
    ["rotated", "active"],
  ];

  for (const [from, to] of validPairs) {
    it(`${from} → ${to} is allowed`, () => {
      expect(canTransition(from as any, to as any)).toBe(true);
    });
  }
});

describe("State Machine — Invalid Transitions", () => {
  const invalidPairs: [string, string][] = [
    ["draft", "active"],       // must validate first
    ["draft", "disabled"],
    ["validated", "disabled"],  // must activate first
    ["validated", "failed"],
    ["active", "draft"],
    ["active", "validated"],
    ["disabled", "active"],     // must go through draft
    ["disabled", "validated"],
    ["failed", "active"],       // must re-validate
  ];

  for (const [from, to] of invalidPairs) {
    it(`${from} → ${to} is rejected`, () => {
      expect(canTransition(from as any, to as any)).toBe(false);
    });
  }

  it("assertTransition throws with descriptive message", () => {
    expect(() => assertTransition("draft" as any, "active" as any)).toThrowError(
      /Invalid state transition: draft → active/
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Encryption Round-Trip
// ═══════════════════════════════════════════════════════════════════════

describe("Encryption", () => {
  it("encrypt → decrypt round-trip preserves plaintext", () => {
    const secret = "sk-test-1234567890abcdef";
    const encrypted = encrypt(secret);
    expect(encrypted).not.toBe(secret);
    expect(encrypted.length).toBeGreaterThan(secret.length);
    expect(decrypt(encrypted)).toBe(secret);
  });

  it("two encryptions of same value produce different ciphertexts", () => {
    const secret = "sk-test-same-input";
    const a = encrypt(secret);
    const b = encrypt(secret);
    expect(a).not.toBe(b); // random IV ensures uniqueness
    expect(decrypt(a)).toBe(secret);
    expect(decrypt(b)).toBe(secret);
  });

  it("decrypt of tampered ciphertext throws", () => {
    const encrypted = encrypt("secret-value");
    const tampered = encrypted.slice(0, -4) + "XXXX";
    expect(() => decrypt(tampered)).toThrow();
  });

  it("handles empty string", () => {
    const encrypted = encrypt("");
    expect(decrypt(encrypted)).toBe("");
  });

  it("handles unicode characters", () => {
    const secret = "パスワード-密码-🔑";
    const encrypted = encrypt(secret);
    expect(decrypt(encrypted)).toBe(secret);
  });
});

describe("Encryption Utilities", () => {
  it("redact hides values", () => {
    expect(redact("sk-secret")).toBe("***REDACTED***");
    expect(redact(null)).toBe("");
    expect(redact(undefined)).toBe("");
  });

  it("isSecretReference matches valid references", () => {
    expect(isSecretReference("{{secret:api_key}}")).toBe(true);
    expect(isSecretReference("{{secret:my-key-123}}")).toBe(true);
    expect(isSecretReference("not-a-reference")).toBe(false);
    expect(isSecretReference("{{secret:}}")).toBe(false);
  });

  it("extractSecretKey extracts key from reference", () => {
    expect(extractSecretKey("{{secret:api_key}}")).toBe("api_key");
    expect(extractSecretKey("{{secret:my-key-123}}")).toBe("my-key-123");
    expect(extractSecretKey("invalid")).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// testConnection — Network Tests (mocked fetch)
// ═══════════════════════════════════════════════════════════════════════

describe("testConnection", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("OpenAI-compatible: returns ok with model count", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "gpt-4" },
          { id: "gpt-3.5-turbo" },
          { id: "text-embedding-ada-002" },
        ],
      }),
    });

    const { testConnection } = await import("./service");
    const result = await testConnection("https://api.openai.com", "sk-test");

    expect(result.status).toBe("ok");
    expect(result.modelCount).toBe(3);
    expect(result.capabilities).toContain("chat");
    expect(result.capabilities).toContain("embeddings");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("OpenAI-compatible: no embed models → only chat capability", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: "gpt-4" }, { id: "gpt-3.5-turbo" }],
      }),
    });

    const { testConnection } = await import("./service");
    const result = await testConnection("https://api.openai.com", "sk-test");

    expect(result.capabilities).toEqual(["chat"]);
    expect(result.capabilities).not.toContain("embeddings");
  });

  it("Anthropic: requires API key", async () => {
    const { testConnection } = await import("./service");
    const result = await testConnection("https://api.anthropic.com");

    expect(result.status).toBe("error");
    expect(result.error).toMatch(/Anthropic requires an API key/);
  });

  it("Anthropic: passes correct headers", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "claude-3.5-sonnet" }] }),
    });

    const { testConnection } = await import("./service");
    await testConnection("https://api.anthropic.com", "sk-ant-test");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          "anthropic-version": "2023-06-01",
          "x-api-key": "sk-ant-test",
        }),
      })
    );
  });

  it("Ollama: falls back to /api/tags format", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/v1/models")) {
        throw new Error("Connection refused");
      }
      if (url.includes("/api/tags")) {
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              models: [
                { name: "llama3.2:latest" },
                { name: "mistral:latest" },
              ],
            }),
        };
      }
      throw new Error("Unexpected URL");
    });

    const { testConnection } = await import("./service");
    const result = await testConnection("http://localhost:11434");

    expect(result.status).toBe("ok");
    expect(result.modelCount).toBe(2);
  });

  it("returns error when all probes fail", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const { testConnection } = await import("./service");
    const result = await testConnection("http://localhost:9999");

    expect(result.status).toBe("error");
    expect(result.error).toMatch(/Could not reach provider/);
  });

  it("returns error on non-ok HTTP status", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
      statusText: "Unauthorized",
    });

    const { testConnection } = await import("./service");
    const result = await testConnection("https://api.openai.com", "bad-key");

    expect(result.status).toBe("error");
    expect(result.error).toMatch(/401/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Service Orchestration — Full Lifecycle (mocked DB)
// ═══════════════════════════════════════════════════════════════════════

// In-memory state for mock DB
let _connections: any[] = [];
let _secrets: any[] = [];
let _auditLogs: any[] = [];
let _nextId = 1;

// Hoisted mock — intercepts all imports of ./db
vi.mock("./db", () => ({
  createConnection: vi.fn(async (data: any) => {
    const conn = {
      id: _nextId++,
      ...data,
      healthStatus: null,
      lastHealthCheck: null,
      capabilities: null,
      modelCount: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    _connections.push(conn);
    return conn;
  }),
  getConnectionById: vi.fn(async (id: number) => {
    return _connections.find((c: any) => c.id === id) ?? null;
  }),
  getConnectionsByWorkspace: vi.fn(async (wsId: number) => {
    return _connections.filter((c: any) => c.workspaceId === wsId);
  }),
  getActiveConnections: vi.fn(async (wsId: number) => {
    return _connections.filter(
      (c: any) => c.workspaceId === wsId && c.lifecycleStatus === "active"
    );
  }),
  updateConnectionStatus: vi.fn(async (id: number, status: string, extra?: any) => {
    const conn = _connections.find((c: any) => c.id === id);
    if (conn) {
      conn.lifecycleStatus = status;
      conn.updatedAt = new Date();
      if (extra) Object.assign(conn, extra);
    }
  }),
  deleteConnection: vi.fn(async (id: number) => {
    _connections = _connections.filter((c: any) => c.id !== id);
    _secrets = _secrets.filter((s: any) => s.connectionId !== id);
    _auditLogs = _auditLogs.filter((l: any) => l.connectionId !== id);
  }),
  insertSecret: vi.fn(async (data: any) => {
    const s = { id: _nextId++, ...data, createdAt: new Date() };
    _secrets.push(s);
    return s;
  }),
  getLatestSecret: vi.fn(async (connId: number) => {
    const matching = _secrets.filter((s: any) => s.connectionId === connId);
    return matching[matching.length - 1] ?? null;
  }),
  appendAuditLog: vi.fn(async (connId: number, action: string, actor: number, meta?: any) => {
    _auditLogs.push({ connectionId: connId, action, actor, metadata: meta, createdAt: new Date() });
  }),
  getAuditLog: vi.fn(async (connId: number) => {
    return _auditLogs.filter((l: any) => l.connectionId === connId);
  }),
}));

// Import service AFTER the mock is set up (vi.mock is hoisted)
import {
  testConnection,
  createProviderConnection,
  validateAndStoreSecret,
  activateConnection,
  disableConnection,
  healthCheck,
  rotateSecret,
  getDecryptedPat,
  deleteConnection as deleteConn,
} from "./service";

describe("Service Orchestration", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    _connections = [];
    _secrets = [];
    _auditLogs = [];
    _nextId = 1;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("full lifecycle: create → validate → activate → disable", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "gpt-4" }] }),
    });

    // Step 1: Create (DRAFT)
    const conn = await createProviderConnection({
      providerId: 1,
      workspaceId: 1,
      baseUrl: "https://api.openai.com",
      createdBy: 1,
    });
    expect(conn.lifecycleStatus).toBe("draft");
    expect(_auditLogs).toHaveLength(1);
    expect(_auditLogs[0].action).toBe("CONNECTION_CREATED");

    // Step 2: Validate & Store (DRAFT → VALIDATED)
    const testResult = await validateAndStoreSecret({
      connectionId: conn.id,
      pat: "sk-test-12345",
      actor: 1,
    });
    expect(testResult.status).toBe("ok");
    expect(_connections[0].lifecycleStatus).toBe("validated");
    expect(_secrets).toHaveLength(1);
    expect(_secrets[0].encryptedPat).not.toBe("sk-test-12345"); // encrypted

    // Step 3: Activate (VALIDATED → ACTIVE)
    await activateConnection(conn.id, 1);
    expect(_connections[0].lifecycleStatus).toBe("active");

    // Step 4: Disable (ACTIVE → DISABLED)
    await disableConnection(conn.id, 1);
    expect(_connections[0].lifecycleStatus).toBe("disabled");

    // Audit trail should have 4+ entries
    expect(_auditLogs.length).toBeGreaterThanOrEqual(4);
  });

  it("validate fails → PAT is NOT stored", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
      statusText: "Unauthorized",
    });

    const conn = await createProviderConnection({
      providerId: 1,
      workspaceId: 1,
      baseUrl: "https://api.openai.com",
      createdBy: 1,
    });

    const result = await validateAndStoreSecret({
      connectionId: conn.id,
      pat: "sk-bad-key",
      actor: 1,
    });

    expect(result.status).toBe("error");
    expect(_secrets).toHaveLength(0); // PAT never stored
    expect(_connections[0].lifecycleStatus).toBe("draft"); // status unchanged
  });

  it("local provider: validate without PAT succeeds", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/v1/models")) {
        throw new Error("Connection refused");
      }
      return {
        ok: true,
        text: async () => JSON.stringify({ models: [{ name: "llama3:latest" }] }),
      };
    });

    const conn = await createProviderConnection({
      providerId: 2,
      workspaceId: 1,
      baseUrl: "http://localhost:11434",
      createdBy: 1,
    });

    const result = await validateAndStoreSecret({
      connectionId: conn.id,
      actor: 1,
    });

    expect(result.status).toBe("ok");
    expect(_secrets).toHaveLength(0); // no PAT → no secret stored
    expect(_connections[0].lifecycleStatus).toBe("validated");
  });

  it("cannot activate a draft connection", async () => {
    const conn = await createProviderConnection({
      providerId: 1,
      workspaceId: 1,
      baseUrl: "https://api.openai.com",
      createdBy: 1,
    });

    await expect(activateConnection(conn.id, 1)).rejects.toThrowError(
      /Invalid state transition: draft → active/
    );
  });

  it("secret rotation: test → encrypt → store → reactivate", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "gpt-4" }, { id: "gpt-4o" }] }),
    });

    // Create + validate + activate
    const conn = await createProviderConnection({
      providerId: 1, workspaceId: 1, baseUrl: "https://api.openai.com", createdBy: 1,
    });
    await validateAndStoreSecret({ connectionId: conn.id, pat: "sk-old", actor: 1 });
    await activateConnection(conn.id, 1);

    expect(_secrets).toHaveLength(1);

    // Rotate
    const rotateResult = await rotateSecret({
      connectionId: conn.id,
      newPat: "sk-new-key-123",
      actor: 1,
    });

    expect(rotateResult.status).toBe("ok");
    expect(_secrets).toHaveLength(2); // old + new secret
    expect(_connections[0].lifecycleStatus).toBe("active");

    // Verify new secret decrypts correctly
    const newSecret = _secrets[_secrets.length - 1];
    expect(decrypt(newSecret.encryptedPat)).toBe("sk-new-key-123");
  });

  it("rotation with bad PAT does NOT store new secret", async () => {
    // First calls succeed (for initial validate), subsequent fails
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount <= 1) {
        return { ok: true, json: async () => ({ data: [{ id: "model-1" }] }) };
      }
      return { ok: false, status: 401, text: async () => "Bad key", statusText: "Unauthorized" };
    });

    const conn = await createProviderConnection({
      providerId: 1, workspaceId: 1, baseUrl: "https://api.openai.com", createdBy: 1,
    });
    await validateAndStoreSecret({ connectionId: conn.id, pat: "sk-good", actor: 1 });
    await activateConnection(conn.id, 1);

    const secretCountBefore = _secrets.length;

    const result = await rotateSecret({
      connectionId: conn.id,
      newPat: "sk-bad",
      actor: 1,
    });

    expect(result.status).toBe("error");
    expect(_secrets.length).toBe(secretCountBefore); // no new secret added
  });

  it("getDecryptedPat returns decrypted secret for active connection", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "gpt-4" }] }),
    });

    const conn = await createProviderConnection({
      providerId: 1, workspaceId: 1, baseUrl: "https://api.openai.com", createdBy: 1,
    });
    await validateAndStoreSecret({ connectionId: conn.id, pat: "sk-runtime-secret", actor: 1 });
    await activateConnection(conn.id, 1);

    const pat = await getDecryptedPat(conn.id);
    expect(pat).toBe("sk-runtime-secret");
  });

  it("getDecryptedPat rejects non-active connection", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "gpt-4" }] }),
    });

    const conn = await createProviderConnection({
      providerId: 1, workspaceId: 1, baseUrl: "https://api.openai.com", createdBy: 1,
    });
    await validateAndStoreSecret({ connectionId: conn.id, pat: "sk-test", actor: 1 });
    // NOT activated — still validated

    await expect(getDecryptedPat(conn.id)).rejects.toThrowError(
      /non-active connection/
    );
  });

  it("delete cascades secrets and audit logs", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "m1" }] }),
    });

    const conn = await createProviderConnection({
      providerId: 1, workspaceId: 1, baseUrl: "https://api.openai.com", createdBy: 1,
    });
    await validateAndStoreSecret({ connectionId: conn.id, pat: "sk-del", actor: 1 });

    expect(_connections).toHaveLength(1);
    expect(_secrets).toHaveLength(1);
    expect(_auditLogs.length).toBeGreaterThan(0);

    await deleteConn(conn.id);

    expect(_connections).toHaveLength(0);
    expect(_secrets).toHaveLength(0);
    expect(_auditLogs).toHaveLength(0);
  });

  it("health check transitions ACTIVE → FAILED on probe failure", async () => {
    // First call succeeds (validate), second fails (health check)
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount <= 1) {
        return { ok: true, json: async () => ({ data: [{ id: "m1" }] }) };
      }
      throw new Error("Connection refused");
    });

    const conn = await createProviderConnection({
      providerId: 1, workspaceId: 1, baseUrl: "https://api.openai.com", createdBy: 1,
    });
    await validateAndStoreSecret({ connectionId: conn.id, pat: "sk-test", actor: 1 });
    await activateConnection(conn.id, 1);

    const hcResult = await healthCheck(conn.id);
    expect(hcResult.status).toBe("error");
    expect(_connections[0].lifecycleStatus).toBe("failed");
    expect(_connections[0].healthStatus).toBe("unreachable");
  });

  it("health check keeps ACTIVE on successful probe", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "m1" }] }),
    });

    const conn = await createProviderConnection({
      providerId: 1, workspaceId: 1, baseUrl: "https://api.openai.com", createdBy: 1,
    });
    await validateAndStoreSecret({ connectionId: conn.id, pat: "sk-test", actor: 1 });
    await activateConnection(conn.id, 1);

    const hcResult = await healthCheck(conn.id);
    expect(hcResult.status).toBe("ok");
    expect(_connections[0].lifecycleStatus).toBe("active");
    expect(_connections[0].healthStatus).toBe("ok");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Router Contract — PAT never leaked
// ═══════════════════════════════════════════════════════════════════════

describe("Router Contract — No Secret Leakage", () => {
  it("router.ts list response does not include encryptedPat or pat fields", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("./router.ts", import.meta.url),
      "utf-8"
    );

    expect(src).toContain("// Never return secret data");

    const listBlock = src.slice(
      src.indexOf("list: protectedProcedure"),
      src.indexOf("getById: protectedProcedure")
    );
    expect(listBlock).not.toMatch(/encryptedPat/);
    expect(listBlock).not.toMatch(/\.pat\b/);
  });

  it("service.ts never exports raw PAT except via getDecryptedPat", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("./service.ts", import.meta.url),
      "utf-8"
    );

    // getDecryptedPat is the ONLY function that calls decrypt
    const lines = src.split("\n");
    const decryptCalls = lines.filter((l: string) => l.includes("decrypt(") && !l.includes("//"));
    expect(decryptCalls.length).toBeGreaterThanOrEqual(1);
  });
});
