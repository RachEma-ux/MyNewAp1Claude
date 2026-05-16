/**
 * Phase B §T-B.8 — `summarizeAttachments` lockstep.
 *
 * Composite aggregator over the `AttachmentRow` surface combining
 * derived-closed-taxonomy (MIME category) + sparse open-ended axis
 * (raw mimeType) + top-N truncation + complementary partitions
 * (anchored/orphan, sourceArtifact/non) + NumericStats (size, age) +
 * presence gauges (creator, vault).
 *
 * 26th instantiation of the lesson-30 aggregator-pair pattern. No
 * new structural variant — pattern saturated at 15 variants @ T-A.15.
 */

import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_MIME_CATEGORIES,
  summarizeAttachments,
} from "../../server/agent-studio/services/vault/attachment-summary.js";
import type { AttachmentRow } from "../../server/agent-studio/services/vault/attachments.js";

const FROZEN_NOW = new Date("2026-05-16T12:00:00Z");

function makeRow(overrides: Partial<AttachmentRow> = {}): AttachmentRow {
  return {
    id: 1,
    vaultId: 1,
    noteId: 1,
    filename: "test.txt",
    mimeType: "text/plain",
    sizeBytes: 1000,
    storageUri: "asdb://test",
    contentHash: "hash",
    createdByUserId: 1,
    isSourceArtifact: false,
    createdAt: FROZEN_NOW,
    ...overrides,
  };
}

describe("ATTACHMENT_MIME_CATEGORIES — closed taxonomy", () => {
  it("contains exactly the 3 expected categories", () => {
    expect(ATTACHMENT_MIME_CATEGORIES).toEqual(["image", "pdf", "other"]);
  });
});

describe("summarizeAttachments — empty input", () => {
  it("zero on every axis when input is empty", () => {
    const s = summarizeAttachments([]);
    expect(s.total).toBe(0);
    expect(s.distinctMimeTypeCount).toBe(0);
    expect(s.distinctVaultCount).toBe(0);
    expect(s.topMimeTypes).toEqual([]);
    expect(s.anchoredCount).toBe(0);
    expect(s.orphanCount).toBe(0);
    expect(s.sourceArtifactCount).toBe(0);
    expect(s.nonSourceArtifactCount).toBe(0);
    expect(s.withCreatorCount).toBe(0);
    expect(s.sizeStats).toBeNull();
    expect(s.ageStats).toBeNull();
    expect(s.byMimeType).toEqual({});
  });

  it("zero-fills the closed mime-category taxonomy on empty", () => {
    const s = summarizeAttachments([]);
    expect(s.byMimeCategory).toEqual({ image: 0, pdf: 0, other: 0 });
  });
});

describe("summarizeAttachments — closed mime-category axis", () => {
  it("classifies images / pdfs / others correctly", () => {
    const s = summarizeAttachments([
      makeRow({ mimeType: "image/png" }),
      makeRow({ mimeType: "image/jpeg" }),
      makeRow({ mimeType: "application/pdf" }),
      makeRow({ mimeType: "text/plain" }),
      makeRow({ mimeType: "application/octet-stream" }),
    ]);
    expect(s.byMimeCategory.image).toBe(2);
    expect(s.byMimeCategory.pdf).toBe(1);
    expect(s.byMimeCategory.other).toBe(2);
  });

  it("pdf with charset still classifies as pdf", () => {
    const s = summarizeAttachments([
      makeRow({ mimeType: "application/pdf;charset=utf-8" }),
    ]);
    expect(s.byMimeCategory.pdf).toBe(1);
  });

  it("category sum equals total (partition invariant)", () => {
    const s = summarizeAttachments([
      makeRow({ mimeType: "image/png" }),
      makeRow({ mimeType: "application/pdf" }),
      makeRow({ mimeType: "text/plain" }),
    ]);
    const sum =
      s.byMimeCategory.image + s.byMimeCategory.pdf + s.byMimeCategory.other;
    expect(sum).toBe(s.total);
  });
});

