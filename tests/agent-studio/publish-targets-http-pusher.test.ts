/**
 * Publish-targets HTTP pusher factory + default registrations —
 * V1+ Phase 19-β tests.
 *
 * Covers:
 *   - makeHttpPusher composes URL (joinUrl), headers, body, digest
 *   - succeeded path with artifactId extraction
 *   - failed-HTTP path captures status + snippet
 *   - transport error path captures errorMessage
 *   - credentialFn called per-target; null skips auth header
 *   - Bearer prefix toggle for API-key auth
 *   - registerDefaultPublishPushers wires all 3 types
 *   - per-type override applies on top of base config
 *   - source-scan boundary: no credential-resolver import; no raw
 *     process.env.*_API_KEY reads.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetRegistryForTests,
  getPublishPusher,
  listRegisteredTargetTypes,
} from "../../server/agent-studio/services/publish-targets/registry.js";
import { makeHttpPusher } from "../../server/agent-studio/services/publish-targets/http-pusher.js";
import { registerDefaultPublishPushers } from "../../server/agent-studio/services/publish-targets/defaults.js";
import type {
  PublishPayload,
  PublishTargetRecord,
} from "../../server/agent-studio/services/publish-targets/types.js";

const TARGET: PublishTargetRecord = {
  id: 7,
  targetKey: "primary-staging",
  targetType: "staging_env",
  endpoint: "https://staging.example.com/api",
  providerConnectionId: 42,
  config: null,
  enabled: true,
};

const PAYLOAD: PublishPayload = {
  sourcePromotionId: 101,
  sourceVersionId: "v-abc",
  body: { title: "hello" },
};

beforeEach(() => {
  __resetRegistryForTests();
});
afterEach(() => {
  __resetRegistryForTests();
});

function mockFetch(
  response: Partial<Response> & { jsonBody?: unknown; textBody?: string },
): typeof fetch {
  return vi.fn(async () => {
    const status = response.status ?? 200;
    const ok = response.ok ?? (status >= 200 && status < 300);
    return {
      ok,
      status,
      statusText: response.statusText ?? "OK",
      json: async () => response.jsonBody ?? null,
      text: async () => response.textBody ?? "",
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe("makeHttpPusher — happy path", () => {
  it("composes the URL with pathSuffix and sends POST JSON", async () => {
    const spy = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ id: "artifact-7" }),
      text: async () => "",
    })) as unknown as typeof fetch;

    const pusher = makeHttpPusher({
      method: "POST",
      pathSuffix: "/promote",
      credentialFn: async () => "secret-token",
      fetchImpl: spy,
    });
    const outcome = await pusher({ target: TARGET, payload: PAYLOAD });
    expect(outcome.status).toBe("succeeded");
    expect(outcome.upstreamArtifactId).toBe("artifact-7");
    expect(outcome.payloadDigest).toMatch(/^[0-9a-f]{64}$/);
    const call = (spy as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0];
    expect(call[0]).toBe("https://staging.example.com/api/promote");
    const init = call[1] as RequestInit & { headers: Record<string, string> };
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers.Authorization).toBe("Bearer secret-token");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      promotionId: 101,
      sourceVersionId: "v-abc",
      body: { title: "hello" },
    });
  });

  it("PUT method + custom path", async () => {
    const spy = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ artifactId: "v-9" }),
      text: async () => "",
    })) as unknown as typeof fetch;
    const pusher = makeHttpPusher({
      method: "PUT",
      pathSuffix: "vault/notes",
      credentialFn: async () => "tok",
      fetchImpl: spy,
    });
    const outcome = await pusher({ target: TARGET, payload: PAYLOAD });
    expect(outcome.upstreamArtifactId).toBe("v-9");
    const call = (spy as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0];
    expect(call[0]).toBe("https://staging.example.com/api/vault/notes");
    const init = call[1] as RequestInit;
    expect(init.method).toBe("PUT");
  });
});

describe("makeHttpPusher — credential header", () => {
  it("uses raw header value when useBearerPrefix=false", async () => {
    const spy = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({}),
      text: async () => "",
    })) as unknown as typeof fetch;
    const pusher = makeHttpPusher({
      credentialHeader: "X-API-Key",
      useBearerPrefix: false,
      credentialFn: async () => "raw-api-key-abc",
      fetchImpl: spy,
    });
    await pusher({ target: TARGET, payload: PAYLOAD });
    const init = (spy as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][1] as RequestInit & { headers: Record<string, string> };
    expect(init.headers["X-API-Key"]).toBe("raw-api-key-abc");
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("omits the credential header when credentialFn returns null", async () => {
    const spy = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({}),
      text: async () => "",
    })) as unknown as typeof fetch;
    const pusher = makeHttpPusher({
      credentialFn: async () => null,
      fetchImpl: spy,
    });
    await pusher({ target: TARGET, payload: PAYLOAD });
    const init = (spy as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][1] as RequestInit & { headers: Record<string, string> };
    expect(init.headers.Authorization).toBeUndefined();
  });
});

describe("makeHttpPusher — failure paths", () => {
  it("HTTP non-2xx returns failed with status snippet", async () => {
    const pusher = makeHttpPusher({
      pathSuffix: "/promote",
      fetchImpl: mockFetch({
        ok: false,
        status: 500,
        statusText: "Server Error",
        textBody: "internal error\nstack...",
      }),
    });
    const outcome = await pusher({ target: TARGET, payload: PAYLOAD });
    expect(outcome.status).toBe("failed");
    expect(outcome.errorMessage).toMatch(/500 Server Error/);
    expect(outcome.payloadDigest).toMatch(/^[0-9a-f]{64}$/);
    expect((outcome.details as { httpStatus: number }).httpStatus).toBe(500);
  });

  it("transport throw returns failed with transportError flag", async () => {
    const pusher = makeHttpPusher({
      pathSuffix: "/promote",
      fetchImpl: vi.fn(async () => {
        throw new TypeError("ENETUNREACH");
      }) as unknown as typeof fetch,
    });
    const outcome = await pusher({ target: TARGET, payload: PAYLOAD });
    expect(outcome.status).toBe("failed");
    expect(outcome.errorMessage).toBe("ENETUNREACH");
    expect((outcome.details as { transportError?: boolean }).transportError).toBe(
      true,
    );
  });
});

describe("registerDefaultPublishPushers", () => {
  it("registers all 3 target types", () => {
    const registered = registerDefaultPublishPushers({
      credentialFn: async () => "tok",
      fetchImpl: mockFetch({ status: 200, jsonBody: {} }),
    });
    expect(registered).toEqual(["staging_env", "remote_vault", "external_kb"]);
    expect(listRegisteredTargetTypes().sort()).toEqual(
      ["external_kb", "remote_vault", "staging_env"].sort(),
    );
  });

  it("staging_env default — POST /promote with Authorization", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ id: "s1" }),
        text: async () => "",
      } as unknown as Response;
    }) as unknown as typeof fetch;

    registerDefaultPublishPushers({
      credentialFn: async () => "tok",
      fetchImpl,
    });
    const pusher = getPublishPusher("staging_env");
    expect(pusher).toBeDefined();
    const outcome = await pusher!({ target: TARGET, payload: PAYLOAD });
    expect(outcome.status).toBe("succeeded");
    expect(calls[0].url).toBe("https://staging.example.com/api/promote");
    expect(calls[0].init.method).toBe("POST");
    expect(
      (calls[0].init.headers as Record<string, string>).Authorization,
    ).toBe("Bearer tok");
  });

  it("remote_vault default — PUT /vault/notes with Authorization", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({}),
        text: async () => "",
      } as unknown as Response;
    }) as unknown as typeof fetch;

    registerDefaultPublishPushers({
      credentialFn: async () => "tok",
      fetchImpl,
    });
    const pusher = getPublishPusher("remote_vault");
    await pusher!({
      target: { ...TARGET, targetType: "remote_vault" },
      payload: PAYLOAD,
    });
    expect(calls[0].url).toBe("https://staging.example.com/api/vault/notes");
    expect(calls[0].init.method).toBe("PUT");
  });

  it("external_kb default — POST /ingest with X-API-Key (no Bearer prefix)", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({}),
        text: async () => "",
      } as unknown as Response;
    }) as unknown as typeof fetch;

    registerDefaultPublishPushers({
      credentialFn: async () => "kb-key-123",
      fetchImpl,
    });
    const pusher = getPublishPusher("external_kb");
    await pusher!({
      target: { ...TARGET, targetType: "external_kb" },
      payload: PAYLOAD,
    });
    expect(calls[0].url).toBe("https://staging.example.com/api/ingest");
    expect(calls[0].init.method).toBe("POST");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["X-API-Key"]).toBe("kb-key-123");
    expect(headers.Authorization).toBeUndefined();
  });

  it("per-type override beats base config", async () => {
    const calls: { url: string }[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push({ url });
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({}),
        text: async () => "",
      } as unknown as Response;
    }) as unknown as typeof fetch;
    registerDefaultPublishPushers({
      credentialFn: async () => "tok",
      fetchImpl,
      overrides: {
        staging_env: { pathSuffix: "/custom-promote-path" },
      },
    });
    await getPublishPusher("staging_env")!({
      target: TARGET,
      payload: PAYLOAD,
    });
    expect(calls[0].url).toBe(
      "https://staging.example.com/api/custom-promote-path",
    );
  });
});

describe("boundary — publish-targets source", () => {
  function readModule(name: string): string {
    return readFileSync(
      resolve(
        __dirname,
        `../../server/agent-studio/services/publish-targets/${name}`,
      ),
      "utf8",
    );
  }

  function strip(code: string): string {
    return code
      .split("\n")
      .filter((l) => !/^\s*\*?\s*\/\//.test(l) && !/^\s*\*/.test(l))
      .join("\n");
  }

  it("http-pusher.ts has no credential-resolver import", () => {
    const code = strip(readModule("http-pusher.ts"));
    expect(/credential-resolver/.test(code)).toBe(false);
  });

  it("defaults.ts has no credential-resolver import", () => {
    const code = strip(readModule("defaults.ts"));
    expect(/credential-resolver/.test(code)).toBe(false);
  });

  it("no raw process.env.*_API_KEY reads in pusher modules", () => {
    for (const name of ["http-pusher.ts", "defaults.ts"]) {
      const code = strip(readModule(name));
      expect(/process\.env\.[A-Z_]*_API_KEY/.test(code)).toBe(false);
    }
  });

  it("no dispatchMcpToolCall import (publish path is HTTP, not MCP)", () => {
    for (const name of ["http-pusher.ts", "defaults.ts"]) {
      const code = strip(readModule(name));
      expect(
        /import[^;]*dispatchMcpToolCall[^;]*from\s+["'][^"']*mcp\/dispatcher/.test(
          code,
        ),
      ).toBe(false);
    }
  });
});
