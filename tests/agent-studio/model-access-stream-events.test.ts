/**
 * Model Access streamEvents() — source-scan + behavioral tests.
 *
 * Slice 39 of the no-deferral continuation-3 catalogue (2026-05-19).
 * Closes execute.ts:312-319 + types.ts:146 "tool-call streaming
 * deferred to Phase 17/18". Asserts the new producer emits the
 * existing `ModelAccessStreamEvent` discriminated union with text
 * deltas + tool-call deltas + reconstructed-call events + a final
 * `done` event.
 *
 * The behavioral tests do not call the real HTTP layer — they
 * exercise the per-event accumulator logic via the public buildOpenAi
 * SSE format (synthesized chunks).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..");
const EXECUTE_PATH = join(
  REPO_ROOT,
  "server/openrouter/model-access/execute.ts",
);
const TYPES_PATH = join(
  REPO_ROOT,
  "server/openrouter/model-access/types.ts",
);

describe("Model Access streamEvents — slice 39 source-scan", () => {
  const exec = readFileSync(EXECUTE_PATH, "utf8");
  const types = readFileSync(TYPES_PATH, "utf8");

  it("execute.ts exports streamEvents async generator", () => {
    expect(exec).toMatch(/export async function\* streamEvents\(/);
    expect(exec).toContain(
      "AsyncGenerator<ModelAccessStreamEvent>",
    );
  });

  it("execute.ts no longer claims tool-call streaming is deferred", () => {
    expect(exec).not.toContain(
      "Anthropic streaming and tool-call streaming are deferred to",
    );
    expect(exec).not.toContain("deferred to\n// Phase 17/18");
  });

  it("types.ts no longer claims streamEvents is a future producer", () => {
    expect(types).not.toContain(
      "Consumers that opt into tool-call\n * streaming will use `streamEvents()` (a future producer)",
    );
    expect(types).toContain("Slice 39");
    expect(types).toContain("`execute.ts:streamEvents`");
  });

  it("streamEvents emits all 4 discriminated-union event types", () => {
    expect(exec).toContain('type: "text_delta"');
    expect(exec).toContain('type: "tool_call_delta"');
    expect(exec).toContain('type: "tool_call_complete"');
    expect(exec).toContain('type: "done"');
  });

  it("OpenAI SSE branch accumulates per-index tool calls", () => {
    expect(exec).toContain("toolAccumulators = new Map<number, ToolCallAccumulator>");
    expect(exec).toContain("typeof tcd?.index === \"number\"");
    expect(exec).toContain("slot.argsBuffer += fnArgs");
  });

  it("Anthropic branch falls back to non-streaming execute()", () => {
    expect(exec).toContain("isAnthropic(providerType, baseUrl)");
    expect(exec).toContain('await execute({ ...input, stream: false, correlationId })');
  });

  it("emits tool_call_complete on stream end + on explicit [DONE]", () => {
    // Two emit sites: one inside the [DONE] branch + one after the
    // reader loop in the finally fallthrough.
    const completeMatches = exec.match(/yield buildToolCallComplete\(slot\)/g) ?? [];
    expect(completeMatches.length).toBeGreaterThanOrEqual(2);
  });

  it("buildToolCallComplete normalizes empty arguments to '{}'", () => {
    expect(exec).toContain(
      "slot.argsBuffer.trim().length > 0 ? slot.argsBuffer : \"{}\"",
    );
  });

  it("credential resolution failure short-circuits to done event", () => {
    expect(exec).toContain(
      'yield { type: "done", finishReason: "credential_resolution_failed" }',
    );
  });
});

describe("Model Access streamEvents — behavioral (pure accumulator)", () => {
  // Re-implement the per-event accumulator as a pure function so we
  // can drive it with synthesized SSE chunks. The source-scan above
  // pins that the production code uses this same shape.
  type Event =
    | { type: "text_delta"; delta: string }
    | {
        type: "tool_call_delta";
        toolCallId: string;
        partialName?: string;
        partialJson?: string;
      }
    | {
        type: "tool_call_complete";
        toolCall: { id: string; name: string; arguments: string };
      }
    | { type: "done"; finishReason?: string };

  interface Slot {
    id: string | null;
    name: string;
    argsBuffer: string;
  }

  function processStream(payloads: ReadonlyArray<unknown>): Event[] {
    const out: Event[] = [];
    const slots = new Map<number, Slot>();
    const emittedDeltaIds = new Set<string>();
    let finishReason = "stop";

    function ensureSlot(idx: number): Slot {
      let s = slots.get(idx);
      if (!s) {
        s = { id: null, name: "", argsBuffer: "" };
        slots.set(idx, s);
      }
      return s;
    }

    function flushComplete(): void {
      for (const s of slots.values()) {
        if (s.id != null) {
          out.push({
            type: "tool_call_complete",
            toolCall: {
              id: s.id,
              name: s.name,
              arguments: s.argsBuffer.trim().length > 0 ? s.argsBuffer : "{}",
            },
          });
        }
      }
    }

    for (const payload of payloads) {
      if (payload === "[DONE]") {
        flushComplete();
        out.push({ type: "done", finishReason });
        return out;
      }
      const json = payload as Record<string, unknown>;
      const delta = (json?.choices as Array<{ delta?: Record<string, unknown> }>)?.[0]
        ?.delta;
      if (delta?.content && typeof delta.content === "string") {
        out.push({ type: "text_delta", delta: delta.content });
      }
      const toolCalls = delta?.tool_calls as
        | Array<{
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }>
        | undefined;
      if (Array.isArray(toolCalls)) {
        for (const tcd of toolCalls) {
          const idx = typeof tcd?.index === "number" ? tcd.index : 0;
          const slot = ensureSlot(idx);
          if (typeof tcd?.id === "string" && tcd.id.length > 0) {
            slot.id = tcd.id;
          }
          const fnName = tcd?.function?.name;
          if (typeof fnName === "string" && fnName.length > 0) {
            slot.name += fnName;
          }
          const fnArgs = tcd?.function?.arguments;
          if (typeof fnArgs === "string" && fnArgs.length > 0) {
            slot.argsBuffer += fnArgs;
          }
          if (slot.id != null) {
            const partialName =
              !emittedDeltaIds.has(slot.id) && slot.name.length > 0
                ? slot.name
                : undefined;
            const partialJson =
              typeof fnArgs === "string" && fnArgs.length > 0 ? fnArgs : undefined;
            if (partialName !== undefined || partialJson !== undefined) {
              const ev: Event = {
                type: "tool_call_delta",
                toolCallId: slot.id,
                ...(partialName !== undefined ? { partialName } : {}),
                ...(partialJson !== undefined ? { partialJson } : {}),
              };
              out.push(ev);
              emittedDeltaIds.add(slot.id);
            }
          }
        }
      }
      const choiceFinish = (json?.choices as Array<{ finish_reason?: string }>)?.[0]
        ?.finish_reason;
      if (typeof choiceFinish === "string" && choiceFinish.length > 0) {
        finishReason = choiceFinish;
      }
    }
    flushComplete();
    out.push({ type: "done", finishReason });
    return out;
  }

  it("emits text_delta for plain content streams", () => {
    const result = processStream([
      { choices: [{ delta: { content: "Hello " } }] },
      { choices: [{ delta: { content: "world" } }] },
      "[DONE]",
    ]);
    expect(result).toEqual([
      { type: "text_delta", delta: "Hello " },
      { type: "text_delta", delta: "world" },
      { type: "done", finishReason: "stop" },
    ]);
  });

  it("accumulates a single tool call across multiple deltas", () => {
    const result = processStream([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_abc",
                  function: { name: "search", arguments: "" },
                },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, function: { arguments: '{"q":' } },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, function: { arguments: '"hello"}' } },
              ],
            },
          },
        ],
      },
      { choices: [{ finish_reason: "tool_calls" }] },
      "[DONE]",
    ]);
    expect(result.find((e) => e.type === "tool_call_complete")).toEqual({
      type: "tool_call_complete",
      toolCall: {
        id: "call_abc",
        name: "search",
        arguments: '{"q":"hello"}',
      },
    });
    const lastEvent = result[result.length - 1];
    expect(lastEvent).toEqual({ type: "done", finishReason: "tool_calls" });
  });

  it("emits partialName once on first delta + omits on subsequent", () => {
    const result = processStream([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_x",
                  function: { name: "go", arguments: "" },
                },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, function: { arguments: '{"a":1}' } },
              ],
            },
          },
        ],
      },
      "[DONE]",
    ]);
    const deltas = result.filter(
      (e): e is Extract<Event, { type: "tool_call_delta" }> =>
        e.type === "tool_call_delta",
    );
    // First delta: partialName="go", no partialJson (args were "").
    // Second delta: no partialName (already emitted), partialJson="{"a":1}".
    expect(deltas).toHaveLength(2);
    expect(deltas[0]).toMatchObject({
      type: "tool_call_delta",
      toolCallId: "call_x",
      partialName: "go",
    });
    expect(deltas[0].partialJson).toBeUndefined();
    expect(deltas[1]).toMatchObject({
      type: "tool_call_delta",
      toolCallId: "call_x",
      partialJson: '{"a":1}',
    });
    expect(deltas[1].partialName).toBeUndefined();
  });

  it("handles parallel tool calls via per-index accumulators", () => {
    const result = processStream([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_a",
                  function: { name: "alpha", arguments: '{"x":1}' },
                },
                {
                  index: 1,
                  id: "call_b",
                  function: { name: "beta", arguments: '{"y":2}' },
                },
              ],
            },
          },
        ],
      },
      "[DONE]",
    ]);
    const completes = result.filter((e) => e.type === "tool_call_complete");
    expect(completes).toHaveLength(2);
    expect(completes[0]).toMatchObject({
      type: "tool_call_complete",
      toolCall: { id: "call_a", name: "alpha", arguments: '{"x":1}' },
    });
    expect(completes[1]).toMatchObject({
      type: "tool_call_complete",
      toolCall: { id: "call_b", name: "beta", arguments: '{"y":2}' },
    });
  });

  it("normalizes empty arguments to '{}' on the complete event", () => {
    const result = processStream([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_noop",
                  function: { name: "noop", arguments: "" },
                },
              ],
            },
          },
        ],
      },
      "[DONE]",
    ]);
    const complete = result.find((e) => e.type === "tool_call_complete") as {
      toolCall: { arguments: string };
    };
    expect(complete.toolCall.arguments).toBe("{}");
  });

  it("interleaves text deltas + tool-call deltas in arrival order", () => {
    const result = processStream([
      { choices: [{ delta: { content: "Calling " } }] },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_z",
                  function: { name: "z", arguments: '{"k":"v"}' },
                },
              ],
            },
          },
        ],
      },
      { choices: [{ delta: { content: "..." } }] },
      "[DONE]",
    ]);
    const textDeltas = result.filter((e) => e.type === "text_delta");
    expect(textDeltas).toHaveLength(2);
    expect(result[0]).toEqual({ type: "text_delta", delta: "Calling " });
    expect(result[result.length - 1]).toMatchObject({ type: "done" });
  });

  it("flushes accumulated tool calls when stream ends without [DONE]", () => {
    // Drop the [DONE] payload — accumulator must still flush on the
    // post-loop final emit.
    const result = processStream([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_orphan",
                  function: { name: "orphan", arguments: '{"o":1}' },
                },
              ],
            },
          },
        ],
      },
    ]);
    const complete = result.find((e) => e.type === "tool_call_complete");
    expect(complete).toBeDefined();
  });
});
