/**
 * Tool-call streaming + LR-XX doc-debt sweep — source-scan test.
 *
 * Slice 40 of the no-deferral continuation-3 catalogue (2026-05-19).
 * Asserts the closed-by-successor markers identified in the
 * continuation-3 re-audit have been rewritten to status-neutral
 * language.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("no-deferral slice 40 — tool-call streaming + LR-XX sweep", () => {
  it("chat-stream.ts no longer claims tool-call streaming is deferred", () => {
    const src = read("server/agent-studio/chat-stream.ts");
    expect(src).not.toContain(
      "Tool-call streaming on Model Access is deferred to a future\n    // phase",
    );
    // Successor must exist + be named — streamEvents shipped in slice 39.
    expect(src).toContain("streamEvents()");
    // Doc-block explains why chat-stream keeps execute() rather than
    // a stale "deferred" marker.
    expect(src).toContain("tool-loop");
    expect(src).toContain("FULL set of `toolCalls`");
  });

  it("Model Access streamEvents producer is present (slice 39 successor)", () => {
    const exec = read("server/openrouter/model-access/execute.ts");
    expect(exec).toMatch(/export async function\* streamEvents\(/);
  });

  it("catalogue's continuation-2 closure paragraph reflects LR-XX migrations", () => {
    const cat = read(
      "docs/implementation/agent-studio-no-deferral-todo-2026-05-19.md",
    );
    expect(cat).toContain("Post-continuation-3 update (slice 40 sweep)");
    expect(cat).toContain("already\n  shipped in Phase 29.4-29.6");
    expect(cat).toContain("Drain legacy fixtures helper deletion");
  });

  it("LR-02 caller (embeddings/service.ts) uses workspace-default binding", () => {
    const src = read("server/embeddings/service.ts");
    expect(src).toContain("resolveWorkspaceDefaultBinding");
    expect(src).toContain('role: "embedding"');
    // No legacy raw-key path.
    expect(src).not.toMatch(
      /new OpenAI\(\{\s*apiKey:\s*process\.env/,
    );
  });

  it("LR-03 caller (documents/processor.ts) routes through embedding service", () => {
    const src = read("server/documents/processor.ts");
    expect(src).toContain("getEmbeddingService");
    expect(src).toContain("storeChunkEmbeddings");
  });

  it("LR-04 caller (operators/provider-hub.ts) uses classifier binding", () => {
    const src = read("server/operators/provider-hub.ts");
    expect(src).toContain("OperatorBindingError");
    expect(src).toContain(
      "ags_workspace_default_provider_bindings (role='classifier')",
    );
  });

  it("LR-08 caller (chat/stream.ts) references post-LR-08 wiring", () => {
    const src = read("server/chat/stream.ts");
    expect(src).toContain("post-LR-08");
    expect(src).toContain("providerConnectionId");
  });
});
