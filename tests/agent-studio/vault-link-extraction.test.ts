/**
 * Phase 5 — vault wikilink / backlink / embed extraction tests.
 *
 * Pure unit tests. No DB. Locks the parser invariants.
 */

import { describe, it, expect } from "vitest";
import {
  extractLinksFromMarkdown,
  buildBacklinkRecords,
  resolveLinks,
} from "../../server/agent-studio/services/vault/public-api.js";

describe("Vault link extraction — wikilinks", () => {
  it("parses simple wikilink", () => {
    const r = extractLinksFromMarkdown("See [[Other Note]] for details.");
    expect(r.wikilinks.length).toBe(1);
    expect(r.wikilinks[0]?.targetSlug).toBe("Other Note");
    expect(r.wikilinks[0]?.headingAnchor).toBeNull();
    expect(r.wikilinks[0]?.alias).toBeNull();
    expect(r.wikilinks[0]?.isEmbed).toBe(false);
  });

  it("parses heading anchor", () => {
    const r = extractLinksFromMarkdown("See [[Other#Section A]].");
    expect(r.wikilinks[0]?.targetSlug).toBe("Other");
    expect(r.wikilinks[0]?.headingAnchor).toBe("Section A");
  });

  it("parses alias", () => {
    const r = extractLinksFromMarkdown("See [[Other Note|the other note]].");
    expect(r.wikilinks[0]?.targetSlug).toBe("Other Note");
    expect(r.wikilinks[0]?.alias).toBe("the other note");
  });

  it("parses heading + alias", () => {
    const r = extractLinksFromMarkdown("See [[Other#Section A|that section]].");
    expect(r.wikilinks[0]?.targetSlug).toBe("Other");
    expect(r.wikilinks[0]?.headingAnchor).toBe("Section A");
    expect(r.wikilinks[0]?.alias).toBe("that section");
  });

  it("parses note embed", () => {
    const r = extractLinksFromMarkdown("![[Other Note]]");
    expect(r.wikilinks.length).toBe(1);
    expect(r.wikilinks[0]?.isEmbed).toBe(true);
    expect(r.attachmentEmbeds.length).toBe(0);
  });

  it("classifies attachment embed", () => {
    const r = extractLinksFromMarkdown("![[diagram.png]]");
    expect(r.attachmentEmbeds.length).toBe(1);
    expect(r.attachmentEmbeds[0]?.filename).toBe("diagram.png");
    expect(r.wikilinks.length).toBe(0);
  });

  it("extracts multiple wikilinks", () => {
    const md = "Refer to [[Note A]] and [[Note B|B]] and ![[Note C]] and ![[image.jpg]].";
    const r = extractLinksFromMarkdown(md);
    expect(r.wikilinks.length).toBe(3);
    expect(r.wikilinks.map((w) => w.targetSlug).sort()).toEqual(["Note A", "Note B", "Note C"]);
    expect(r.attachmentEmbeds.length).toBe(1);
  });

  it("extracts tags", () => {
    const r = extractLinksFromMarkdown("This note covers #project-x and #ops/deploy as well.");
    expect(r.tagSlugs).toEqual(["project-x", "ops/deploy"]);
  });

  it("returns startOffset / endOffset for each wikilink", () => {
    const md = "abc [[Foo]] xyz";
    const r = extractLinksFromMarkdown(md);
    expect(r.wikilinks[0]?.startOffset).toBe(4);
    expect(r.wikilinks[0]?.endOffset).toBe(11);
  });
});

describe("Vault link extraction — backlink records", () => {
  it("builds backlink records with context snippet", () => {
    const md = "Lorem ipsum dolor sit amet [[Target]] consectetur adipiscing elit.";
    const r = extractLinksFromMarkdown(md);
    const records = buildBacklinkRecords(42, 100, md, r);
    expect(records.length).toBe(1);
    expect(records[0]?.targetSlug).toBe("Target");
    expect(records[0]?.sourceNoteId).toBe(42);
    expect(records[0]?.sourceVersionId).toBe(100);
    expect(records[0]?.contextSnippet).toContain("Target");
  });
});

describe("Vault link extraction — resolveLinks", () => {
  it("splits resolved vs unresolved by slug map", () => {
    const md = "[[Existing]] and [[Missing]]";
    const r = extractLinksFromMarkdown(md);
    const slugMap = new Map<string, number>([["Existing", 7]]);
    const { resolved, unresolved } = resolveLinks(r.wikilinks, slugMap);
    expect(resolved.length).toBe(1);
    expect(resolved[0]?.targetNoteId).toBe(7);
    expect(unresolved.length).toBe(1);
    expect(unresolved[0]?.wikilink.targetSlug).toBe("Missing");
  });
});
