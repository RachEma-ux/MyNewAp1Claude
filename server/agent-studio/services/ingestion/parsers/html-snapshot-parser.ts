/**
 * HTML snapshot parser — D-UI-5 MVP parser #3.
 *
 * Strips `<script>` and `<style>` content (security; we don't want
 * arbitrary JS bytes living next to text in the index). Emits one
 * `html_block` unit per top-level block element (article, section,
 * main, div), falling back to `body` text when no block elements are
 * present. Anchors are preserved as part metadata so citations can
 * resolve to a sub-document.
 */

import { load } from "cheerio";
import type { Parser, ParsedDocument, ParsedPart, RawArtifact } from "../types";

const BLOCK_SELECTOR = "article, section, main, div";

export const htmlSnapshotParser: Parser = {
  key: "html_snapshot",
  acceptsContentTypes: ["text/html", "application/xhtml+xml"],

  async parse(artifact: RawArtifact): Promise<ParsedDocument> {
    const html = artifact.bytes.toString("utf-8");
    const $ = load(html);

    // D-UI-3 / security: scripts and styles are not knowledge.
    $("script, style, noscript").remove();

    const fullText = ($("body").text() || $.root().text() || "").trim();

    const parts: ParsedPart[] = [];
    let idx = 0;
    const blocks = $(BLOCK_SELECTOR);

    if (blocks.length > 0) {
      blocks.each((_i, el) => {
        const $el = $(el);
        const text = $el.text().trim();
        if (text.length === 0) return;
        const id = ($el.attr("id") ?? "").trim() || null;
        const cls = ($el.attr("class") ?? "").trim() || null;
        const selector = id ? `#${id}` : cls ? `.${cls.split(/\s+/)[0]}` : null;
        parts.push({
          partId: `html-${idx++}`,
          text,
          unitTypeHint: "html_block",
          location: { selector },
          json: selector ? { selector } : undefined,
        });
      });
    }

    if (parts.length === 0 && fullText.length > 0) {
      parts.push({
        partId: "html-body",
        text: fullText,
        unitTypeHint: "html_block",
      });
    }

    return {
      parserKey: "html_snapshot",
      fullText,
      parts,
    };
  },
};
