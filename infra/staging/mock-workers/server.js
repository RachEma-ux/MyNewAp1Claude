/**
 * Mock worker — staging only.
 *
 * Implements the minimum API surface the production-readiness tests
 * (Phase 4 worker probes, Phase 9 workflow replay, Phase 10 sync)
 * require:
 *
 *   GET  /health   →  { status, worker, mode: "staging-mock", uptimeMs }
 *   POST /run      →  { runId, worker, mode: "staging-mock",
 *                       state: "completed" | "failed", inputEcho }
 *   GET  /run/:id  →  { runId, ...same shape, retrieved: true }
 *
 * The `/run` endpoint generates a deterministic runId from a
 * monotonically increasing counter so tests can correlate.
 *
 * Failure mode: posting `{ "simulate": "fail" }` returns a 5xx so
 * Phase 4's degraded-state evidence has something to assert against.
 *
 * Zero external deps — uses node:http only — so the Docker image
 * stays small and starts in <500ms.
 */

const http = require("node:http");

const WORKER_NAME = process.env.WORKER_NAME || "unknown-mock-worker";
const PORT = Number(process.env.WORKER_PORT || 4000);
const STARTED_AT = Date.now();
const runs = new Map();
let runSeq = 0;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid-json"));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      return json(res, 200, {
        status: "healthy",
        worker: WORKER_NAME,
        mode: "staging-mock",
        uptimeMs: Date.now() - STARTED_AT,
      });
    }

    if (req.method === "POST" && req.url === "/run") {
      const body = await readBody(req);
      if (body && body.simulate === "fail") {
        return json(res, 503, {
          status: "failed",
          worker: WORKER_NAME,
          mode: "staging-mock",
          error: "simulated-failure",
        });
      }
      const runId = `mock-${WORKER_NAME}-${++runSeq}`;
      const record = {
        runId,
        worker: WORKER_NAME,
        mode: "staging-mock",
        state: "completed",
        inputEcho: body ?? null,
        startedAt: new Date().toISOString(),
      };
      runs.set(runId, record);
      return json(res, 200, record);
    }

    if (req.method === "GET" && req.url?.startsWith("/run/")) {
      const id = req.url.slice("/run/".length);
      const rec = runs.get(id);
      if (!rec) return json(res, 404, { error: "not-found", runId: id });
      return json(res, 200, { ...rec, retrieved: true });
    }

    return json(res, 404, { error: "not-found", path: req.url });
  } catch (err) {
    return json(res, 500, {
      status: "error",
      worker: WORKER_NAME,
      mode: "staging-mock",
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  process.stdout.write(
    `[mock-worker:${WORKER_NAME}] listening on :${PORT} (mode=staging-mock)\n`,
  );
});
