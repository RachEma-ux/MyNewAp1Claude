/**
 * Phase 28.2 — `seed-from-env.ts` orchestration tests.
 *
 * The script's `seedProvidersFromEnv` function is structured for
 * dependency injection so the heart of the boot-seed logic can be
 * exercised without a live DB or a real encrypt key. This test
 * file covers the four idempotency cases the script promises:
 * `created` / `rotated` / `skipped_already_exists` / `skipped_no_env`.
 */

import { describe, it, expect, vi } from "vitest";
import { seedProvidersFromEnv } from "../../scripts/provider-connections/seed-from-env";

interface FakeRow {
  id: number;
  type: string;
  name: string;
  enabled: boolean;
  priority: number;
  config: { apiKey: string };
}

function makeFakeDb(initialRows: FakeRow[] = []) {
  let rows = [...initialRows];
  let nextId = rows.length + 1;

  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<{ where: string; set: Record<string, unknown> }> = [];

  const builder = {
    select(_proj?: any) {
      return {
        from(_t: any) {
          return {
            where(predicate: { _matchType: string }) {
              return {
                limit(_n: number) {
                  return Promise.resolve(
                    rows.filter((r) => r.type === predicate._matchType),
                  );
                },
              };
            },
          };
        },
      };
    },
    insert(_t: any) {
      return {
        values(v: any) {
          inserts.push(v);
          rows.push({ ...(v as any), id: nextId++ });
          return Promise.resolve(undefined);
        },
      };
    },
    update(_t: any) {
      return {
        set(s: Record<string, unknown>) {
          return {
            where(predicate: { _matchType: string }) {
              updates.push({ where: predicate._matchType, set: s });
              rows = rows.map((r) =>
                r.type === predicate._matchType ? { ...r, ...(s as any) } : r,
              );
              return Promise.resolve(undefined);
            },
          };
        },
      };
    },
  };

  return {
    db: builder as unknown,
    inserts,
    updates,
    rows: () => rows,
  };
}

const fakeProvidersTable = {
  __name: "providers",
  type: { _matchType: "__placeholder__" },
} as any;

// `eq(table.type, X)` is invoked inside the script; we shim drizzle-orm's
// `eq` via a global mock so the predicate carries the matched value.
vi.mock("drizzle-orm", () => ({
  eq: (_col: any, value: string) => ({ _matchType: value }),
}));

const FAKE_ENCRYPT = (plaintext: string) => `enc:${plaintext}`;

