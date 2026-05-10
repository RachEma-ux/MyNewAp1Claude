/**
 * Phase 7.5 (Roadmap V3) — discriminated `ModelAccessStreamEvent`
 * union contract.
 *
 * The Phase 7 pre-flight audit found that `ModelAccessStreamChunk`
 * is text-only (per `execute.ts:314-319` doc-block — tool-call
 * streaming was deferred to Phase 17/18). This phase ships the
 * **type surface** for the future streaming producer: a discriminated
 * union with `text_delta` / `tool_call_delta` / `tool_call_complete`
 * / `done` variants. The producer (a future `streamEvents()` method
 * on `execute.ts`) and the consumer migration in `chat-stream.ts`
 * land in subsequent PRs once Phase 17/18 work begins on the
 * upstream tool-call SSE parsers.
 *
 * Locking the union shape now means the consumer migration is a
 * one-line type swap (`for await` over `ModelAccessStreamEvent`
 * instead of `ModelAccessStreamChunk`) rather than a coordinated
 * cross-file redesign.
 *
 * Pure source-scan + type-shape tests — no DB, no network, no
 * runtime stream produced.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import type {
  ModelAccessStreamChunk,
  ModelAccessStreamEvent,
  ModelAccessToolCall,
} from "../../server/openrouter/model-access";

const REPO_ROOT = process.cwd();
const TYPES = readFileSync(
  join(REPO_ROOT, "server/openrouter/model-access/types.ts"),
  "utf8",
);
const INDEX = readFileSync(
  join(REPO_ROOT, "server/openrouter/model-access/index.ts"),
  "utf8",
);

describe("Phase 7.5 — ModelAccessStreamEvent discriminated union", () => {
  describe("type module exports", () => {
    it("declares the discriminated union with `type` discriminant", () => {
      expect(TYPES).toMatch(
        /export\s+type\s+ModelAccessStreamEvent\s*=[\s\S]{0,2000}type:\s*["']text_delta["']/,
      );
    });

    it("includes the four canonical variants (text_delta + tool_call_delta + tool_call_complete + done)", () => {
      // Lock each variant by its discriminant so a future PR can't
      // silently rename or drop one.
      expect(TYPES).toMatch(/type:\s*["']text_delta["']/);
      expect(TYPES).toMatch(/type:\s*["']tool_call_delta["']/);
      expect(TYPES).toMatch(/type:\s*["']tool_call_complete["']/);
      // "done" is the terminal variant; usage / finishReason live here
      // (mirrors the cycle-7 streaming contract).
      expect(TYPES).toMatch(
        /type:\s*["']done["'][\s\S]{0,200}usage\?:\s*ModelAccessUsage/,
      );
    });

    it("preserves ModelAccessStreamChunk (additive change — no breaking renames)", () => {
      // Backward compat: today's `stream()` producer still yields
      // `ModelAccessStreamChunk`. Removing or renaming it would break
      // chat-stream.ts:1073's `for await` consumer immediately.
      expect(TYPES).toMatch(/export\s+interface\s+ModelAccessStreamChunk/);
    });

    it("module index re-exports both ModelAccessStreamChunk and ModelAccessStreamEvent", () => {
      // Single import surface — consumers shouldn't need to know
      // about the underlying types.ts file.
      expect(INDEX).toMatch(/ModelAccessStreamChunk\b/);
      expect(INDEX).toMatch(/ModelAccessStreamEvent\b/);
    });
  });

  describe("variant shapes (compile-time + runtime spot checks)", () => {
    it("text_delta carries a string `delta`", () => {
      const e: ModelAccessStreamEvent = { type: "text_delta", delta: "hi" };
      expect(e.type).toBe("text_delta");
      if (e.type === "text_delta") expect(e.delta).toBe("hi");
    });

    it("tool_call_delta carries toolCallId + optional partialName + partialJson", () => {
      // First event of a tool call: id + name + (optional) args fragment.
      const first: ModelAccessStreamEvent = {
        type: "tool_call_delta",
        toolCallId: "call_1",
        partialName: "get_weather",
        partialJson: '{"city":"',
      };
      // Subsequent events: just args fragment.
      const next: ModelAccessStreamEvent = {
        type: "tool_call_delta",
        toolCallId: "call_1",
        partialJson: 'NYC"}',
      };
      expect(first.type).toBe("tool_call_delta");
      expect(next.type).toBe("tool_call_delta");
      if (first.type === "tool_call_delta") {
        expect(first.partialName).toBe("get_weather");
      }
    });

    it("tool_call_complete carries the parsed full ModelAccessToolCall", () => {
      const tc: ModelAccessToolCall = {
        id: "call_1",
        name: "get_weather",
        arguments: '{"city":"NYC"}',
      };
      const e: ModelAccessStreamEvent = { type: "tool_call_complete", toolCall: tc };
      expect(e.type).toBe("tool_call_complete");
      if (e.type === "tool_call_complete") {
        expect(e.toolCall.id).toBe("call_1");
        expect(JSON.parse(e.toolCall.arguments)).toEqual({ city: "NYC" });
      }
    });

    it("done variant is the terminal state with optional usage + finishReason", () => {
      const e: ModelAccessStreamEvent = {
        type: "done",
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        finishReason: "tool_calls",
      };
      expect(e.type).toBe("done");
      if (e.type === "done") {
        expect(e.finishReason).toBe("tool_calls");
        expect(e.usage?.totalTokens).toBe(15);
      }
    });

    it("ModelAccessStreamChunk shape is unchanged (text-only, with done flag + optional usage)", () => {
      // Lock the legacy shape so the additive Phase 7.5 union doesn't
      // accidentally drift the existing producer.
      const chunk: ModelAccessStreamChunk = {
        delta: "hello",
        done: true,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      };
      expect(chunk.delta).toBe("hello");
      expect(chunk.done).toBe(true);
    });
  });

  describe("doc-block invariants", () => {
    it("documents the partial-JSON contract (no mid-stream parsing)", () => {
      // The tool_call_delta variant's `partialJson` field MUST NOT be
      // parsed mid-stream — the consumer accumulates fragments until
      // `tool_call_complete` arrives. Lock the doc string so a future
      // PR doesn't silently flip the contract by removing the warning.
      expect(TYPES).toMatch(
        /Consumers[\s\S]{0,40}MUST\s+NOT\s+parse[\s\S]{0,40}mid-stream/i,
      );
    });

    it("documents that the union is additive (backward compat for chat-stream)", () => {
      expect(TYPES).toMatch(/[Bb]ackward\s+compat[\s\S]{0,200}ADDITIVE/);
    });

    it("references Phase 17/18 as the upstream-parser landing spot", () => {
      // The producer wiring (parsing OpenAI / Anthropic SSE tool
      // events) is still Phase 17/18 work. The doc block records this
      // so a reader doesn't expect `streamEvents()` to exist today.
      expect(TYPES).toMatch(/Phase\s+17\/18/);
    });
  });
});
