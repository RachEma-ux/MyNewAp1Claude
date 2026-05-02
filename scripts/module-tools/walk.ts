/**
 * Tiny recursive directory walker used by the generators and check
 * scripts. Returns absolute paths of `.ts` / `.tsx` files under the
 * given root, skipping `node_modules`, `dist`, build output, and
 * generated `.d.ts` files.
 *
 * No globs / minimatch / etc. — keeps the toolchain dependency-light
 * so checks can run in CI without `pnpm install`-ing extra packages.
 */

import { readdirSync, statSync } from "fs";
import { join } from "path";

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".vite",
  ".next",
  "coverage",
  ".turbo",
]);

export function* walkSourceFiles(root: string): IterableIterator<string> {
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e)) continue;
    const full = join(root, e);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      yield* walkSourceFiles(full);
      continue;
    }
    if (!st.isFile()) continue;
    if (e.endsWith(".d.ts")) continue;
    if (e.endsWith(".ts") || e.endsWith(".tsx")) yield full;
  }
}
