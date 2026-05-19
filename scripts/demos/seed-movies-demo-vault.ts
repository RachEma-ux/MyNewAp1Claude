/**
 * Movies Demo Vault — seed script.
 *
 * Reads the vendored Neo4j Movies sample dataset
 * (`scripts/demos/data/movies.cypher`), parses Movie + Person entities
 * and their relationships, and materializes them as Agent Studio
 * vault notes — one note per entity, with `[[wikilink]]` references
 * encoding every edge. The existing Vault → Knowledge Graph projection
 * chain (per `CLAUDE.md` "Native Graph Workspace") then populates
 * `ags_graph_projection_sync_jobs`, which the projection cron drains
 * into Neo4j.
 *
 * Run:
 *   pnpm tsx scripts/demos/seed-movies-demo-vault.ts
 *
 * Re-running is idempotent: existing vault is reused (slug-keyed),
 * existing notes are skipped if their slug is already present.
 */

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { AsdbVaultRepository } from "../../server/agent-studio/services/vault/repository-asdb";
import { enqueueVaultNoteProjection } from "../../server/agent-studio/services/vault/graph-projection";
import { persistNoteLinks } from "../../server/agent-studio/services/vault/link-persistence";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_CREATED_BY = 1;
const VAULT_NAME = "Movies Demo";
const VAULT_SLUG = "movies-demo";
const VAULT_DESCRIPTION =
  "Neo4j canonical Movies dataset, materialized as vault notes with wikilinks. Demonstrates the Vault → Knowledge Graph projection chain.";

// ============================================================================
// Parser
// ============================================================================

interface MovieEntity {
  readonly title: string;
  released?: number;
  tagline?: string;
}

interface PersonEntity {
  readonly name: string;
  born?: number;
}

type EdgeKind = "ACTED_IN" | "DIRECTED" | "PRODUCED" | "WROTE" | "REVIEWED" | "FOLLOWS";

interface ParsedEdge {
  readonly fromVar: string;
  readonly toVar: string;
  readonly kind: EdgeKind;
  readonly props: Record<string, unknown>;
}

interface VarBinding {
  readonly kind: "movie" | "person";
  readonly name: string;
}

interface ParseResult {
  readonly movies: Map<string, MovieEntity>; // keyed by title
  readonly people: Map<string, PersonEntity>; // keyed by name
  readonly edges: ParsedEdge[];
  readonly varMap: Map<string, VarBinding>;
}

const MOVIE_RE =
  /MERGE\s*\((\w+):Movie\s*\{title:'([^']+)'\}\)(?:\s+ON CREATE SET\s+\1\.released=(\d+)(?:,\s+\1\.tagline='([^']*)')?)?/g;
const PERSON_RE =
  /MERGE\s*\((\w+):Person\s*\{name:'([^']+)'\}\)(?:\s+ON CREATE SET\s+\1\.born=(\d+))?/g;
const EDGE_RE =
  /MERGE\s*\((\w+)\)-\[:(ACTED_IN|DIRECTED|PRODUCED|WROTE|REVIEWED|FOLLOWS)(?:\s*\{([^}]*)\})?\]->\((\w+)\)/g;

function parseRoles(rolesLiteral: string): string[] {
  // Matches Cypher list literal: ['Neo','Mr Anderson'] or ["Emil"]
  const inner = rolesLiteral.trim().replace(/^\[/, "").replace(/\]$/, "");
  const out: string[] = [];
  const re = /['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    out.push(m[1]!);
  }
  return out;
}

function parseEdgeProps(literal: string | undefined): Record<string, unknown> {
  if (!literal) return {};
  const props: Record<string, unknown> = {};
  // roles:[ ... ]
  const rolesMatch = literal.match(/roles:\s*(\[[^\]]*\])/);
  if (rolesMatch) props.roles = parseRoles(rolesMatch[1]!);
  // summary:'...'
  const summaryMatch = literal.match(/summary:\s*['"]([^'"]+)['"]/);
  if (summaryMatch) props.summary = summaryMatch[1]!;
  // rating:NN
  const ratingMatch = literal.match(/rating:\s*(\d+)/);
  if (ratingMatch) props.rating = Number(ratingMatch[1]);
  return props;
}

