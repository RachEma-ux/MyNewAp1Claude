/**
 * Phase 3.2 (Roadmap V3) — clientMessageId idempotency invariants.
 *
 * Locks the silent-dedup contract that prevents retries / EventSource
 * auto-reconnects / manual double-submits from creating duplicate
 * user messages, duplicate model spend, and duplicate tool dispatch
 * (the gap surfaced by Phase 1b §4).
 *
 * Source-scan invariants (cycle-7/8 h6-c7/h7-c7 pattern):
 *  1. The schema declares `client_message_id` on agsChatMessages
 *  2. The schema declares the lookup index
 *     `idx_ags_chat_messages_client_msg`
 *  3. The repository helper `appendChatMessageWithIdempotency` exists
 *     and returns `{ created, row }` for caller branching
 *  4. The chat-stream entry point parses `clientMessageId` from
 *     query params with length-cap validation
 *  5. The chat-stream entry point routes user persistence through
 *     `appendChatMessageWithIdempotency` and emits the
 *     `idempotency_conflict` SSE error code on duplicate
 *  6. Both client SSE callers (FAB widget + standalone page) generate
 *     a fresh `clientMessageId` per send and append it to the URL
 *  7. The manual migration SQL file exists for the partial UNIQUE
 *     INDEX backstop
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.cwd();
const SCHEMA = readFileSync(
  join(REPO_ROOT, "drizzle/tables/agent-studio.ts"),
  "utf8",
);
const REPOSITORY = readFileSync(
  join(REPO_ROOT, "server/agent-studio/repository.ts"),
  "utf8",
);
const CHAT_STREAM = readFileSync(
  join(REPO_ROOT, "server/agent-studio/chat-stream.ts"),
  "utf8",
);
const FAB = readFileSync(
  join(REPO_ROOT, "client/src/modules/agent-studio/components/AgentStudioChatWindow.tsx"),
  "utf8",
);
const PAGE = readFileSync(
  join(REPO_ROOT, "client/src/modules/agent-studio/pages/AgentChatPage.tsx"),
  "utf8",
);

describe("Phase 3.2 — clientMessageId idempotency invariants", () => {
  it("schema declares client_message_id varchar column on ags_chat_messages", () => {
    expect(SCHEMA).toMatch(
      /clientMessageId:\s*varchar\(["']client_message_id["'][^)]*\{\s*length:\s*64\s*\}/,
    );
  });

  it("schema declares the (sessionId, clientMessageId) lookup index", () => {
    expect(SCHEMA).toMatch(
      /clientMsgIdx:\s*index\(["']idx_ags_chat_messages_client_msg["']\)\.on\(\s*t\.sessionId\s*,\s*t\.clientMessageId/,
    );
  });

  it("repository exports appendChatMessageWithIdempotency with (created, row) shape", () => {
    expect(REPOSITORY).toMatch(
      /export\s+async\s+function\s+appendChatMessageWithIdempotency/,
    );
    expect(REPOSITORY).toMatch(
      /Promise<\{\s*created:\s*boolean\s*;\s*row:[\s\S]*?\}>/,
    );
  });

  it("repository helper checks (sessionId, clientMessageId) before INSERT for role=user", () => {
    // The "if user + clientMessageId set, SELECT first" branch must
    // exist in BOTH appendChatMessage and appendChatMessageWithIdempotency
    // — the simpler helper is kept for backward compat and must also
    // honor idempotency.
    const matches =
      REPOSITORY.match(
        /input\.role\s*===\s*["']user["']\s*&&\s*input\.clientMessageId/g,
      ) ?? [];
    expect(
      matches.length,
      `repository.ts must guard the SELECT-then-INSERT idempotency check ` +
        `in both appendChatMessage and appendChatMessageWithIdempotency ` +
        `(got ${matches.length}).`,
    ).toBeGreaterThanOrEqual(2);
  });

  it("chat-stream parses clientMessageId from query with length-cap validation", () => {
    expect(CHAT_STREAM).toMatch(
      /req\.query\.clientMessageId\s+as\s+string\s*\|\s*undefined/,
    );
    // Length cap matches the schema column (varchar(64)).
    expect(CHAT_STREAM).toMatch(/clientMessageIdRaw\.length\s*<=\s*64/);
  });

  it("chat-stream routes user persistence through appendChatMessageWithIdempotency", () => {
    expect(CHAT_STREAM).toMatch(
      /repo\.appendChatMessageWithIdempotency\(\s*\{[\s\S]*?role:\s*["']user["'][\s\S]*?clientMessageId/,
    );
  });

  it("chat-stream emits idempotency_conflict error code on duplicate", () => {
    // The error event must carry a stable `code` discriminator (Phase
    // 3.4 stable-error-codes contract) so clients can distinguish a
    // duplicate-send from other failure modes.
    expect(CHAT_STREAM).toMatch(/code:\s*["']idempotency_conflict["']/);
    // And the error path must end the stream after emitting (no further
    // tool dispatch on duplicate).
    const idempotencyBlock = CHAT_STREAM.match(
      /!userPersist\.created[\s\S]*?res\.end\(\)/,
    );
    expect(
      idempotencyBlock,
      `chat-stream must call res.end() inside the !userPersist.created ` +
        `branch — otherwise the duplicate request would continue to run ` +
        `the model and dispatch tools.`,
    ).not.toBeNull();
  });

  it("FAB widget generates a fresh clientMessageId per send and appends to URL", () => {
    expect(FAB).toMatch(/crypto\.randomUUID\(\)/);
    expect(FAB).toMatch(
      /URLSearchParams\(\{[\s\S]*?clientMessageId[\s\S]*?\}\)/,
    );
  });

  it("standalone AgentChatPage generates a fresh clientMessageId per send and appends to URL", () => {
    expect(PAGE).toMatch(/crypto\.randomUUID\(\)/);
    expect(PAGE).toMatch(
      /URLSearchParams\(\{[\s\S]*?clientMessageId[\s\S]*?\}\)/,
    );
  });

  it("manual migration SQL file exists for the partial UNIQUE INDEX backstop", () => {
    const path = join(
      REPO_ROOT,
      "scripts/migrations/manual/ags-chat-messages-client-message-id.sql",
    );
    expect(existsSync(path)).toBe(true);
    const sql = readFileSync(path, "utf8");
    // Must declare the partial unique index (NULLs allowed for non-user rows).
    expect(sql).toMatch(
      /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS[\s\S]*?ags_chat_messages\s*\(\s*session_id\s*,\s*client_message_id\s*\)[\s\S]*?WHERE\s+client_message_id\s+IS\s+NOT\s+NULL/i,
    );
  });
});
