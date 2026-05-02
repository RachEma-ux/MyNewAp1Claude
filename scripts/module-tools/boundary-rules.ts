/**
 * Cross-module frontend boundary rules.
 *
 * One module's UI may not reach into another module's private
 * internals. The exact rules:
 *
 *   ALLOWED imports for `client/src/modules/<self>/...`:
 *     - any path not under `client/src/modules/<other>/`
 *     - `@/modules/<other>` (the public index — no subpath)
 *     - `@/components/ui/*`, `@/platform/*`, `@/lib/*`
 *
 *   FORBIDDEN imports (always):
 *     - `@/modules/<other>/pages/*`
 *     - `@/modules/<other>/components/*`
 *     - `@/modules/<other>/hooks/*`
 *     - `@/modules/<other>/api/*`
 *     - any relative climb that lands in another module's private dir
 *
 *   tRPC namespace rule:
 *     A file under `client/src/modules/<self>/...` may only call
 *     `trpc.<self>.*`. Any `trpc.<other>.*` is a cross-module backend
 *     reach-around — it must go through the gateway / public API of
 *     `<self>`'s own backend.
 *
 *     Modules MAY call platform-shared trpc namespaces (e.g.
 *     `trpc.auth`, `trpc.system`, `trpc.workspaces`) — those are
 *     considered platform-core, not "another RTLM".
 *
 *   MainLayout rule:
 *     Module pages and `mod.tsx` files may NOT import `MainLayout`.
 *     The platform decides where MainLayout wraps based on each
 *     module's `layoutMode`.
 *
 * The functions below are pure: they take (file path, content) and
 * return findings. The runner / reporter is in the check scripts.
 */

import { RTLM_FOLDER_MAP, RTLM_LIST, type RtlmKey } from "./migration-state";

export interface BoundaryFinding {
  /** Repo-relative path of the file with the violation. */
  file: string;
  /** Type of violation (used for grouping in the report). */
  kind:
    | "private-import"
    | "cross-module-trpc"
    | "main-layout-import"
    | "non-public-modules-import";
  /** Owning RTLM (the file's own module). */
  selfModule: RtlmKey | null;
  /** Other RTLM that the file is reaching into. */
  foreignModule: RtlmKey | null;
  /** The literal source line that triggered the finding. */
  evidence: string;
}

/* ------------------------------------------------------------------ */
/*  Public scanners                                                    */
/* ------------------------------------------------------------------ */

/**
 * Scan a single source file for boundary violations. Returns an empty
 * list when the file is clean. Caller threads `selfModule` (resolved
 * from the file path).
 */