function parseCypher(content: string): ParseResult {
  const movies = new Map<string, MovieEntity>();
  const people = new Map<string, PersonEntity>();
  const edges: ParsedEdge[] = [];
  const varMap = new Map<string, VarBinding>();

  let m: RegExpExecArray | null;

  MOVIE_RE.lastIndex = 0;
  while ((m = MOVIE_RE.exec(content)) !== null) {
    const [, varName, title, releasedStr, tagline] = m;
    const existing = movies.get(title!) ?? { title: title! };
    if (releasedStr) existing.released = Number(releasedStr);
    if (tagline) existing.tagline = tagline;
    movies.set(title!, existing);
    varMap.set(varName!, { kind: "movie", name: title! });
  }

  PERSON_RE.lastIndex = 0;
  while ((m = PERSON_RE.exec(content)) !== null) {
    const [, varName, name, bornStr] = m;
    const existing = people.get(name!) ?? { name: name! };
    if (bornStr) existing.born = Number(bornStr);
    people.set(name!, existing);
    varMap.set(varName!, { kind: "person", name: name! });
  }

  EDGE_RE.lastIndex = 0;
  while ((m = EDGE_RE.exec(content)) !== null) {
    const [, fromVar, kind, propsLiteral, toVar] = m;
    edges.push({
      fromVar: fromVar!,
      toVar: toVar!,
      kind: kind as EdgeKind,
      props: parseEdgeProps(propsLiteral),
    });
  }

  return { movies, people, edges, varMap };
}

// ============================================================================
// Slugify
// ============================================================================

