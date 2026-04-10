/**
 * GraphRAG — Entity & Relation Extractor
 *
 * Extracts entities, relations, and claims from text chunks.
 * V1: Rule-based NER + pattern matching.
 * Future: LLM-based extraction via LlmPort.
 */

export interface ExtractedEntity {
  text: string;
  type: "person" | "organization" | "location" | "concept" | "event" | "unknown";
  confidence: number;
  offsets?: { start: number; end: number };
}

export interface ExtractedRelation {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
}

export interface ExtractionResult {
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
  claims: string[];
}

/**
 * Extract entities and relations from a text chunk.
 */
export function extractFromChunk(text: string): ExtractionResult {
  const entities = extractEntities(text);
  const relations = extractRelations(text, entities);
  const claims = extractClaims(text);

  return { entities, relations, claims };
}

function extractEntities(text: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  const seen = new Set<string>();

  // Multi-word proper nouns (capitalized sequences)
  const multiWordPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
  let match;
  while ((match = multiWordPattern.exec(text)) !== null) {
    const t = match[1];
    if (!seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      entities.push({
        text: t,
        type: guessEntityType(t),
        confidence: 0.7,
        offsets: { start: match.index, end: match.index + t.length },
      });
    }
  }

  // Acronyms (all-caps 2-6 chars)
  const acronymPattern = /\b([A-Z]{2,6})\b/g;
  while ((match = acronymPattern.exec(text)) !== null) {
    const t = match[1];
    if (!seen.has(t) && !["THE", "AND", "FOR", "NOT", "BUT", "ARE", "WAS", "HAS"].includes(t)) {
      seen.add(t);
      entities.push({ text: t, type: "organization", confidence: 0.5 });
    }
  }

  return entities;
}

function guessEntityType(text: string): ExtractedEntity["type"] {
  const lower = text.toLowerCase();
  if (/\b(inc|corp|ltd|llc|company|group|foundation)\b/i.test(text)) return "organization";
  if (/\b(university|institute|department|division)\b/i.test(text)) return "organization";
  if (/\b(city|country|state|region|street|avenue)\b/i.test(text)) return "location";
  if (/\b(mr|mrs|dr|prof|sir|lord)\b/i.test(text)) return "person";
  if (/\b(conference|summit|event|meeting)\b/i.test(text)) return "event";
  return "unknown";
}

function extractRelations(text: string, entities: ExtractedEntity[]): ExtractedRelation[] {
  const relations: ExtractedRelation[] = [];
  const entityTexts = entities.map((e) => e.text);

  // "X is/was Y" pattern
  const isPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|was|are|were)\s+(?:a|an|the)?\s*(\w[\w\s]+?)(?:[.,;]|\s+(?:and|or|but|which|that|who))/gi;
  let match;
  while ((match = isPattern.exec(text)) !== null) {
    const subject = match[1].trim();
    const object = match[2].trim();
    if (subject.length > 1 && object.length > 1 && object.length < 50) {
      relations.push({ subject, predicate: "is_a", object, confidence: 0.6 });
    }
  }

  // "X of Y" pattern
  const ofPattern = /\b(\w+)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi;
  while ((match = ofPattern.exec(text)) !== null) {
    const predicate = match[1].trim();
    const object = match[2].trim();
    if (entityTexts.some((e) => e === object)) {
      relations.push({ subject: object, predicate: `has_${predicate.toLowerCase()}`, object: predicate, confidence: 0.5 });
    }
  }

  return relations;
}

function extractClaims(text: string): string[] {
  // Extract sentences that contain factual statements
  const sentences = text.split(/[.!?]\s+/);
  return sentences
    .filter((s) => s.length > 20 && s.length < 200)
    .filter((s) => /\b(is|was|are|were|has|had|will|can|must)\b/i.test(s))
    .slice(0, 10);
}
