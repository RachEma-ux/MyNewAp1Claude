/**
 * Vault service — Zod contracts.
 *
 * Phase 2 / 2.5 / 4 / 5 enabling. MVP 1.
 *
 * ADRs:
 *   - agent-studio-markdown-profile.md
 *   - agent-studio-note-metadata-domain-model.md
 *   - agent-studio-shared-vault-editing-locks.md
 */

import { z } from "zod";

export const VaultCreateInput = z.object({
  workspaceId: z.number().int().optional(),
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
});
export type VaultCreateInput = z.infer<typeof VaultCreateInput>;

export const VaultMemberAddInput = z.object({
  vaultId: z.number().int(),
  userId: z.number().int(),
  role: z.enum(["reader", "writer", "admin"]),
});
export type VaultMemberAddInput = z.infer<typeof VaultMemberAddInput>;

export const NoteCreateInput = z.object({
  vaultId: z.number().int(),
  folderId: z.number().int().optional(),
  slug: z.string().min(1).max(255),
  title: z.string().min(1).max(500),
  contentMd: z.string().default(""),
  frontmatter: z.record(z.string(), z.unknown()).optional(),
});
export type NoteCreateInput = z.infer<typeof NoteCreateInput>;

export const NoteUpdateInput = z.object({
  noteId: z.number().int(),
  expectedVersion: z.number().int(),
  contentMd: z.string(),
  frontmatter: z.record(z.string(), z.unknown()).optional(),
  commitMessage: z.string().max(500).optional(),
});
export type NoteUpdateInput = z.infer<typeof NoteUpdateInput>;

export const NoteDeleteInput = z.object({
  noteId: z.number().int(),
  /** Optional optimistic-lock check. Required for online deletes,
   *  optional for offline-queue drains where the client may not
   *  know the current version (per OFFLINE_OPERATION_KINDS
   *  vault.note.delete contract). */
  expectedVersion: z.number().int().optional(),
});
export type NoteDeleteInput = z.infer<typeof NoteDeleteInput>;

export const NoteConflictResolution = z.object({
  noteId: z.number().int(),
  resolution: z.enum(["save_copy", "merge_manual", "discard_draft"]),
  draftContent: z.string().optional(),
});
export type NoteConflictResolution = z.infer<typeof NoteConflictResolution>;

export const LockAcquireInput = z.object({
  noteId: z.number().int(),
  userId: z.number().int(),
  ttlSeconds: z.number().int().min(60).max(3600).default(300),
});
export type LockAcquireInput = z.infer<typeof LockAcquireInput>;

export const NotePropertyDomain = z.enum([
  "content",
  "binding",
  "governance",
  "runtime",
  "graph",
  "system",
  "projection",
]);
export type NotePropertyDomain = z.infer<typeof NotePropertyDomain>;

export const SearchInput = z.object({
  vaultId: z.number().int().optional(),
  query: z.string().min(1),
  tagFilter: z.array(z.string()).optional(),
  propertyFilter: z.record(z.string(), z.unknown()).optional(),
  limit: z.number().int().min(1).max(100).default(20),
});
export type SearchInput = z.infer<typeof SearchInput>;