describe("summarizeAttachments — sparse mime-type axis + top-N", () => {
  it("counts per raw mimeType", () => {
    const s = summarizeAttachments([
      makeRow({ mimeType: "image/png" }),
      makeRow({ mimeType: "image/png" }),
      makeRow({ mimeType: "image/jpeg" }),
    ]);
    expect(s.byMimeType["image/png"]).toBe(2);
    expect(s.byMimeType["image/jpeg"]).toBe(1);
    expect(s.distinctMimeTypeCount).toBe(2);
  });

  it("topMimeTypes sorted descending; ties alphabetical", () => {
    const rows: AttachmentRow[] = [];
    for (let i = 0; i < 5; i++) rows.push(makeRow({ mimeType: "a/x" }));
    for (let i = 0; i < 3; i++) rows.push(makeRow({ mimeType: "b/y" }));
    rows.push(makeRow({ mimeType: "c/z" }));
    rows.push(makeRow({ mimeType: "d/w" }));
    const s = summarizeAttachments(rows);
    expect(s.topMimeTypes).toEqual([
      { key: "a/x", count: 5 },
      { key: "b/y", count: 3 },
      { key: "c/z", count: 1 },
      { key: "d/w", count: 1 },
    ]);
  });

  it("default truncates at 10; custom topN works", () => {
    const rows: AttachmentRow[] = [];
    for (let i = 0; i < 15; i++) rows.push(makeRow({ mimeType: `t/${i}` }));
    expect(summarizeAttachments(rows).topMimeTypes).toHaveLength(10);
    expect(summarizeAttachments(rows, { topN: 3 }).topMimeTypes).toHaveLength(3);
  });
});

describe("summarizeAttachments — complementary partitions", () => {
  it("anchored + orphan equals total", () => {
    const s = summarizeAttachments([
      makeRow({ noteId: 1 }),
      makeRow({ noteId: 2 }),
      makeRow({ noteId: null }),
    ]);
    expect(s.anchoredCount).toBe(2);
    expect(s.orphanCount).toBe(1);
    expect(s.anchoredCount + s.orphanCount).toBe(s.total);
  });

  it("sourceArtifact + non equals total", () => {
    const s = summarizeAttachments([
      makeRow({ isSourceArtifact: true }),
      makeRow({ isSourceArtifact: false }),
      makeRow({ isSourceArtifact: false }),
    ]);
    expect(s.sourceArtifactCount).toBe(1);
    expect(s.nonSourceArtifactCount).toBe(2);
    expect(s.sourceArtifactCount + s.nonSourceArtifactCount).toBe(s.total);
  });
});

describe("summarizeAttachments — gauges + stats", () => {
  it("withCreatorCount counts non-null createdByUserId", () => {
    const s = summarizeAttachments([
      makeRow({ createdByUserId: 1 }),
      makeRow({ createdByUserId: null }),
      makeRow({ createdByUserId: 2 }),
    ]);
    expect(s.withCreatorCount).toBe(2);
  });

  it("distinctVaultCount counts unique vaultIds", () => {
    const s = summarizeAttachments([
      makeRow({ vaultId: 1 }),
      makeRow({ vaultId: 1 }),
      makeRow({ vaultId: 2 }),
    ]);
    expect(s.distinctVaultCount).toBe(2);
  });

  it("sizeStats computes count/sum/mean/min/max", () => {
    const s = summarizeAttachments([
      makeRow({ sizeBytes: 1000 }),
      makeRow({ sizeBytes: 3000 }),
      makeRow({ sizeBytes: 2000 }),
    ]);
    expect(s.sizeStats).not.toBeNull();
    expect(s.sizeStats!.count).toBe(3);
    expect(s.sizeStats!.sum).toBe(6000);
    expect(s.sizeStats!.mean).toBe(2000);
    expect(s.sizeStats!.min).toBe(1000);
    expect(s.sizeStats!.max).toBe(3000);
  });

  it("ageStats computes ms from createdAt to now", () => {
    const earlier = new Date(FROZEN_NOW.getTime() - 60_000);
    const s = summarizeAttachments(
      [makeRow({ createdAt: earlier })],
      { now: FROZEN_NOW },
    );
    expect(s.ageStats).not.toBeNull();
    expect(s.ageStats!.min).toBe(60_000);
  });
});

describe("summarizeAttachments — total invariant", () => {
  it("total equals input row count", () => {
    const s = summarizeAttachments([makeRow(), makeRow(), makeRow()]);
    expect(s.total).toBe(3);
  });
});
