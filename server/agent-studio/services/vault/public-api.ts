/**
 * Vault service — public API barrel.
 *
 * MVP 1 entry surface for the Native Graph Workspace vault layer.
 *
 * Mounted into the Agent Studio module manifest pattern (see
 * docs/architecture/agent-studio-native-graph-workspace.md).
 */

export type {
  VaultCreateInput,
  VaultMemberAddInput,
  NoteCreateInput,
  NoteUpdateInput,
  NoteConflictResolution,
  LockAcquireInput,
  NotePropertyDomain,
  SearchInput,
} from "./contracts.js";

export type { VaultRepository, NoteSelectByIdResult, NoteVersionSelectResult } from "./repository.js";
export { computeContentHash, VaultRepositoryStub } from "./repository.js";

export type {
  ExtractedWikilink,
  ExtractedAttachmentEmbed,
  LinkExtractionResult,
  BacklinkRecord,
  ResolvedLink,
  UnresolvedLink,
} from "./links.js";
export {
  extractLinksFromMarkdown,
  buildBacklinkRecords,
  resolveLinks,
} from "./links.js";

export type { SearchHit, VaultSearchService } from "./search.js";
export { VaultSearchServiceStub } from "./search.js";

export {
  createTemplate,
  listTemplates,
  getTemplateById,
  renderTemplate,
  AsdbUnavailableError as VaultTemplatesAsdbUnavailableError,
  TemplateNotFoundError,
} from "./templates.js";
export type {
  CreateTemplateInput,
  ListTemplatesInput,
  RenderTemplateInput,
  RenderedTemplate,
  VaultTemplateRow,
  VaultTemplateListing,
  TemplateServiceOptions,
} from "./templates.js";

export {
  parseMarkdownBlob,
  renderNoteAsMarkdown,
  exportNoteAsMarkdown,
} from "./markdown-import-export.js";
export type {
  ParsedMarkdownBlob,
  RenderNoteInput,
  ExportNoteAsMarkdownResult,
  ExportNoteAsMarkdownOptions,
} from "./markdown-import-export.js";

/**
 * Vault Phase 5b note-version creation pipeline.
 *
 * 1. validate input (Zod)
 * 2. acquire soft lock
 * 3. computeContentHash
 * 4. write note version (createNote / updateNote)
 * 5. extractLinksFromMarkdown
 * 6. resolveLinks against vault slug map
 * 7. write wikilinks + backlinks + unlinked mentions
 * 8. enqueue projection job (ags_graph_projection_sync_jobs)
 * 9. release lock
 *
 * Phase 7.5 active backend wires step 8 into the actual GraphRepository
 * projection layer.
 */