export function scanFileForBoundaries(
  filePath: string,
  source: string,
): BoundaryFinding[] {
  const findings: BoundaryFinding[] = [];
  const selfModule = resolveSelfModule(filePath);

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;

    /* ---- private cross-module imports ---- */
    const importMatch =
      /import\s+[^"'`]*?from\s+["'`]([^"'`]+)["'`]/.exec(trimmed) ??
      /import\(\s*["'`]([^"'`]+)["'`]\s*\)/.exec(trimmed);
    if (importMatch) {
      const spec = importMatch[1];
      const cross = detectCrossModuleImport(spec, selfModule);
      if (cross) {
        findings.push({
          file: filePath,
          kind: cross.kind,
          selfModule,
          foreignModule: cross.foreignModule,
          evidence: trimmed,
        });
      }
      if (
        /MainLayout/.test(trimmed) &&
        /["'`][^"'`]*MainLayout[^"'`]*["'`]/.test(trimmed) &&
        isModuleFile(filePath)
      ) {
        findings.push({
          file: filePath,
          kind: "main-layout-import",
          selfModule,
          foreignModule: null,
          evidence: trimmed,
        });
      }
    }

    /* ---- cross-module trpc.<other>. ---- */
    if (selfModule) {
      const trpcMatch = trimmed.match(/trpc\s*\.\s*([A-Za-z_][\w]*)\s*\./);
      if (trpcMatch) {
        const ns = trpcMatch[1];
        if (
          isRtlmNamespace(ns) &&
          ns !== selfModule &&
          // tolerate `trpc.communicationCompat`-style typos in error messages
          !/trpc\.(auth|system|workspaces|hq|orchestrator|secrets|policies|modules)\b/.test(
            trimmed,
          )
        ) {
          findings.push({
            file: filePath,
            kind: "cross-module-trpc",
            selfModule,
            foreignModule: ns as RtlmKey,
            evidence: trimmed,
          });
        }
      }
    }
  }

  return findings;
}

/**
 * Detect whether an import specifier crosses a module boundary.
 * Returns `null` when the import is allowed.
 */
export function detectCrossModuleImport(
  spec: string,
  selfModule: RtlmKey | null,
):
  | null
  | {
      kind: "private-import" | "non-public-modules-import";
      foreignModule: RtlmKey | null;
    } {
  // Aliases
  // `@/modules/<folder>` — exactly the public index, allowed.
  // `@/modules/<folder>/<rest>` — private import unless rest is "index".
  const aliasMatch = /^@\/modules\/([a-z0-9-]+)(\/(.+))?$/.exec(spec);
  if (aliasMatch) {
    const folder = aliasMatch[1];
    const rest = aliasMatch[3];
    const foreign = folderToKey(folder);
    if (foreign && foreign !== selfModule) {
      if (!rest || rest === "index" || rest === "index.ts" || rest === "index.tsx") {
        return null; // public index — allowed
      }
      return { kind: "private-import", foreignModule: foreign };
    }
    return null; // same-module import via alias
  }

  // Relative climbs that include a `modules/<folder>/` segment.
  const relativeMatch = /(?:^|\/)modules\/([a-z0-9-]+)\/(.+)$/.exec(spec);
  if (relativeMatch) {
    const folder = relativeMatch[1];
    const rest = relativeMatch[2];
    const foreign = folderToKey(folder);
    if (foreign && foreign !== selfModule) {
      if (rest === "index" || rest === "index.ts" || rest === "index.tsx") {
        return null;
      }
      return { kind: "private-import", foreignModule: foreign };
    }
  }

  // Relative climbs into a sibling RTLM folder without an explicit
  // `modules/` segment, e.g. `../../<other-folder>/pages/Foo`. We
  // accept this as a violation only when the spec ends in a private
  // sub-directory (`pages`, `components`, `hooks`, `api`) — bare
  // `../../<other>` could be ambiguous.
  if (spec.startsWith("../") || spec.startsWith("./")) {
    const rel = /(?:^|\/)([a-z0-9-]+)\/(pages|components|hooks|api)\//.exec(spec);
    if (rel) {
      const foreign = folderToKey(rel[1]);
      if (foreign && foreign !== selfModule) {
        return { kind: "private-import", foreignModule: foreign };
      }
    }
  }

  // Bare reach-around: `from "modules/foo/bar"` (rare but possible)
  if (/^modules\//.test(spec)) {
    return { kind: "non-public-modules-import", foreignModule: null };
  }

  return null;
}

/**
 * Identify which RTLM owns the file by walking up its path until we
 * hit `client/src/modules/<folder>/`. Returns null for files outside
 * any module.
 */
export function resolveSelfModule(filePath: string): RtlmKey | null {
  const m = /client\/src\/modules\/([a-z0-9-]+)\//.exec(filePath);
  if (!m) return null;
  return folderToKey(m[1]);
}

/**
 * `true` when the file lives under `client/src/modules/<folder>/`.
 */
export function isModuleFile(filePath: string): boolean {
  return /client\/src\/modules\/[a-z0-9-]+\//.test(filePath);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function folderToKey(folder: string): RtlmKey | null {
  for (const [key, f] of Object.entries(RTLM_FOLDER_MAP)) {
    if (f === folder) return key as RtlmKey;
  }
  return null;
}

function isRtlmNamespace(ns: string): boolean {
  return (RTLM_LIST as readonly string[]).includes(ns);
}
