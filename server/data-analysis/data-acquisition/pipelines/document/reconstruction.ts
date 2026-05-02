/**
 * Document pipeline — section reconstruction.
 *
 * After a parser produces a flat list of blocks (text/table/figure),
 * this layer assembles them into ordered sections. Heading detection
 * is heuristic-based (block kind === "heading" OR text matches
 * /^#+\s/ in markdown output). Pure function; no external deps.
 */

export interface ParserBlock {
  kind: "heading" | "paragraph" | "list" | "table" | "figure" | "code";
  level?: number;
  text?: string;
  table?: { rows: unknown[][] };
  figure?: { caption?: string; uri?: string };
}

export interface ReconstructedSection {
  title?: string;
  content: unknown[];
  tables: unknown[];
  figures: unknown[];
}

export function reconstructSections(blocks: ParserBlock[]): ReconstructedSection[] {
  const sections: ReconstructedSection[] = [];
  let current: ReconstructedSection = { content: [], tables: [], figures: [] };

  for (const b of blocks) {
    if (b.kind === "heading") {
      // Push the previous section if it has anything; start a new one.
      if (current.content.length || current.tables.length || current.figures.length || current.title) {
        sections.push(current);
      }
      current = {
        title: b.text,
        content: [],
        tables: [],
        figures: [],
      };
      continue;
    }
    if (b.kind === "table" && b.table) {
      current.tables.push(b.table);
      continue;
    }
    if (b.kind === "figure" && b.figure) {
      current.figures.push(b.figure);
      continue;
    }
    if (b.text) {
      current.content.push(b.text);
    }
  }
  if (current.content.length || current.tables.length || current.figures.length || current.title) {
    sections.push(current);
  }
  return sections;
}

/**
 * Convert a parser's raw markdown/text blob into ParserBlocks. Used
 * when the worker returns plain markdown rather than a structured
 * block list.
 */
export function blocksFromMarkdown(md: string): ParserBlock[] {
  const lines = md.split(/\r?\n/);
  const out: ParserBlock[] = [];
  for (const line of lines) {
    const h = /^(#+)\s+(.+)$/.exec(line);
    if (h) {
      out.push({ kind: "heading", level: h[1].length, text: h[2].trim() });
      continue;
    }
    if (line.trim()) {
      out.push({ kind: "paragraph", text: line.trim() });
    }
  }
  return out;
}
