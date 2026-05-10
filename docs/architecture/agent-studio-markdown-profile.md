# Agent Studio — Markdown Profile — ADR

**Owner:** Agent Studio module + Frontend
**Phase:** Native Graph Workspace — Phase 1 / Phase 3
**Status:** Adopted

---

## 1. Decision

### 1.1 Supported syntax (MVP)

CommonMark + GitHub-Flavored Markdown subset:
- Headings 1–6
- Paragraphs, line breaks
- Bold, italic, strikethrough, highlight
- Block quotes, callouts
- Ordered / unordered / nested / task lists
- Horizontal rules
- Inline code, code blocks (with language hint)
- Tables (GFM)
- Images, basic embeds (`![[note]]` / `![[attachment]]`)
- Comments `<!-- ... -->`
- Escape sequences

### 1.2 Wikilinks

- `[[Note]]` — link to note by name (slug-resolved)
- `[[Note#Heading]]` — link to specific heading
- `[[Note|Alias]]` — link with display alias
- `![[Note]]` — embed (transclusion) of note
- `![[image.png]]` — embed attachment

### 1.3 Frontmatter

YAML frontmatter at top of file. Domains separated:
- `content.*` — content metadata (title, summary, tags)
- `binding.*` — runtime binding metadata (when promoted)
- `governance.*` — governance metadata (status, approvers)
- `runtime.*` — runtime asset metadata (version, eligibility)
- `graph.*` — graph metadata (entity refs, edge refs)
- `system.*` — system metadata (createdAt, updatedAt)
- `projection.*` — projection metadata (last_projected_at)

### 1.4 Out of scope for MVP

- Math (KaTeX) — Phase 24
- Mermaid diagrams — Phase 24
- Block references `^block-id` — Phase 24
- Advanced transclusion — Phase 24
- Browser clipper — V2

### 1.5 Parser

Use existing `react-markdown` + `remark-gfm` from `package.json` deps. Add custom remark plugin for wikilinks (`remark-wikilinks`).

Server-side parsing: same plugins via `unified` for backlink extraction.

## 2. Acceptance

- [x] Supported syntax locked.
- [x] Wikilink syntax locked.
- [x] Frontmatter domains locked.
- [x] Out-of-scope locked.
- [x] Parser choice locked.
- [ ] Phase 3 editor consumes profile.
- [ ] Phase 5 link extraction consumes profile.
