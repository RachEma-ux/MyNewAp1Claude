/**
 * MCP OAuth — encryption-at-rest source-scan integrity.
 *
 * Slices 17 + 18 of the no-deferral catalogue (2026-05-19):
 *   - Slice 17: confirms the dispatcher's "TODO: revisit if/when async
 *     dispatch is needed" was converted to a load-bearing
 *     architectural-decision doc-comment (not a deferral).
 *   - Slice 18: closes the "Encryption-at-rest TODO" at api/router.ts:2002.
 *     oauthInitiate now encrypts clientSecret + state + codeVerifier +
 *     nonce before persisting; oauthExchange decrypts them transparently
 *     using isEncrypted for forward-compat with rows written before
 *     the slice landed.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.cwd();

describe("MCP dispatcher — slice 17 (sync-by-design)", () => {
  const src = readFileSync(
    join(REPO_ROOT, "server/agent-studio/services/mcp/dispatcher.ts"),
    "utf8",
  );

  it("no longer carries the 'TODO: revisit if/when async dispatch' deferral", () => {
    expect(src).not.toMatch(/TODO: revisit if\/when async dispatch is needed/);
  });

  it("documents the sync invariant as a load-bearing architectural decision", () => {
    expect(src).toMatch(/sync \*\*by design\*\*/);
    expect(src).toMatch(/gateRuntimeDispatch/);
  });
});

describe("MCP oauthInitiate — slice 18 (encryption-at-rest)", () => {
  const src = readFileSync(
    join(REPO_ROOT, "server/agent-studio/api/router.ts"),
    "utf8",
  );
  const startIdx = src.indexOf("oauthInitiate: protectedProcedure");
  expect(startIdx).toBeGreaterThan(-1);
  const endIdx = src.indexOf("oauthExchange: protectedProcedure", startIdx);
  expect(endIdx).toBeGreaterThan(startIdx);
  const block = src.slice(startIdx, endIdx);

  it("no longer carries the 'Encryption-at-rest TODO:' deferral marker", () => {
    // Match the original marker (TODO followed by a colon — the
    // deferral-shape). The slice-closure doc-comment intentionally
    // mentions the marker by name; the colon-suffix distinguishes
    // the prior open deferral from the documentation reference.
    expect(block).not.toMatch(/Encryption-at-rest TODO:/);
  });

  it("imports the platform encrypt() helper", () => {
    expect(block).toMatch(/const \{ encrypt \} = await import\(["']\.\.\/\.\.\/_core\/encryption["']\)/);
  });

  it("encrypts clientSecret on the persisted config when present", () => {
    expect(block).toMatch(/configToPersist\.clientSecret = encrypt\(configToPersist\.clientSecret\)/);
  });

  it("encrypts state nonce + codeVerifier + state on the persisted oauthState", () => {
    expect(block).toMatch(/codeVerifier["']/);
    expect(block).toMatch(/stateToPersist\[secretKey\] = encrypt\(v\)/);
  });
});

describe("MCP oauthExchange — slice 18 transparent decrypt", () => {
  const src = readFileSync(
    join(REPO_ROOT, "server/agent-studio/api/router.ts"),
    "utf8",
  );
  const startIdx = src.indexOf("oauthExchange: protectedProcedure");
  expect(startIdx).toBeGreaterThan(-1);
  const block = src.slice(startIdx, startIdx + 5000);

  it("imports decrypt + isEncrypted for transparent migration", () => {
    expect(block).toMatch(/const \{ decrypt: decryptStored, isEncrypted \} = await import\(["']\.\.\/\.\.\/_core\/encryption["']\)/);
  });

  it("uses an isEncrypted guard to round-trip both new + legacy rows", () => {
    expect(block).toMatch(/typeof v === ["']string["'] && isEncrypted\(v\) \? decryptStored\(v\) : v/);
  });

  it("decrypts clientSecret + state + codeVerifier + nonce before consuming", () => {
    expect(block).toMatch(/decryptedConfig\.clientSecret = maybeDecrypt/);
    expect(block).toMatch(/["']state["'], ["']codeVerifier["'], ["']nonce["']/);
  });

  it("CSRF check compares against the decrypted state, not the encrypted ciphertext", () => {
    expect(block).toMatch(/input\.state !== decryptedState\.state/);
  });
});
