/**
 * Mock provider server — local HTTP fixture for Model Access tests.
 *
 * Plan v3 Phase 6. Provides a process-local HTTP server that mimics
 * the three provider shapes Model Access talks to:
 *
 *   - OpenAI-compatible:  GET /v1/models, POST /v1/chat/completions
 *   - Anthropic Messages: GET /v1/models, POST /v1/messages
 *   - Ollama:             GET /api/tags, POST /api/chat
 *
 * The server captures every inbound request so tests can assert on
 * URL, method, headers, and body without monkey-patching `fetch`.
 *
 * Auth is intentionally permissive — the server records the
 * `Authorization` / `x-api-key` header it received but does not
 * reject missing tokens. Negative auth cases are covered by the
 * Model Access unit tests that mock the credential resolver.
 *
 * Live provider tests (against api.openai.com / api.anthropic.com)
 * are gated behind `RUN_LIVE_PROVIDER_TESTS=1` and are NOT exercised
 * by this fixture. Live tests are manual-only — the README in this
 * directory describes the opt-in.
 */

import http from "node:http";
import type { AddressInfo } from "node:net";

export interface CapturedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  bodyJson: unknown;
}

export interface MockProviderServerOptions {
  /**
   * If set, the server returns this status for the next chat/completions
   * call (one-shot — resets to 200 after consumption). Useful for
   * exercising the Model Access HTTP-error normalization path.
   */
  nextChatStatus?: number;
  /**
   * Override for the body returned by `/v1/models` (and Anthropic
   * `/v1/models`). Defaults to `{ data: [{ id: "mock-default" }] }`.
   */
  modelsBody?: unknown;
  /**
   * Override for the body returned by `/v1/chat/completions`. Defaults
   * to a single-choice OpenAI-shape response.
   */
  chatBody?: unknown;
  /**
   * Override for the body returned by `/v1/messages` (Anthropic).
   */
  messagesBody?: unknown;
  /**
   * Override for the body returned by `/api/tags` (Ollama).
   */
  tagsBody?: unknown;
  /**
   * Override for the body returned by `/api/chat` (Ollama).
   */
  ollamaChatBody?: unknown;
}

export interface MockProviderServerHandle {
  /** Base URL including the auto-assigned port, e.g. `http://127.0.0.1:54321`. */
  baseUrl: string;
  /** Captured requests, in order. */
  requests: CapturedRequest[];
  /** Mutate options between calls without restarting the server. */
  options: MockProviderServerOptions;
  /** Stop the server and free the port. */
  close(): Promise<void>;
}

const DEFAULT_MODELS_BODY = {
  data: [
    { id: "mock-default", object: "model" },
    { id: "gpt-test", object: "model" },
    { id: "claude-test", object: "model" },
  ],
};

const DEFAULT_CHAT_BODY = {
  id: "chatcmpl-mock",
  object: "chat.completion",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "mock-openai-output" },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 4, completion_tokens: 6, total_tokens: 10 },
};

const DEFAULT_MESSAGES_BODY = {
  id: "msg-mock",
  type: "message",
  content: [{ type: "text", text: "mock-anthropic-output" }],
  usage: { input_tokens: 3, output_tokens: 5 },
  stop_reason: "end_turn",
};

const DEFAULT_TAGS_BODY = {
  models: [
    { name: "llama3.1:8b", size: 4_900_000_000 },
    { name: "mistral:7b", size: 4_100_000_000 },
  ],
};

const DEFAULT_OLLAMA_CHAT_BODY = {
  model: "llama3.1:8b",
  message: { role: "assistant", content: "mock-ollama-output" },
  done: true,
};

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function lowerHeaders(h: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    if (Array.isArray(v)) out[k.toLowerCase()] = v.join(",");
    else if (typeof v === "string") out[k.toLowerCase()] = v;
  }
  return out;
}

export async function startMockProviderServer(
  initialOptions: MockProviderServerOptions = {},
): Promise<MockProviderServerHandle> {
  const requests: CapturedRequest[] = [];
  const options: MockProviderServerOptions = { ...initialOptions };

  const server = http.createServer(async (req, res) => {
    const body = await readBody(req);
    let bodyJson: unknown = null;
    if (body.length > 0 && req.headers["content-type"]?.includes("json")) {
      try {
        bodyJson = JSON.parse(body);
      } catch {
        bodyJson = null;
      }
    }
    requests.push({
      method: req.method ?? "GET",
      url: req.url ?? "/",
      headers: lowerHeaders(req.headers),
      body,
      bodyJson,
    });

    const url = req.url ?? "/";
    const method = req.method ?? "GET";

    const send = (status: number, payload: unknown) => {
      const json = JSON.stringify(payload);
      res.writeHead(status, {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(json),
      });
      res.end(json);
    };

    // OpenAI / Anthropic — GET /v1/models
    if (method === "GET" && url.startsWith("/v1/models")) {
      send(200, options.modelsBody ?? DEFAULT_MODELS_BODY);
      return;
    }

    // OpenAI — POST /v1/chat/completions
    if (method === "POST" && url.startsWith("/v1/chat/completions")) {
      const status = options.nextChatStatus ?? 200;
      options.nextChatStatus = undefined;
      if (status !== 200) {
        const errPayload = { error: { type: "mock_error", message: `mock status ${status}` } };
        send(status, errPayload);
        return;
      }
      send(200, options.chatBody ?? DEFAULT_CHAT_BODY);
      return;
    }

    // Anthropic — POST /v1/messages
    if (method === "POST" && url.startsWith("/v1/messages")) {
      const status = options.nextChatStatus ?? 200;
      options.nextChatStatus = undefined;
      if (status !== 200) {
        send(status, { type: "error", error: { type: "mock_error", message: `mock status ${status}` } });
        return;
      }
      send(200, options.messagesBody ?? DEFAULT_MESSAGES_BODY);
      return;
    }

    // Ollama — GET /api/tags
    if (method === "GET" && url.startsWith("/api/tags")) {
      send(200, options.tagsBody ?? DEFAULT_TAGS_BODY);
      return;
    }

    // Ollama — POST /api/chat
    if (method === "POST" && url.startsWith("/api/chat")) {
      send(200, options.ollamaChatBody ?? DEFAULT_OLLAMA_CHAT_BODY);
      return;
    }

    // Anything else — explicit 404 so tests fail loudly on unexpected URLs.
    send(404, { error: { type: "mock_not_found", url, method } });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    baseUrl,
    requests,
    options,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

/**
 * Convenience: are we permitted to hit a real provider in this run?
 * Defaults to false. Tests that need a real-provider call must opt in
 * with `RUN_LIVE_PROVIDER_TESTS=1` AND have the relevant API key in
 * the environment.
 */
export function liveProviderTestsEnabled(): boolean {
  return process.env.RUN_LIVE_PROVIDER_TESTS === "1";
}
