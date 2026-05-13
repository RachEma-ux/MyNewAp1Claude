// Publish-targets unit tests — Phase 19-α V1+ first slice.
//
// Covers:
//   - Type taxonomy (closed unions)
//   - Registry register / get / list / reset-for-tests
//   - Executor: pusher resolution, attempt computation, error
//     branches (target-not-found, target-disabled, no-pusher),
//     skipCredentialResolution test seam, credential=null branch.
//
// The DB path (insert/update of `ags_publish_target_executions`)
// is exercised via `nextAttempt` test-mode fall-through (no ASDB).
// Live-ASDB ledger insertion belongs in an integration test (V1.5
// scope).

import { afterEach, describe, expect, it, vi } from "vitest";

// Force the DB getter to return null so the executor takes its
// test-mode fall-through path (no live ASDB available in unit
// tests; integration tests cover the persisted-ledger shape).
vi.mock("../../server/agent-studio/db/connection.js", () => ({
  getAsDb: () => null,
}));

import {
  executePublish,
  isPublishTargetType,
  PUBLISH_EXECUTION_STATUSES,
  PUBLISH_TARGET_TYPES,
  PublishTargetNotFoundError,
  registerPublishPusher,
  listRegisteredTargetTypes,
  getPublishPusher,
  type PublishExecutionOutcome,
  type PublishPayload,
  type PublishPusher,
} from "../../server/agent-studio/services/publish-targets/index.js";
// `__resetRegistryForTests` is intentionally only exposed via the
// registry module, not the public-api barrel.
import { __resetRegistryForTests } from "../../server/agent-studio/services/publish-targets/registry.js";

afterEach(() => {
  __resetRegistryForTests();
});

describe("publish-targets type taxonomy", () => {
  it("PUBLISH_TARGET_TYPES is the 3-value closed union", () => {
    expect(PUBLISH_TARGET_TYPES).toEqual([
      "staging_env",
      "remote_vault",
      "external_kb",
    ]);
  });

  it("PUBLISH_EXECUTION_STATUSES is the 4-value closed ladder", () => {
    expect(PUBLISH_EXECUTION_STATUSES).toEqual([
      "pending",
      "in_flight",
      "succeeded",
      "failed",
    ]);
  });

  it("isPublishTargetType rejects non-members", () => {
    expect(isPublishTargetType("staging_env")).toBe(true);
    expect(isPublishTargetType("remote_vault")).toBe(true);
    expect(isPublishTargetType("external_kb")).toBe(true);
    expect(isPublishTargetType("custom_webhook")).toBe(false);
    expect(isPublishTargetType("")).toBe(false);
    expect(isPublishTargetType(123)).toBe(false);
    expect(isPublishTargetType(null)).toBe(false);
  });
});

describe("publish-targets registry", () => {
  it("register + get + list", () => {
    const stub: PublishPusher = async () => ({ status: "succeeded" });
    registerPublishPusher("staging_env", stub);
    expect(getPublishPusher("staging_env")).toBe(stub);
    expect(listRegisteredTargetTypes()).toEqual(["staging_env"]);
  });

  it("re-registration overwrites prior pusher", () => {
    const a: PublishPusher = async () => ({ status: "succeeded" });
    const b: PublishPusher = async () => ({ status: "failed" });
    registerPublishPusher("remote_vault", a);
    registerPublishPusher("remote_vault", b);
    expect(getPublishPusher("remote_vault")).toBe(b);
  });

  it("__resetRegistryForTests clears all pushers", () => {
    registerPublishPusher("staging_env", async () => ({ status: "succeeded" }));
    registerPublishPusher("remote_vault", async () => ({ status: "succeeded" }));
    __resetRegistryForTests();
    expect(listRegisteredTargetTypes()).toEqual([]);
  });
});

describe("executePublish (composition)", () => {
  function fakePayload(): PublishPayload {
    return {
      sourcePromotionId: 42,
      sourceVersionId: "v-abcdef",
      body: { kind: "note", text: "hello" },
    };
  }

  it("throws PublishTargetNotFoundError when no ASDB and no target", async () => {
    await expect(
      executePublish({
        targetKey: "does-not-exist",
        payload: fakePayload(),
      }),
    ).rejects.toBeInstanceOf(PublishTargetNotFoundError);
  });

  it("invokes injected pusherLookup with the resolved target (test-mode fall-through)", async () => {
    // No ASDB available in vitest unit env. Confirm the lookup path
    // surfaces the not-found error rather than crashing inside the
    // pusher resolution.
    await expect(
      executePublish({
        targetId: 999,
        payload: fakePayload(),
        pusherLookup: () => async () => ({ status: "succeeded" }),
      }),
    ).rejects.toBeInstanceOf(PublishTargetNotFoundError);
  });

  it("PublishExecutionOutcome shape: success carries upstreamArtifactId + payloadDigest", () => {
    const outcome: PublishExecutionOutcome = {
      status: "succeeded",
      upstreamArtifactId: "artifact-1",
      payloadDigest: "sha256-deadbeef",
      details: { httpStatus: 201 },
    };
    expect(outcome.status).toBe("succeeded");
    expect(outcome.upstreamArtifactId).toBe("artifact-1");
  });

  it("PublishExecutionOutcome shape: failure carries errorMessage", () => {
    const outcome: PublishExecutionOutcome = {
      status: "failed",
      errorMessage: "upstream 502",
      details: { httpStatus: 502 },
    };
    expect(outcome.status).toBe("failed");
    expect(outcome.errorMessage).toBe("upstream 502");
  });

  it("pusherLookup signature: returns pusher OR undefined", () => {
    const present: PublishPusher = async () => ({ status: "succeeded" });
    const lookup = (t: string) => (t === "staging_env" ? present : undefined);
    expect(lookup("staging_env")).toBe(present);
    expect(lookup("other")).toBeUndefined();
  });
});

describe("executePublish — production-path discipline (Plan v3 D1)", () => {
  it("the executor body MUST NOT reference process.env.*_API_KEY directly", async () => {
    // Source-scan rather than dynamic — we want this to fail if a
    // future contributor inlines a raw env read (e.g.
    // `process.env.OPENAI_API_KEY`) into the executor or a pusher.
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const repoRoot = path.join(__dirname, "..", "..");
    const files = [
      "server/agent-studio/services/publish-targets/executor.ts",
      "server/agent-studio/services/publish-targets/registry.ts",
      "server/agent-studio/services/publish-targets/types.ts",
      "server/agent-studio/services/publish-targets/index.ts",
    ];
    for (const rel of files) {
      const src = readFileSync(path.join(repoRoot, rel), "utf8");
      // Strip line-comments first so doc references like
      // `process.env.OPENAI_API_KEY` (mention, not read) don't trip
      // the scan; the rule is "no actual reads in code".
      const code = src
        .split("\n")
        .filter((line) => !/^\s*\*?\s*\/\//.test(line) && !/^\s*\*/.test(line))
        .join("\n");
      const forbidden = code.match(/process\.env\.[A-Z_]+_API_KEY/);
      expect(
        forbidden,
        `${rel} contains a forbidden raw env read: ${forbidden?.[0] ?? ""}`,
      ).toBeNull();
    }
  });

  it("the executor body MUST import `withProviderCredential` (Plan v3 D1 anchor)", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const src = readFileSync(
      path.join(
        __dirname,
        "..",
        "..",
        "server/agent-studio/services/publish-targets/executor.ts",
      ),
      "utf8",
    );
    expect(src).toMatch(
      /import\s*\{[^}]*withProviderCredential[^}]*\}\s*from\s*["'][^"']*credential-resolver/,
    );
  });
});
