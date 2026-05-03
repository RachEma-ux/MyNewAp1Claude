/**
 * Unit tests for the slim Shiki highlighter.
 *
 * The point of these tests is the contract that prevents the bundle
 * regression PR 11 fixes:
 *   - the allow-list is the boundary; languages outside it must fall
 *     back to plain text without invoking any Shiki code path
 *   - aliases (js, ts, py, sh, …) must normalize to the canonical id
 *   - `__SUPPORTED_LANGUAGES__` must match the runtime allow-list
 *
 * We deliberately do NOT test the highlighter's actual codeToHtml
 * output here — that would require booting `shiki/core` + loading a
 * grammar chunk under jsdom, which is real-browser-only territory
 * for these dynamic imports. End-to-end highlight rendering is
 * verified by the production build emitting the expected per-language
 * chunks (see scripts/check-bundle-budget.ts).
 */

import { describe, expect, it } from "vitest";
import {
  __SUPPORTED_LANGUAGES__,
  highlightCode,
  normalizeLanguage,
} from "../../client/src/lib/shiki/SlimShikiHighlighter";

describe("SlimShikiHighlighter — normalizeLanguage", () => {
  it("maps common aliases to canonical ids", () => {
    expect(normalizeLanguage("js")).toBe("javascript");
    expect(normalizeLanguage("ts")).toBe("typescript");
    expect(normalizeLanguage("py")).toBe("python");
    expect(normalizeLanguage("rs")).toBe("rust");
    expect(normalizeLanguage("sh")).toBe("bash");
    expect(normalizeLanguage("zsh")).toBe("bash");
    expect(normalizeLanguage("yml")).toBe("yaml");
    expect(normalizeLanguage("md")).toBe("markdown");
    expect(normalizeLanguage("docker")).toBe("dockerfile");
    expect(normalizeLanguage("c++")).toBe("cpp");
    expect(normalizeLanguage("c#")).toBe("csharp");
    expect(normalizeLanguage("kt")).toBe("kotlin");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(normalizeLanguage("  TypeScript  ")).toBe("typescript");
    expect(normalizeLanguage("PYTHON")).toBe("python");
  });

  it("returns null for nullish, empty, or unknown languages", () => {
    expect(normalizeLanguage(null)).toBeNull();
    expect(normalizeLanguage(undefined)).toBeNull();
    expect(normalizeLanguage("")).toBeNull();
    expect(normalizeLanguage("emacs-lisp")).toBeNull();
    expect(normalizeLanguage("wolfram")).toBeNull();
    expect(normalizeLanguage("mermaid")).toBeNull();
    expect(normalizeLanguage("wasm")).toBeNull();
  });
});

describe("SlimShikiHighlighter — allow-list", () => {
  it("includes the common languages we ship", () => {
    const langs = new Set(__SUPPORTED_LANGUAGES__);
    for (const expected of [
      "javascript",
      "typescript",
      "tsx",
      "jsx",
      "python",
      "bash",
      "json",
      "yaml",
      "markdown",
      "html",
      "css",
      "sql",
    ]) {
      expect(langs.has(expected)).toBe(true);
    }
  });

  it("excludes the heavy grammars the readiness audit flagged", () => {
    // These were the four big language chunks (>600 KB each)
    // emitted by the previous Streamdown-bundled-Shiki pipeline.
    // Including any of them in the allow-list would re-emit them.
    const forbidden = ["emacs-lisp", "wolfram", "wasm"];
    for (const lang of forbidden) {
      expect(__SUPPORTED_LANGUAGES__).not.toContain(lang);
    }
  });
});

describe("SlimShikiHighlighter — highlightCode fallback", () => {
  it("falls back to escaped plain-text for unsupported languages without booting Shiki", async () => {
    const result = await highlightCode({
      code: "<script>alert(1)</script>\nconst x = 1;",
      language: "emacs-lisp",
      themes: { light: "github-light", dark: "github-dark" },
    });
    expect(result.fallback).toBe(true);
    // HTML is escaped — no raw < or > or & survive into the output.
    expect(result.light).toContain("&lt;script&gt;");
    expect(result.light).not.toContain("<script>");
    expect(result.light).toBe(result.dark); // light/dark identical for plaintext
    expect(result.light).toContain("shiki-fallback");
  });

  it("falls back when language is null/undefined/empty", async () => {
    for (const lang of [null, undefined, ""]) {
      const result = await highlightCode({
        code: "anything",
        language: lang,
        themes: { light: "github-light", dark: "github-dark" },
      });
      expect(result.fallback).toBe(true);
    }
  });
});
