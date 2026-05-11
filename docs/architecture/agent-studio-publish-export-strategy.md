# Agent Studio — Publish / Export Strategy

**Status:** Adopted 2026-05-11
**Phase:** Native Graph Workspace Phase 19
**Owner:** Native Graph Workspace working group

---

## Summary

The Native Graph Workspace publishes content through a layered
strategy:

- **MVP (this PR + earlier phases)** — single-note Markdown
  import/export, decision-trace Markdown export, runtime trace
  to vault note, manual `.md` file transfer.
- **Later** — bulk vault export to a Markdown folder, publish-shape
  static export, selective export by tag/view, documentation-site
  export, Neo4j snapshot export.
- **Much later** — operator-managed publish lifecycle (drafts →
  reviews → published versions).

This ADR defines the canonical hybrid import/export path and
locks the deferred items behind explicit trigger conditions.

---

## What ships today (MVP)

The four import/export paths available to operators:

| Direction | Surface | Phase |
|---|---|---|
| Markdown blob → vault note | `agentStudio.vault.importNoteFromMarkdown` | Phase 15 |
| Vault note → Markdown blob | `agentStudio.vault.exportNote` | Phase 15 |
| Decision trace → Markdown blob | `agentStudio.graphAgent.exportTraceMarkdown` | Phase 14 §1 |
| Decision trace → vault note | `agentStudio.graphAgent.exportTraceToNote` | Phase 14 §5 |

Round-trip semantics for the vault note paths:
`parseMarkdownBlob(renderNoteAsMarkdown(x))` preserves content +
frontmatter for scalar / array / object shapes. `null` drops on
render (intentional — YAML spec is ambiguous about null vs
missing-key).

Frontmatter on exported decision-trace notes carries
`runtimeRunId`, `graphAgentRunId`, `redacted`, `exportedAt` — the
trace can be traced back to its source after the export round-trip.

---

## Hybrid import/export path (defined)

The canonical path for a vault note moving between systems:

1. **Export from source vault** — `exportNote(noteId)` produces a
   self-describing `.md` blob with YAML frontmatter
   (`title`, `slug`, `noteId`, `version`, plus the note's own
   frontmatter).
2. **Transport** — the blob travels by any file-shaped channel
   (download, paste, file-system copy, git, S3 upload). No
   structured wire format required.
3. **Import to target vault** — `importNoteFromMarkdown(rawMd,
   vaultId, slug, title?)` parses the blob, strips the title
   from persisted frontmatter (the note row's column is the
   source of truth), and writes via the standard `createNote`
   path. Same governance, same soft-lock layer.

The path is hybrid because:
- The target slug can differ from the source slug (the importer
  supplies it).
- The target title can differ (caller > frontmatter.title > slug
  fallback chain).
- The target vault can differ (importer supplies `vaultId`).
- The target frontmatter can be modified before re-saving — the
  importer is not obligated to round-trip exactly.

The "perfect round-trip" case is just one shape of the hybrid
path, not a separate API.

---

## Deferred: bulk vault export

A future "export this entire vault as a folder of `.md` files"
operation. Shape:

```
<vault-slug>/
├── notes/
│   ├── <note-slug>.md
│   └── ...
├── attachments/
│   └── <attachment-filename>
├── templates/
│   └── <template-key>.md
└── vault.json
```

`vault.json` carries the vault metadata (name, description,
members snapshot). Notes preserve their slug as the filename and
their content + frontmatter as the body.

Trigger conditions for un-deferring:
- ✅ Phase 20 benchmark for "export 1000-note vault" exists and
  passes (target: p95 ≤ 30 seconds).
- ✅ Attachments storage backend supports bulk read by
  `vault_id`.
- ✅ The "import this folder" reverse direction is specified
  (we don't ship export without import).

---

## Deferred: publish-shape static export

The "publish this vault as a documentation site" path. Generates
a static HTML site from vault content with:

- Navigation by folder hierarchy.
- Resolved wikilinks (`[[X]]` → `<a href="/notes/x">X</a>`).
- Backlink summaries per note.
- Tag index pages.
- Configurable redaction (`is_source_artifact=false` notes can
  opt out of publish).

Trigger conditions:
- ✅ Bulk vault export ships first (publish is a render layer on
  top of bulk export).
- ✅ The redaction model is settled (per-note + per-attachment
  publish flags).
- ✅ A static-site generator is selected (Astro, Eleventy,
  custom — TBD).

---

## Deferred: Neo4j graph snapshot export

A snapshot of the projected Neo4j graph (nodes + relationships +
indexes) for a vault. Shape: Neo4j's native dump format
(`.dump` files) or a `.cypher` script of CREATE statements.

Trigger conditions:
- ✅ Phase 7.5 — Neo4j live wiring is in place.
- ✅ Projection rebuild semantics are stable
  (`agent-studio-workspace-sync-strategy.md` §"Neo4j projection
  rebuild strategy").
- ✅ Operator authorization model includes a "snapshot graph"
  destructive-or-not classification (snapshots can leak data
  the vault would normally redact).

---

## Deferred: selective export

Operators choose what to export:

- Filter by saved view (Phase 16 view + the matching note set).
- Filter by tag.
- Filter by date range.
- Filter by author.

Trigger conditions:
- ✅ Bulk vault export ships.
- ✅ Saved views (Phase 16) are stable in production.
- ✅ The "view as filter" semantics are settled (Phase 16 views
  store filters as opaque JSON today; selective export needs the
  filters to be decodable server-side).

---

## Much-later: operator publish lifecycle

A draft → review → published shape for vault content:

- Notes have a `publish_status` discriminator.
- Reviewers approve before a note's published-version flips.
- Published versions are append-only; rollback creates a new
  version, not a mutation.
- Public consumers see only the published version.

This is in the same shape as the existing Agent Studio
draft/release pipeline (`agsAgentDrafts`, `agsAgentReleases`).
We don't generalize it to vault notes yet because:
- The vault has its own version chain
  (`agsVaultNoteVersions.version`).
- The conflict + soft-lock layer is the wrong abstraction for
  multi-reviewer asynchronous review.
- A publish lifecycle adds operator surface area (publish queue,
  review notifications, rollback flow) that requires its own
  UX strategy.

Trigger conditions:
- ✅ Bulk vault export + selective export + publish-shape static
  export all ship.
- ✅ The Agent Studio publish lifecycle's lessons (Phases 28-41)
  are auditable for "what reused, what bit us" — the publish
  lifecycle is borrowing-or-cloning territory.

---

## Acceptance criteria mapping

This ADR closes 2 of the 7 Phase 19 acceptance criteria. The
other 5 live in the companion
`agent-studio-workspace-sync-strategy.md`.

- ✅ Publish/export strategy documented (this file)
- ✅ Hybrid import/export path defined (path table above)

---

## See also

- `docs/architecture/agent-studio-workspace-sync-strategy.md`
- `docs/architecture/agent-studio-canvas-strategy.md` — Phase 17
- `docs/architecture/agent-studio-extension-framework-strategy.md`
  — Phase 18
- `docs/implementation/agent-studio-native-graph-workspace-roadmap.md`
  Phase 19
