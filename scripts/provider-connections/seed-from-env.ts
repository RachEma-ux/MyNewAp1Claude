#!/usr/bin/env tsx
/**
 * Provider Connections — boot-time seed from environment variables.
 *
 * **Phase 28.2 (PMB Plan v3 follow-up).** Plan v3 Decision D1 forbids
 * runtime code from reading provider keys from `process.env`. This
 * script is the single legitimate `process.env`-reading path for
 * provider credentials — it runs once at provisioning time (operator
 * or CI), reads the same `*_API_KEY` env vars the legacy boot block
 * used to consume, and writes encrypted rows to the `providers`
 * table.
 *
 * This script REPLACES the `autoProvisionProviders()` boot block at
 * `server/_core/index.ts:120-145`. The boot block was the LR-06 D1
 * violation; relocating the env read into this explicit operator-
 * invoked script closes that violation.
 *
 * **Scope choice (Phase 28.2 — Scope A):** This script writes to the
 * legacy `providers` table with the same encrypted-config shape the
 * boot block used. The `providers` table has three other readers
 * (`code-studio/opencode/provider-sync.ts`, `code-studio/opencode/
 * web-instance-manager.ts`, `kgra-agent/nodes.ts`); preserving the
 * write target keeps those readers working unchanged. Migrating the
 * reads to `provider_connections` (the Plan v3 source-of-truth table
 * for new code) is a separate Phase 28 follow-up that requires
 * porting all three call sites — out of scope here.
 *
 * **Idempotency:** mirrors the boot block's behavior — if a row of
 * the same `type` already exists, it is left untouched. To rotate a
 * key, pass `--force`.
 *
 * **Usage:**
 *
 *   pnpm tsx scripts/provider-connections/seed-from-env.ts          # write
 *   pnpm tsx scripts/provider-connections/seed-from-env.ts --dry-run # preview
 *   pnpm tsx scripts/provider-connections/seed-from-env.ts --force  # overwrite
 *
 * Exit codes:
 *
 *   0 — success (rows seeded or already present)
 *   1 — DB unavailable or other error
 *   2 — no env vars set (informational; not an error in dev)
 */

import { encrypt } from "../../server/secrets/encryption";

interface ProviderEnvEntry {
  envKey: string;
  name: string;
  type: string;
}

const ENV_PROVIDER_MAP: ReadonlyArray<ProviderEnvEntry> = [
  { envKey: "OPENAI_API_KEY", name: "OpenAI", type: "openai" },
  { envKey: "ANTHROPIC_API_KEY", name: "Anthropic", type: "anthropic" },
  { envKey: "GOOGLE_API_KEY", name: "Google", type: "google" },
  { envKey: "GROQ_API_KEY", name: "Groq", type: "groq" },
];

export interface SeedOutcome {
  type: string;
  envKey: string;
  result: "created" | "rotated" | "skipped_already_exists" | "skipped_no_env";
  reason?: string;
}

export interface SeedDeps {
  getDb: () => Promise<unknown>;
  providersTable: unknown;
  encryptFn: (plaintext: string) => string;
  env: NodeJS.ProcessEnv;
  log?: (line: string) => void;
}

/**
 * Pure orchestration; injectable deps so tests don't need a live DB
 * or a real encrypt key.
 */
export async function seedProvidersFromEnv(
  deps: SeedDeps,
  options: { force?: boolean; dryRun?: boolean } = {},
): Promise<SeedOutcome[]> {
  const log = deps.log ?? ((line: string) => console.log(line));
  const outcomes: SeedOutcome[] = [];

  const db = await deps.getDb();
  if (!db) {
    throw new Error("DB unavailable; cannot seed providers");
  }

  const { eq } = await import("drizzle-orm");

  for (const entry of ENV_PROVIDER_MAP) {
    const apiKey = deps.env[entry.envKey];
    if (!apiKey) {
      outcomes.push({
        type: entry.type,
        envKey: entry.envKey,
        result: "skipped_no_env",
      });
      continue;
    }

    const existing = await (db as any)
      .select()
      .from(deps.providersTable)
      .where(eq((deps.providersTable as any).type, entry.type))
      .limit(1);

    if (existing.length > 0 && !options.force) {
      outcomes.push({
        type: entry.type,
        envKey: entry.envKey,
        result: "skipped_already_exists",
        reason: "row exists; pass --force to overwrite",
      });
      continue;
    }

    if (options.dryRun) {
      outcomes.push({
        type: entry.type,
        envKey: entry.envKey,
        result: existing.length > 0 ? "rotated" : "created",
        reason: "dry-run; no write performed",
      });
      continue;
    }

    if (existing.length > 0 && options.force) {
      await (db as any)
        .update(deps.providersTable)
        .set({ config: { apiKey: deps.encryptFn(apiKey) } })
        .where(eq((deps.providersTable as any).type, entry.type));
      outcomes.push({
        type: entry.type,
        envKey: entry.envKey,
        result: "rotated",
      });
      log(`[seed-from-env] Rotated ${entry.name} provider from ${entry.envKey}`);
      continue;
    }

    await (db as any).insert(deps.providersTable).values({
      name: entry.name,
      type: entry.type,
      enabled: true,
      priority: 50,
      config: { apiKey: deps.encryptFn(apiKey) },
    });
    outcomes.push({
      type: entry.type,
      envKey: entry.envKey,
      result: "created",
    });
    log(`[seed-from-env] Created ${entry.name} provider from ${entry.envKey}`);
  }

  return outcomes;
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const force = args.has("--force");

  if (dryRun && force) {
    console.error("--dry-run and --force are mutually exclusive");
    process.exit(1);
  }

  const { getDb } = await import("../../server/db");
  const { providers } = await import("../../drizzle/schema");

  let outcomes: SeedOutcome[];
  try {
    outcomes = await seedProvidersFromEnv(
      {
        getDb: async () => getDb(),
        providersTable: providers,
        encryptFn: encrypt,
        env: process.env,
      },
      { dryRun, force },
    );
  } catch (err: any) {
    console.error(`[seed-from-env] Failed: ${err.message}`);
    process.exit(1);
  }

  const created = outcomes.filter((o) => o.result === "created").length;
  const rotated = outcomes.filter((o) => o.result === "rotated").length;
  const skippedExists = outcomes.filter((o) => o.result === "skipped_already_exists").length;
  const skippedNoEnv = outcomes.filter((o) => o.result === "skipped_no_env").length;

  console.log("");
  console.log(`[seed-from-env] Summary${dryRun ? " (dry-run)" : ""}:`);
  console.log(`  created:  ${created}`);
  console.log(`  rotated:  ${rotated}`);
  console.log(`  skipped:  ${skippedExists} (already exist)`);
  console.log(`  no env:   ${skippedNoEnv}`);

  if (skippedNoEnv === outcomes.length) {
    console.log("");
    console.log("[seed-from-env] No provider env vars set. Set OPENAI_API_KEY,");
    console.log("                ANTHROPIC_API_KEY, GOOGLE_API_KEY, and/or GROQ_API_KEY,");
    console.log("                then re-run.");
    process.exit(2);
  }

  process.exit(0);
}

// Only execute when run as a script, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
