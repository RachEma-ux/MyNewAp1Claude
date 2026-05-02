/**
 * Git pipeline — language / kind classifier.
 *
 * Inspects a path/extension and assigns a language. The result feeds
 * `data_acquisition_git_objects.language` and routing decisions for
 * code-aware downstream pipelines.
 */

const EXT_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  rb: "ruby",
  php: "php",
  sh: "shell",
  bash: "shell",
  yaml: "yaml",
  yml: "yaml",
  json: "json",
  toml: "toml",
  md: "markdown",
  sql: "sql",
};

export function classifyCode(path: string): {
  language: string;
  kind: "code" | "config" | "doc" | "data" | "binary";
} {
  const lower = path.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";
  const language = EXT_LANG[ext] ?? "unknown";
  if (["yaml", "yml", "json", "toml"].includes(ext))
    return { language, kind: "config" };
  if (["md", "rst", "txt"].includes(ext)) return { language, kind: "doc" };
  if (["csv", "parquet", "ndjson"].includes(ext))
    return { language, kind: "data" };
  if (["png", "jpg", "jpeg", "gif", "ico", "pdf", "zip", "tar"].includes(ext))
    return { language, kind: "binary" };
  return { language, kind: "code" };
}
