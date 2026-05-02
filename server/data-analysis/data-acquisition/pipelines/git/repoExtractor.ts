/**
 * Git pipeline — repository object extractor.
 *
 * Connectors hand us file/blob descriptors from a repository (path,
 * sha, ref, content). This layer normalizes them into
 * `data_acquisition_git_objects` rows. Pure function.
 */

import type { InsertDataAcquisitionGitObject } from "../../../../../drizzle/schema";

export interface RawRepoObject {
  repo: string;
  objectType: "file" | "commit" | "tree" | "blob" | "tag";
  objectSha?: string;
  path?: string;
  refName?: string;
  language?: string;
  contentText?: string;
  metadata?: Record<string, unknown>;
}

export function normalizeRepoObject(
  itemId: number,
  raw: RawRepoObject,
): InsertDataAcquisitionGitObject {
  return {
    itemId,
    repo: raw.repo,
    objectType: raw.objectType,
    objectSha: raw.objectSha ?? null,
    pathText: raw.path ?? null,
    refName: raw.refName ?? null,
    language: raw.language ?? null,
    contentText: raw.contentText ?? null,
    metadataJson: raw.metadata ?? null,
  };
}

export function normalizeRepoBatch(
  itemId: number,
  raws: RawRepoObject[],
): InsertDataAcquisitionGitObject[] {
  return raws.map((r) => normalizeRepoObject(itemId, r));
}
