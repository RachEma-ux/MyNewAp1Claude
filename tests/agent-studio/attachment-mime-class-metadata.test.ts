/**
 * Phase V §T-V.2 — attachment mime-class metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  ATTACHMENT_MIME_CLASSES,
  ATTACHMENT_MIME_CLASS_METADATA,
  getAttachmentMimeClassMetadata,
  classifyMimeType,
} from "../../server/agent-studio/services/vault/attachment-library.js";

describe("ATTACHMENT_MIME_CLASS_METADATA (T-V.2)", () => {
  it("has metadata for every closed-taxonomy class", () => {
    for (const c of ATTACHMENT_MIME_CLASSES) {
      expect(ATTACHMENT_MIME_CLASS_METADATA[c]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(ATTACHMENT_MIME_CLASS_METADATA).length).toBe(
      ATTACHMENT_MIME_CLASSES.length,
    );
  });

  it.each(ATTACHMENT_MIME_CLASSES)(
    "%s has non-empty label + description + previewable + valid displayBucket",
    (c) => {
      const md = ATTACHMENT_MIME_CLASS_METADATA[c];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.previewable).toBe("boolean");
      expect(["media", "documents", "other"]).toContain(md.displayBucket);
    },
  );

  it.each(ATTACHMENT_MIME_CLASSES)(
    "getAttachmentMimeClassMetadata(%s) returns table entry",
    (c) => {
      expect(getAttachmentMimeClassMetadata(c)).toBe(
        ATTACHMENT_MIME_CLASS_METADATA[c],
      );
    },
  );

  it("media bucket contains image/video/audio only", () => {
    for (const c of ATTACHMENT_MIME_CLASSES) {
      const md = ATTACHMENT_MIME_CLASS_METADATA[c];
      if (md.displayBucket === "media") {
        expect(["image", "video", "audio"]).toContain(c);
      }
    }
  });

  it("archive and other are not previewable", () => {
    expect(ATTACHMENT_MIME_CLASS_METADATA.archive.previewable).toBe(false);
    expect(ATTACHMENT_MIME_CLASS_METADATA.other.previewable).toBe(false);
  });

  it("image/video/audio/document are all previewable", () => {
    expect(ATTACHMENT_MIME_CLASS_METADATA.image.previewable).toBe(true);
    expect(ATTACHMENT_MIME_CLASS_METADATA.video.previewable).toBe(true);
    expect(ATTACHMENT_MIME_CLASS_METADATA.audio.previewable).toBe(true);
    expect(ATTACHMENT_MIME_CLASS_METADATA.document.previewable).toBe(true);
  });

  it("every displayBucket has at least one class assigned", () => {
    const used = new Set<string>();
    for (const c of ATTACHMENT_MIME_CLASSES) {
      used.add(ATTACHMENT_MIME_CLASS_METADATA[c].displayBucket);
    }
    expect(used.has("media")).toBe(true);
    expect(used.has("documents")).toBe(true);
    expect(used.has("other")).toBe(true);
  });

  it("classifyMimeType only emits closed-taxonomy classes", () => {
    const samples = [
      "image/png",
      "image/svg+xml",
      "video/mp4",
      "audio/mpeg",
      "application/pdf",
      "application/zip",
      "application/json",
      "text/plain",
      "application/octet-stream",
    ];
    for (const m of samples) {
      const cls = classifyMimeType(m);
      expect(ATTACHMENT_MIME_CLASSES).toContain(cls);
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const c of ATTACHMENT_MIME_CLASSES) {
      labels.add(ATTACHMENT_MIME_CLASS_METADATA[c].label);
    }
    expect(labels.size).toBe(ATTACHMENT_MIME_CLASSES.length);
  });
});
