/**
 * Generic Postgres LISTEN/NOTIFY bus primitive — PR-V1-166.
 *
 * Behavioral test of the pure codecs + source-scan of the primitive.
 * The connection/reconnect/dispatch machinery is exercised in
 * production by the two existing buses (region + approval) — this
 * test verifies the extracted shape is wireable, not that pg.Client
 * actually fires events (that would require a real PG connection).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it, vi } from "vitest";

import {
  STRING_CODEC,
  jsonCodec,
  createPgListenNotifyBus,
} from "../../server/agent-studio/services/pubsub/pg-listen-notify-bus.js";

describe("V1+ PR-V1-166 — generic PG LISTEN/NOTIFY bus primitive", () => {
  it("STRING_CODEC round-trips an identity payload", () => {
    expect(STRING_CODEC.encode("pin change")).toBe("pin change");
    expect(STRING_CODEC.decode("pin change")).toBe("pin change");
  });

  it("jsonCodec round-trips a structured event when validate accepts", () => {
    interface E {
      readonly id: number;
      readonly tag: string;
    }
    const codec = jsonCodec<E>((parsed) => {
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        typeof (parsed as E).id === "number" &&
        typeof (parsed as E).tag === "string"
      ) {
        return parsed as E;
      }
      return null;
    });
    const original: E = { id: 42, tag: "demo" };
    const encoded = codec.encode(original);
    const parsed = codec.decode(encoded);
    expect(parsed).toEqual(original);
  });

  it("jsonCodec returns null on malformed JSON", () => {
    const codec = jsonCodec<unknown>((parsed) => parsed);
    expect(codec.decode("not json")).toBeNull();
  });

  it("jsonCodec returns null when validate rejects", () => {
    const codec = jsonCodec<{ ok: boolean }>((parsed) =>
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { ok?: unknown }).ok === "boolean"
        ? (parsed as { ok: boolean })
        : null,
    );
    expect(codec.decode('{"oops":true}')).toBeNull();
  });

  it("createPgListenNotifyBus returns the documented bus shape", () => {
    const bus = createPgListenNotifyBus<string>({
      channel: "test_channel",
      ...STRING_CODEC,
      logPrefix: "test",
    });
    expect(typeof bus.notify).toBe("function");
    expect(typeof bus.subscribe).toBe("function");
    expect(typeof bus.unsubscribe).toBe("function");
    expect(typeof bus.maybeSubscribe).toBe("function");
  });

  it("maybeSubscribe is a no-op when env flag mismatches", () => {
    const handler = vi.fn();
    const bus = createPgListenNotifyBus<string>({
      channel: "test_channel",
      ...STRING_CODEC,
    });
    delete process.env.TEST_FLAG_NEVER_SET;
    const wired = bus.maybeSubscribe("TEST_FLAG_NEVER_SET", "on", handler);
    expect(wired).toBe(false);
    // Tidy: in case the connect path queued anything, drop the
    // subscriber. Should be a safe no-op.
    bus.unsubscribe();
  });

  it("source-scan: hard-rule compliance", () => {
    const file = resolve(
      __dirname,
      "../../server/agent-studio/services/pubsub/pg-listen-notify-bus.ts",
    );
    const src = readFileSync(file, "utf8");
    expect(/process\.env\.[A-Z0-9_]+_API_KEY/.test(src)).toBe(false);
    expect(/credential-resolver/.test(src)).toBe(false);
    expect(/dispatchMcpToolCall/.test(src)).toBe(false);
    expect(/neo4j-driver/.test(src)).toBe(false);
  });

  it("public-api barrel re-exports the primitive + codecs", () => {
    const file = resolve(
      __dirname,
      "../../server/agent-studio/services/pubsub/public-api.ts",
    );
    const src = readFileSync(file, "utf8");
    expect(src).toContain("createPgListenNotifyBus");
    expect(src).toContain("STRING_CODEC");
    expect(src).toContain("jsonCodec");
    expect(src).toContain("PgListenNotifyBus");
    expect(src).toContain("PgListenNotifyBusConfig");
  });

  it("source-scan: NOTIFY path quote-escapes + 200-char cap (same defense as the two existing buses)", () => {
    const file = resolve(
      __dirname,
      "../../server/agent-studio/services/pubsub/pg-listen-notify-bus.ts",
    );
    const src = readFileSync(file, "utf8");
    expect(/\.replace\(\/'/.test(src)).toBe(true);
    expect(/\.slice\(0,\s*200\)/.test(src)).toBe(true);
    expect(/NOTIFY\s+\$\{channel\}/.test(src)).toBe(true);
  });

  it("source-scan: reconnect backoff caps at 60s (matches existing buses)", () => {
    const file = resolve(
      __dirname,
      "../../server/agent-studio/services/pubsub/pg-listen-notify-bus.ts",
    );
    const src = readFileSync(file, "utf8");
    expect(/Math\.min\(state\.reconnectMs,\s*60_?000\)/.test(src)).toBe(true);
    expect(/Math\.min\(state\.reconnectMs\s*\+\s*10_?000,\s*60_?000\)/.test(src)).toBe(
      true,
    );
  });
});
