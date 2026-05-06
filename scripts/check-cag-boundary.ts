#!/usr/bin/env tsx
/**
 * check:cag-boundary
 *
 * RAC Phase 1E — enforces the CAG (Capability Pack) module boundary
 * rules from RAC_NATIVE_ARCHITECTURE.md and D-TOOL-5:
 *
 *   Rule A — No file under `server/agent-studio/services/cag/**` may
 *   import from any of the following runtime / secret / RAG paths.
 *   The CAG subtree is a pure-derivation module: it consumes
 *   manifests + drafts and emits prompt sections. It must never
 *   reach the live tool execution path, the credential resolver,
 *   the encryption layer, or the document/vector chunk stores.
 *
 *   Rule B — No file under `server/agent-studio/services/cag/**`
 *   may write or recompute `riskClass` (D-TOOL-5). The classification
 *   field is owned by the MCP manifest contract; CAG only reads.
 *   The lint flags any `<expr>.riskClass =` assignment. Test files
 *   are exempt because they construct fixture data through object
 *   literals, not assignments.
 *
 * Future Rule C (deferred until P6 runtime orchestration lands):
 *   The original P1E phrasing was "the composer is the only file that
 *   imports both CAG resolver and RAC assembler". With the P5
 *   assembler now in place, that simple wording conflicts with the
 *   planned P6 edits to `chat-stream.ts`, `services/chat.ts`, and
 *   `services/test-run-binding.ts` — those files will need to import
 *   `resolveCagPack`, the planner/executor/filter, AND the assembler
 *   so they can feed the composer. The honest invariant is "no file
 *   outside the composer combines a CAG section + a retrieval-evidence
 *   section into a finished prompt string" — which is hard to lint
 *   structurally without type-aware AST. P6 lands a thin runtime
 *   orchestrator that owns the resolver→executor→filter→assembler→
 *   composer dance; once that exists, Rule C becomes "only the
 *   orchestrator and the composer may import the assembler", which
 *   IS structurally lintable. Until then, this header is the contract.
 */

import { dirname, join, relative, resolve, sep } from "path";
import {
  REPO_ROOT,
  listSourceFiles,
  readFile,
  type Violation,
} from "./lib/module-graph";

const CAG_DIR_REL_PATH = "server/agent-studio/services/cag/";

/**
 * Forbidden import targets, expressed as repo-relative paths
 * (POSIX-style separators, no extension). A specifier matches if,
 * after resolving relative paths against the importer's directory
 * and stripping any `.ts/.js` extension, it equals one of these or
 * sits underneath one of these directories.
 */
const FORBIDDEN_IMPORT_TARGETS: ReadonlyArray<{
  target: string;
  kind: "file" | "dir";
  doc: string;
}> = [
  {
    target: "server/agent-studio/services/mcp/dispatcher",
    kind: "file",
    doc: "live MCP tool execution — CAG is pre-execution; the dispatcher path is the runtime side.",
  },
  {
    target: "server/provider-connections/internal/credential-resolver",
    kind: "file",
    doc: "decrypted-credential reach — only server/openrouter/model-access/** may resolve credentials (Plan v3 D2).",
  },
  {
    target: "server/secrets/encryption",
    kind: "file",
    doc: "raw encryption primitives — secrets layer is off-limits to derivation modules.",
  },
  {
    target: "server/documents/db",
    kind: "file",
    doc: "RAG chunk store — chunk retrieval is RAC's domain (P5), not CAG's.",
  },
  {
    target: "server/documents/rag-pipeline",
    kind: "file",
    doc: "RAG ingestion pipeline — chunk-shaped data must not enter the capability pack.",
  },
  {
    target: "server/vectordb",
    kind: "dir",
    doc: "vector store — same rationale as the chunk store.",
  },
  {
    target: "server/embeddings",
    kind: "dir",
    doc: "embedding generation — CAG does not embed; it summarises capabilities.",
  },
];

/** Strip `.ts/.tsx/.js/.mjs/.cjs` for uniform suffix matching. */
function stripExt(spec: string): string {
  return spec.replace(/\.(tsx?|m?js|cjs)$/, "");
}

/**
 * Resolve an import specifier against the importing file to a repo-
 * relative posix path with no extension. Relative specs go through
 * `path.resolve`. The `@/` alias and bare-name `server/...` specs are
 * normalised to their repo-relative form. Anything else (npm package,
 * unknown alias) returns null.
 */
