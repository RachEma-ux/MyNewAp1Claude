/**
 * Shared `pg.Pool` factory with an `error` listener attached.
 *
 * Why this exists: `drizzle(connectionString, { schema })` auto-creates
 * an internal `pg.Pool` we never get a handle to. When the postmaster
 * bounces (Termux dev env, network blip, restart), the idle client
 * emits `error`. With no listener attached, Node's default handler
 * runs and the process exits — taking the dev server (and any tsx
 * watch) down. tsx watch only restarts on file edits, not on uncaught
 * exceptions, so the developer is left with a dead server.
 *
 * Fix: own the pool, attach a logging-only `error` listener BEFORE
 * handing it to drizzle. pg.Pool's documented behavior is to auto-
 * evict the errored client; the next query spawns a fresh client.
 * The listener just suppresses the would-be-fatal event.
 */

import pg from "pg";

/**
 * Create a `pg.Pool` for the given connection string and attach a
 * logging-only `error` listener so an idle-client error never
 * crashes the process.
 *
 * @param connectionString - libpq-shaped URL (postgres://… or
 *   postgresql://…). Same string you'd pass to `drizzle()`.
 * @param label - short prefix used in the error log line, e.g.
 *   `"Database"` or `"ASDB"`. Matches the existing console.log
 *   convention so log scrapers don't need a new key.
 */
export function buildPoolWithErrorLogger(
  connectionString: string,
  label: string,
): pg.Pool {
  const pool = new pg.Pool({ connectionString });
  pool.on("error", (err) => {
    console.error(
      `[${label}] idle pg client error (suppressed — process kept alive):`,
      err instanceof Error ? err.message : String(err),
    );
  });
  return pool;
}