function slugify(prefix: "movie" | "person", name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${prefix}-${base}`;
}

function wikilink(prefix: "movie" | "person", name: string): string {
  return `[[${slugify(prefix, name)}|${name}]]`;
}

// ============================================================================
// Note bodies
// ============================================================================

interface MovieIndex {
  readonly cast: Array<{ personName: string; roles: string[] }>;
  readonly directors: string[];
  readonly producers: string[];
  readonly writers: string[];
  readonly reviewers: Array<{ personName: string; rating?: number; summary?: string }>;
}

interface PersonIndex {
  readonly actedIn: Array<{ movieTitle: string; roles: string[] }>;
  readonly directed: string[];
  readonly produced: string[];
  readonly wrote: string[];
  readonly reviewed: Array<{ movieTitle: string; rating?: number; summary?: string }>;
  readonly follows: string[];
}

function buildIndexes(parsed: ParseResult): {
  perMovie: Map<string, MovieIndex>;
  perPerson: Map<string, PersonIndex>;
} {
  const perMovie = new Map<string, MovieIndex>();
  const perPerson = new Map<string, PersonIndex>();

  for (const title of parsed.movies.keys()) {
    perMovie.set(title, { cast: [], directors: [], producers: [], writers: [], reviewers: [] });
  }
  for (const name of parsed.people.keys()) {
    perPerson.set(name, { actedIn: [], directed: [], produced: [], wrote: [], reviewed: [], follows: [] });
  }

  for (const edge of parsed.edges) {
    const from = parsed.varMap.get(edge.fromVar);
    const to = parsed.varMap.get(edge.toVar);
    if (!from || !to) continue;

    if (edge.kind === "ACTED_IN" && from.kind === "person" && to.kind === "movie") {
      const roles = (edge.props.roles as string[] | undefined) ?? [];
      perMovie.get(to.name)?.cast.push({ personName: from.name, roles });
      perPerson.get(from.name)?.actedIn.push({ movieTitle: to.name, roles });
    } else if (edge.kind === "DIRECTED" && from.kind === "person" && to.kind === "movie") {
      perMovie.get(to.name)?.directors.push(from.name);
      perPerson.get(from.name)?.directed.push(to.name);
    } else if (edge.kind === "PRODUCED" && from.kind === "person" && to.kind === "movie") {
      perMovie.get(to.name)?.producers.push(from.name);
      perPerson.get(from.name)?.produced.push(to.name);
    } else if (edge.kind === "WROTE" && from.kind === "person" && to.kind === "movie") {
      perMovie.get(to.name)?.writers.push(from.name);
      perPerson.get(from.name)?.wrote.push(to.name);
    } else if (edge.kind === "REVIEWED" && from.kind === "person" && to.kind === "movie") {
      const rating = edge.props.rating as number | undefined;
      const summary = edge.props.summary as string | undefined;
      perMovie.get(to.name)?.reviewers.push({ personName: from.name, rating, summary });
      perPerson.get(from.name)?.reviewed.push({ movieTitle: to.name, rating, summary });
    } else if (edge.kind === "FOLLOWS" && from.kind === "person" && to.kind === "person") {
      perPerson.get(from.name)?.follows.push(to.name);
    }
  }

  return { perMovie, perPerson };
}

function movieMarkdown(m: MovieEntity, idx: MovieIndex): string {
  const lines: string[] = [];
  lines.push(`# ${m.title}`, "");
  if (m.tagline) lines.push(`> ${m.tagline}`, "");
  if (m.released) lines.push(`**Released:** ${m.released}`, "");

  if (idx.cast.length > 0) {
    lines.push("## Cast", "");
    for (const c of idx.cast) {
      const rolesStr = c.roles.length > 0 ? ` — ${c.roles.join(", ")}` : "";
      lines.push(`- ${wikilink("person", c.personName)}${rolesStr}`);
    }
    lines.push("");
  }

  if (idx.directors.length > 0) {
    lines.push("## Directed by", "");
    for (const d of idx.directors) lines.push(`- ${wikilink("person", d)}`);
    lines.push("");
  }

  if (idx.producers.length > 0) {
    lines.push("## Produced by", "");
    for (const p of idx.producers) lines.push(`- ${wikilink("person", p)}`);
    lines.push("");
  }

  if (idx.writers.length > 0) {
    lines.push("## Written by", "");
    for (const w of idx.writers) lines.push(`- ${wikilink("person", w)}`);
    lines.push("");
  }

  if (idx.reviewers.length > 0) {
    lines.push("## Reviewed by", "");
    for (const r of idx.reviewers) {
      const parts = [wikilink("person", r.personName)];
      if (r.rating != null) parts.push(`★ ${r.rating}`);
      if (r.summary) parts.push(`"${r.summary}"`);
      lines.push(`- ${parts.join(" — ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function personMarkdown(p: PersonEntity, idx: PersonIndex): string {
  const lines: string[] = [];
  lines.push(`# ${p.name}`, "");
  if (p.born) lines.push(`**Born:** ${p.born}`, "");

  if (idx.actedIn.length > 0) {
    lines.push("## Acted in", "");
    for (const a of idx.actedIn) {
      const rolesStr = a.roles.length > 0 ? ` — as ${a.roles.join(", ")}` : "";
      lines.push(`- ${wikilink("movie", a.movieTitle)}${rolesStr}`);
    }
    lines.push("");
  }

  if (idx.directed.length > 0) {
    lines.push("## Directed", "");
    for (const m of idx.directed) lines.push(`- ${wikilink("movie", m)}`);
    lines.push("");
  }

  if (idx.produced.length > 0) {
    lines.push("## Produced", "");
    for (const m of idx.produced) lines.push(`- ${wikilink("movie", m)}`);
    lines.push("");
  }

  if (idx.wrote.length > 0) {
    lines.push("## Wrote", "");
    for (const m of idx.wrote) lines.push(`- ${wikilink("movie", m)}`);
    lines.push("");
  }

  if (idx.reviewed.length > 0) {
    lines.push("## Reviewed", "");
    for (const r of idx.reviewed) {
      const parts = [wikilink("movie", r.movieTitle)];
      if (r.rating != null) parts.push(`★ ${r.rating}`);
      if (r.summary) parts.push(`"${r.summary}"`);
      lines.push(`- ${parts.join(" — ")}`);
    }
    lines.push("");
  }

  if (idx.follows.length > 0) {
    lines.push("## Follows", "");
    for (const f of idx.follows) lines.push(`- ${wikilink("person", f)}`);
    lines.push("");
  }

  return lines.join("\n");
}

// ============================================================================
// Seeder
// ============================================================================

async function findOrCreateVault(repo: AsdbVaultRepository): Promise<{ id: number }> {
  const existing = await repo.listVaultsForUser(DEFAULT_CREATED_BY);
  const hit = existing.find((v: { slug: string }) => v.slug === VAULT_SLUG);
  if (hit) {
    console.log(`[movies-demo-seed] reusing existing vault id=${hit.id} slug=${VAULT_SLUG}`);
    return { id: hit.id };
  }
  const created = await repo.createVault(
    { name: VAULT_NAME, slug: VAULT_SLUG, description: VAULT_DESCRIPTION },
    DEFAULT_CREATED_BY,
  );
  console.log(`[movies-demo-seed] created vault id=${created.id} slug=${VAULT_SLUG}`);
  return created;
}

interface SeededNote {
  readonly slug: string;
  readonly title: string;
  readonly body: string;
  readonly noteId: number;
  readonly versionId: number;
}

async function createNoteOrFindExisting(
  repo: AsdbVaultRepository,
  vaultId: number,
  slug: string,
  title: string,
  body: string,
  frontmatter: Record<string, unknown>,
): Promise<{ result: "created" | "skipped"; noteId: number; versionId: number }> {
  try {
    const note = await repo.createNote(
      { vaultId, slug, title, contentMd: body, frontmatter },
      DEFAULT_CREATED_BY,
    );
    return { result: "created", noteId: note.id, versionId: note.versionId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const causeMsg =
      e instanceof Error && e.cause instanceof Error ? e.cause.message : "";
    const directCode = (e as { code?: string }).code;
    const causeCode = (e as { cause?: { code?: string } }).cause?.code;
    const isUniqueViolation =
      directCode === "23505" ||
      causeCode === "23505" ||
      /already exists|duplicate|unique/i.test(msg) ||
      /already exists|duplicate|unique/i.test(causeMsg);
    if (isUniqueViolation) {
      const existing = await repo.findNoteBySlugInVault(vaultId, slug);
      if (existing) {
        const full = await repo.getNoteById(existing.noteId);
        return {
          result: "skipped",
          noteId: existing.noteId,
          versionId: full?.currentVersionId ?? 0,
        };
      }
    }
    throw e;
  }
}

async function main(): Promise<void> {
  const cypherPath = path.resolve(__dirname, "./data/movies.cypher");
  const content = fs.readFileSync(cypherPath, "utf-8");
  const parsed = parseCypher(content);
  console.log(
    `[movies-demo-seed] parsed ${parsed.movies.size} movies / ${parsed.people.size} people / ${parsed.edges.length} edges from ${cypherPath}`,
  );

  if ((process.env.GRAPH_BACKEND ?? "postgres") === "postgres") {
    console.log(
      "[movies-demo-seed] NOTE — GRAPH_BACKEND is 'postgres' (default). Projection-job enqueues will be no-op (per postgres-graph-repository.ts). To populate ags_graph_projection_sync_jobs, re-run with GRAPH_BACKEND=neo4j-ce. Link persistence + note creation are unaffected.",
    );
  }

  const { perMovie, perPerson } = buildIndexes(parsed);

  const repo = new AsdbVaultRepository();
  const vault = await findOrCreateVault(repo);

  // -------- Pass 1: create all notes (or find existing) --------
  const seeded: SeededNote[] = [];
  let createdCount = 0;
  let skippedCount = 0;

  for (const [title, movie] of parsed.movies) {
    const idx = perMovie.get(title) ?? { cast: [], directors: [], producers: [], writers: [], reviewers: [] };
    const slug = slugify("movie", title);
    const body = movieMarkdown(movie, idx);
    const frontmatter = { kind: "movie", released: movie.released ?? null, tagline: movie.tagline ?? null, demo: "movies" };
    const r = await createNoteOrFindExisting(repo, vault.id, slug, title, body, frontmatter);
    seeded.push({ slug, title, body, noteId: r.noteId, versionId: r.versionId });
    if (r.result === "created") {
      createdCount++;
      console.log(`[movies-demo-seed] +movie ${slug}`);
    } else {
      skippedCount++;
    }
  }
  for (const [name, person] of parsed.people) {
    const idx = perPerson.get(name) ?? { actedIn: [], directed: [], produced: [], wrote: [], reviewed: [], follows: [] };
    const slug = slugify("person", name);
    const body = personMarkdown(person, idx);
    const frontmatter = { kind: "person", born: person.born ?? null, demo: "movies" };
    const r = await createNoteOrFindExisting(repo, vault.id, slug, name, body, frontmatter);
    seeded.push({ slug, title: name, body, noteId: r.noteId, versionId: r.versionId });
    if (r.result === "created") {
      createdCount++;
      console.log(`[movies-demo-seed] +person ${slug}`);
    } else {
      skippedCount++;
    }
  }

  console.log(
    `[movies-demo-seed] pass-1 DONE — vaultId=${vault.id} created=${createdCount} skipped=${skippedCount} total=${seeded.length}`,
  );

  // -------- Pass 2: project + persist links (all peers exist now) --------
  let linkPersistCount = 0;
  let projectionCount = 0;
  for (const n of seeded) {
    try {
      await persistNoteLinks({
        vaultId: vault.id,
        noteId: n.noteId,
        versionId: n.versionId,
        contentMd: n.body,
        repo,
      });
      linkPersistCount++;
    } catch (e) {
      console.warn(`[movies-demo-seed] link-persistence failed for ${n.slug}: ${e instanceof Error ? e.message : e}`);
    }
    try {
      await enqueueVaultNoteProjection(
        {
          vaultId: vault.id,
          noteId: n.noteId,
          versionId: n.versionId,
          slug: n.slug,
          title: n.title,
          contentMd: n.body,
          eventKind: "note.created",
        },
        { repo },
      );
      projectionCount++;
    } catch (e) {
      console.warn(`[movies-demo-seed] projection enqueue failed for ${n.slug}: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(
    `[movies-demo-seed] pass-2 DONE — link-persist=${linkPersistCount} projection-enqueue=${projectionCount}`,
  );
  console.log(`[movies-demo-seed] OPEN: http://localhost:3000/agent-studio/graph-workspace`);
}

main().catch((e) => {
  console.error("[movies-demo-seed] FAILED", e);
  process.exit(1);
});
