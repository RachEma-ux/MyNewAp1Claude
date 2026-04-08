#!/usr/bin/env node
/**
 * Phase 12.5e — One-shot migration script
 *
 * Copies all rows from the legacy ags_* tables in `mynewap1claude`
 * to the new dedicated `asdb` database, then DROPS the legacy tables
 * from the source. Idempotent: re-runs are safe (no-op if source
 * tables don't exist).
 *
 * Use case: A deployed instance has Agent Studio data in the old
 * location (mynewap1claude.ags_*) and needs to move it to asdb.
 * After this script runs successfully, the source tables are dropped
 * to prevent confusion.
 *
 * Safety:
 *  1. Each table is processed in a transaction (per-table rollback
 *     on error).
 *  2. Source rows are COPY'd before any DROP runs.
 *  3. Row counts are verified after copy; mismatch aborts the drop.
 *  4. Use --dry-run to preview without writing.
 *  5. Use --no-drop to copy without dropping the source tables.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/migrate-ags-to-asdb.mjs
 *   DATABASE_URL=postgresql://... node scripts/migrate-ags-to-asdb.mjs --dry-run
 *   DATABASE_URL=postgresql://... node scripts/migrate-ags-to-asdb.mjs --no-drop
 *
 * After verification, this script can be deleted from the repo.
 */

import pg from "pg";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const NO_DROP = args.includes("--no-drop");

const SOURCE_URL =
  process.env.DATABASE_URL ||
  "postgresql://u0_a358@localhost:5432/mynewap1claude";

const TARGET_URL =
  process.env.DATABASE_URL_ASDB ||
  SOURCE_URL.replace(/\/[^/]+$/, "/asdb");

async function main() {
  console.log("=".repeat(60));
  console.log("ASDB Migration — Phase 12.5e");
  console.log("=".repeat(60));
  console.log("Source:", SOURCE_URL.replace(/:([^:@]+)@/, ":****@"));
  console.log("Target:", TARGET_URL.replace(/:([^:@]+)@/, ":****@"));
  console.log("Dry run:", DRY_RUN);
  console.log("Drop source after copy:", !NO_DROP && !DRY_RUN);
  console.log("");

  const source = new pg.Client({ connectionString: SOURCE_URL });
  const target = new pg.Client({ connectionString: TARGET_URL });
  await source.connect();
  await target.connect();

  // Find every ags_* table in the source DB
  const { rows: sourceTables } = await source.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'ags_%'
    ORDER BY tablename
  `);

  if (sourceTables.length === 0) {
    console.log("✓ No ags_* tables in source — nothing to migrate.");
    await source.end();
    await target.end();
    return;
  }

  console.log(`Found ${sourceTables.length} ags_* tables in source\n`);

  let totalCopied = 0;
  let totalFailed = 0;
  const failures = [];

  for (const { tablename } of sourceTables) {
    process.stdout.write(`  ${tablename}: `);

    try {
      // Verify the target table exists (asdb seed should have created it)
      const { rows: targetCheck } = await target.query(
        "SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=$1",
        [tablename]
      );
      if (targetCheck.length === 0) {
        console.log(`✗ target table missing — run seed first`);
        totalFailed++;
        failures.push({ table: tablename, error: "target table not found" });
        continue;
      }

      // Count source rows
      const { rows: srcCount } = await source.query(
        `SELECT COUNT(*) AS c FROM "${tablename}"`
      );
      const sourceRows = parseInt(srcCount[0].c, 10);

      if (sourceRows === 0) {
        console.log(`empty (0 rows) — skipped`);
        if (!DRY_RUN && !NO_DROP) {
          await source.query(`DROP TABLE "${tablename}"`);
        }
        continue;
      }

      if (DRY_RUN) {
        console.log(`would copy ${sourceRows} rows`);
        continue;
      }

      // Read all rows from source
      const { rows, fields } = await source.query(
        `SELECT * FROM "${tablename}"`
      );
      const cols = fields.map((f) => `"${f.name}"`).join(", ");
      const placeholders = (rowIdx) =>
        fields
          .map((_, colIdx) => `$${rowIdx * fields.length + colIdx + 1}`)
          .join(", ");

      // Insert into target — chunk into batches of 100 to avoid huge
      // single INSERTs that risk timing out
      await target.query("BEGIN");
      try {
        const BATCH = 100;
        for (let i = 0; i < rows.length; i += BATCH) {
          const batch = rows.slice(i, i + BATCH);
          const valuesSql = batch
            .map((_, idx) => `(${placeholders(idx)})`)
            .join(", ");
          const params = batch.flatMap((row) =>
            fields.map((f) => row[f.name])
          );
          await target.query(
            `INSERT INTO "${tablename}" (${cols}) VALUES ${valuesSql} ON CONFLICT DO NOTHING`,
            params
          );
        }
        await target.query("COMMIT");
      } catch (e) {
        await target.query("ROLLBACK");
        throw e;
      }

      // Verify counts match
      const { rows: tgtCount } = await target.query(
        `SELECT COUNT(*) AS c FROM "${tablename}"`
      );
      const targetRows = parseInt(tgtCount[0].c, 10);
      if (targetRows < sourceRows) {
        console.log(
          `✗ count mismatch: source=${sourceRows} target=${targetRows}`
        );
        totalFailed++;
        failures.push({
          table: tablename,
          error: `count mismatch ${sourceRows}→${targetRows}`,
        });
        continue;
      }

      // Drop source table
      if (!NO_DROP) {
        await source.query(`DROP TABLE "${tablename}"`);
        console.log(`✓ ${sourceRows} rows copied + source dropped`);
      } else {
        console.log(`✓ ${sourceRows} rows copied (source kept)`);
      }
      totalCopied += sourceRows;
    } catch (e) {
      console.log(`✗ ${e.message}`);
      totalFailed++;
      failures.push({ table: tablename, error: e.message });
    }
  }

  await source.end();
  await target.end();

  console.log("");
  console.log("=".repeat(60));
  console.log(
    `Result: ${totalCopied} rows copied, ${totalFailed} table failures`
  );
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) {
      console.log(`  ${f.table}: ${f.error}`);
    }
    process.exit(1);
  }
  console.log("✓ Migration complete");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