describe("Phase 28.2 — seedProvidersFromEnv", () => {
  it("creates rows for env vars when no rows exist", async () => {
    const fake = makeFakeDb();
    const outcomes = await seedProvidersFromEnv({
      getDb: async () => fake.db,
      providersTable: fakeProvidersTable,
      encryptFn: FAKE_ENCRYPT,
      env: {
        OPENAI_API_KEY: "sk-test-openai",
        ANTHROPIC_API_KEY: "sk-test-anthropic",
      } as any,
      log: () => {},
    });

    const created = outcomes.filter((o) => o.result === "created");
    expect(created).toHaveLength(2);
    expect(created.map((o) => o.type).sort()).toEqual(["anthropic", "openai"]);

    expect(fake.inserts).toHaveLength(2);
    const openaiInsert = fake.inserts.find((i: any) => i.type === "openai") as any;
    expect(openaiInsert.config.apiKey).toBe("enc:sk-test-openai");
    expect(openaiInsert.enabled).toBe(true);
    expect(openaiInsert.priority).toBe(50);
  });

  it("skips rows that already exist (default; no --force)", async () => {
    const fake = makeFakeDb([
      {
        id: 1,
        type: "openai",
        name: "OpenAI",
        enabled: true,
        priority: 50,
        config: { apiKey: "enc:old-value" },
      },
    ]);

    const outcomes = await seedProvidersFromEnv({
      getDb: async () => fake.db,
      providersTable: fakeProvidersTable,
      encryptFn: FAKE_ENCRYPT,
      env: { OPENAI_API_KEY: "sk-rotated" } as any,
      log: () => {},
    });

    const openai = outcomes.find((o) => o.type === "openai")!;
    expect(openai.result).toBe("skipped_already_exists");
    expect(openai.reason).toMatch(/--force/);

    expect(fake.inserts).toHaveLength(0);
    expect(fake.updates).toHaveLength(0);
    expect(fake.rows()[0].config.apiKey).toBe("enc:old-value");
  });

  it("rotates with --force when row exists", async () => {
    const fake = makeFakeDb([
      {
        id: 1,
        type: "openai",
        name: "OpenAI",
        enabled: true,
        priority: 50,
        config: { apiKey: "enc:old-value" },
      },
    ]);

    const outcomes = await seedProvidersFromEnv(
      {
        getDb: async () => fake.db,
        providersTable: fakeProvidersTable,
        encryptFn: FAKE_ENCRYPT,
        env: { OPENAI_API_KEY: "sk-rotated" } as any,
        log: () => {},
      },
      { force: true },
    );

    const openai = outcomes.find((o) => o.type === "openai")!;
    expect(openai.result).toBe("rotated");
    expect(fake.updates).toHaveLength(1);
    expect((fake.updates[0].set as any).config.apiKey).toBe("enc:sk-rotated");
  });

  it("--dry-run produces an outcome plan without writing", async () => {
    const fake = makeFakeDb();
    const outcomes = await seedProvidersFromEnv(
      {
        getDb: async () => fake.db,
        providersTable: fakeProvidersTable,
        encryptFn: FAKE_ENCRYPT,
        env: { OPENAI_API_KEY: "sk-test" } as any,
        log: () => {},
      },
      { dryRun: true },
    );

    expect(outcomes.find((o) => o.type === "openai")!.result).toBe("created");
    expect(fake.inserts).toHaveLength(0);
  });

  it("skipped_no_env when no provider env vars are set", async () => {
    const fake = makeFakeDb();
    const outcomes = await seedProvidersFromEnv({
      getDb: async () => fake.db,
      providersTable: fakeProvidersTable,
      encryptFn: FAKE_ENCRYPT,
      env: {} as any,
      log: () => {},
    });

    expect(outcomes.every((o) => o.result === "skipped_no_env")).toBe(true);
    expect(outcomes).toHaveLength(4);
    expect(fake.inserts).toHaveLength(0);
  });

  it("routes every apiKey through the injected encrypt function before writing", async () => {
    const calls: string[] = [];
    const trackingEncrypt = (plaintext: string) => {
      calls.push(plaintext);
      return `<<<sealed:${calls.length}>>>`;
    };

    const fake = makeFakeDb();
    await seedProvidersFromEnv({
      getDb: async () => fake.db,
      providersTable: fakeProvidersTable,
      encryptFn: trackingEncrypt,
      env: {
        OPENAI_API_KEY: "plain-openai",
        ANTHROPIC_API_KEY: "plain-anthropic",
        GOOGLE_API_KEY: "plain-google",
        GROQ_API_KEY: "plain-groq",
      } as any,
      log: () => {},
    });

    expect(calls.sort()).toEqual([
      "plain-anthropic",
      "plain-google",
      "plain-groq",
      "plain-openai",
    ]);
    for (const insert of fake.inserts) {
      const cfg = (insert as any).config;
      expect(cfg.apiKey).toMatch(/^<<<sealed:\d+>>>$/);
    }
  });

  it("throws when DB is unavailable", async () => {
    await expect(
      seedProvidersFromEnv({
        getDb: async () => null,
        providersTable: fakeProvidersTable,
        encryptFn: FAKE_ENCRYPT,
        env: { OPENAI_API_KEY: "x" } as any,
        log: () => {},
      }),
    ).rejects.toThrow(/DB unavailable/);
  });
});
