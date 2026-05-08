/**
 * U5-b.2 — License extractor unit tests.
 *
 * Per `RAC_PII_LICENSE_ENFORCEMENT.md` DD2: HTML / JSON / code each
 * have a parser-specific license signal source. Other parsers leave
 * NULL.
 */

import { describe, it, expect } from "vitest";
import {
  extractLicenseFromHtml,
  extractLicenseFromJson,
  extractLicenseFromCode,
} from "../../server/agent-studio/services/ingestion/license-extractor";

describe("extractLicenseFromHtml", () => {
  it("reads <link rel=\"license\" href=...>", () => {
    const html =
      '<html><head><link rel="license" href="https://opensource.org/licenses/MIT"></head><body>x</body></html>';
    expect(extractLicenseFromHtml(html)).toBe("https://opensource.org/licenses/MIT");
  });

  it("reads <meta name=\"license\" content=...> when no <link> present", () => {
    const html =
      '<html><head><meta name="license" content="CC-BY-4.0"></head><body>x</body></html>';
    expect(extractLicenseFromHtml(html)).toBe("CC-BY-4.0");
  });

  it("prefers <link rel=license> when both are present", () => {
    const html =
      '<head><meta name="license" content="from-meta"><link rel="license" href="from-link"></head>';
    expect(extractLicenseFromHtml(html)).toBe("from-link");
  });

  it("handles single-quoted attributes", () => {
    const html = `<head><meta name='license' content='Apache-2.0'></head>`;
    expect(extractLicenseFromHtml(html)).toBe("Apache-2.0");
  });

  it("handles unquoted href values", () => {
    const html = "<head><link rel=license href=ISC></head>";
    expect(extractLicenseFromHtml(html)).toBe("ISC");
  });

  it("returns null when no license signal is present", () => {
    expect(extractLicenseFromHtml("<html><body><p>plain</p></body></html>")).toBeNull();
  });

  it("returns null on empty string", () => {
    expect(extractLicenseFromHtml("")).toBeNull();
  });

  it("clamps license values to VARCHAR(64)", () => {
    const longUrl = "https://example.com/licenses/" + "a".repeat(100);
    const html = `<link rel="license" href="${longUrl}">`;
    const result = extractLicenseFromHtml(html);
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(64);
  });
});

describe("extractLicenseFromJson", () => {
  it("reads top-level string license", () => {
    expect(extractLicenseFromJson({ license: "MIT" })).toBe("MIT");
  });

  it("reads npm-style {type: ...} object license", () => {
    expect(extractLicenseFromJson({ license: { type: "Apache-2.0", url: "..." } })).toBe(
      "Apache-2.0",
    );
  });

  it("returns null for missing license", () => {
    expect(extractLicenseFromJson({ name: "pkg", version: "1.0.0" })).toBeNull();
  });

  it("returns null for non-string non-object license values", () => {
    expect(extractLicenseFromJson({ license: 42 })).toBeNull();
    expect(extractLicenseFromJson({ license: null })).toBeNull();
    expect(extractLicenseFromJson({ license: ["MIT"] })).toBeNull();
  });

  it("returns null for non-object inputs", () => {
    expect(extractLicenseFromJson(null)).toBeNull();
    expect(extractLicenseFromJson("MIT")).toBeNull();
    expect(extractLicenseFromJson(42)).toBeNull();
    expect(extractLicenseFromJson([{ license: "MIT" }])).toBeNull();
  });

  it("trims whitespace from string licenses", () => {
    expect(extractLicenseFromJson({ license: "  MIT  " })).toBe("MIT");
  });
});

describe("extractLicenseFromCode", () => {
  it("reads // SPDX-License-Identifier (TS/JS/Rust/Go)", () => {
    const code = `// SPDX-License-Identifier: MIT\n\nimport { foo } from "bar";`;
    expect(extractLicenseFromCode(code)).toBe("MIT");
  });

  it("reads /* SPDX-License-Identifier (block comment)", () => {
    const code = `/* SPDX-License-Identifier: Apache-2.0 */\nfunction f() {}`;
    expect(extractLicenseFromCode(code)).toBe("Apache-2.0");
  });

  it("reads * SPDX-License-Identifier (multi-line block)", () => {
    const code = `/*\n * Copyright (c) 2026\n * SPDX-License-Identifier: GPL-3.0-or-later\n */\nclass X {}`;
    expect(extractLicenseFromCode(code)).toBe("GPL-3.0-or-later");
  });

  it("reads # SPDX-License-Identifier (Python/shell/Ruby)", () => {
    const code = `#!/usr/bin/env python\n# SPDX-License-Identifier: BSD-3-Clause\n\ndef main(): pass`;
    expect(extractLicenseFromCode(code)).toBe("BSD-3-Clause");
  });

  it("reads -- SPDX-License-Identifier (SQL/Haskell)", () => {
    const code = `-- SPDX-License-Identifier: ISC\nSELECT 1;`;
    expect(extractLicenseFromCode(code)).toBe("ISC");
  });

  it("rejects SPDX strings inside string literals (no comment delimiter)", () => {
    const code = `const x = "SPDX-License-Identifier: MIT";\nfunction f() {}`;
    expect(extractLicenseFromCode(code)).toBeNull();
  });

  it("returns null when no SPDX line in first 20 lines", () => {
    const lines = Array(25).fill("// nothing").join("\n");
    const code = `${lines}\n// SPDX-License-Identifier: MIT\n`;
    expect(extractLicenseFromCode(code)).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(extractLicenseFromCode("")).toBeNull();
  });

  it("trims whitespace around the identifier", () => {
    const code = `//   SPDX-License-Identifier:    MIT   \n`;
    expect(extractLicenseFromCode(code)).toBe("MIT");
  });

  it("clamps long license strings to VARCHAR(64)", () => {
    const longId = "a".repeat(100);
    const code = `// SPDX-License-Identifier: ${longId}\n`;
    const result = extractLicenseFromCode(code);
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(64);
  });
});