function resolveSpecToRepoRel(
  fileAbs: string,
  spec: string,
): string | null {
  const stripped = stripExt(spec);
  let abs: string | null = null;
  if (stripped.startsWith("./") || stripped.startsWith("../")) {
    abs = resolve(dirname(fileAbs), stripped);
  } else if (stripped.startsWith("@/")) {
    // `@/x` → `client/src/x` per tsconfig path alias. We don't lint
    // client files for this rule, but normalise anyway.
    abs = resolve(REPO_ROOT, "client/src", stripped.slice(2));
  } else if (stripped.startsWith("@shared/")) {
    abs = resolve(REPO_ROOT, "shared", stripped.slice("@shared/".length));
  } else if (stripped.startsWith("server/") || stripped.startsWith("client/") || stripped.startsWith("shared/")) {
    abs = resolve(REPO_ROOT, stripped);
  } else {
    return null; // npm package or unsupported alias
  }
  return relative(REPO_ROOT, abs).split(sep).join("/");
}

function importerSpecifierMatchesForbiddenTarget(
  fileAbs: string,
  spec: string,
): { target: string; doc: string } | null {
  const repoRel = resolveSpecToRepoRel(fileAbs, spec);
  if (!repoRel) return null;
  for (const t of FORBIDDEN_IMPORT_TARGETS) {
    if (t.kind === "file") {
      if (repoRel === t.target) return { target: t.target, doc: t.doc };
    } else {
      // dir match: the spec resolves to the directory itself or to
      // anything beneath it.
      if (repoRel === t.target || repoRel.startsWith(`${t.target}/`)) {
        return { target: t.target, doc: t.doc };
      }
    }
  }
  return null;
}

const importRegex =
  /(?:^|\n)\s*(?:import\s[^"';]+from\s*|import\s*|export\s[^"';]*from\s*)["']([^"']+)["']/g;

// `(?!=)` excludes `==` / `===` comparisons; only single-`=` property
// assignments (`x.riskClass = ...`) are flagged. The leading
// `(?<![=!<>])` keeps us out of `!==` etc. on the left side as well.
const riskClassWriteRegex =
  /(?<![=!<>])[A-Za-z_$][\w$]*\s*\.\s*riskClass\s*=(?!=)/g;

function computeLine(src: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx; i++) if (src[i] === "\n") line++;
  return line;
}

function isCagFile(fileRel: string): boolean {
  return fileRel.startsWith(CAG_DIR_REL_PATH);
}

function isTestFile(fileRel: string): boolean {
  return /\.(test|spec)\.tsx?$/.test(fileRel);
}

function main(): void {
  const violations: Violation[] = [];
  const serverFiles = listSourceFiles(join(REPO_ROOT, "server"));

  for (const file of serverFiles) {
    const fileRel = relative(REPO_ROOT, file).split(sep).join("/");
    if (!isCagFile(fileRel)) continue;

    const src = readFile(file);

    // ── Rule A: forbidden imports ─────────────────────────────────────
    importRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(src)) !== null) {
      const spec = match[1];
      const hit = importerSpecifierMatchesForbiddenTarget(file, spec);
      if (!hit) continue;
      const line = computeLine(src, match.index);
      violations.push({
        rule: "cag-boundary/forbidden-import",
        file: fileRel,
        line,
        severity: "error",
        message: `CAG file imports forbidden target "${spec}" (resolves to ${hit.target}). Reason: ${hit.doc}`,
      });
    }

    // ── Rule B: no riskClass writes (test files exempt) ───────────────
    if (!isTestFile(fileRel)) {
      riskClassWriteRegex.lastIndex = 0;
      let writeMatch: RegExpExecArray | null;
      while ((writeMatch = riskClassWriteRegex.exec(src)) !== null) {
        const line = computeLine(src, writeMatch.index);
        violations.push({
          rule: "cag-boundary/risk-class-write",
          file: fileRel,
          line,
          severity: "error",
          message:
            "CAG file writes to `.riskClass` (D-TOOL-5). The classification field is owned by the MCP manifest contract; CAG must read, never recompute.",
        });
      }
    }
  }

  for (const v of violations) {
    console.error(`[ERROR] ${v.rule} :: ${v.file}:${v.line}\n        ${v.message}`);
  }

  if (violations.length > 0) {
    console.error(`\n${violations.length} CAG boundary violation(s).`);
    process.exit(1);
  }

  console.log("OK — CAG boundary check passed (Rules A + B).");
  process.exit(0);
}

main();
