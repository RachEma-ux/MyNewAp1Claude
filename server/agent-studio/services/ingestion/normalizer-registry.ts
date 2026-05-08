/**
 * Normalizer registry — D-UI-1 layer #3.
 *
 * Every parser produces a `ParsedDocument` with `ParsedPart[]`; the
 * default normalizer (`identity_normalizer`) maps each part 1:1 to a
 * `NormalizedKnowledgeUnitInput`. Custom normalizers can collapse,
 * split, or annotate parts before the KnowledgeUnitService persists
 * them.
 *
 * The registry pattern matches the parser registry: in-process
 * map; default registration on boot; tests can swap.
 */

import type {
  Normalizer,
  NormalizerInput,
  NormalizedKnowledgeUnitInput,
} from "./types";

const normalizers = new Map<string, Normalizer>();

export const identityNormalizer: Normalizer = {
  key: "identity",
  normalize(input: NormalizerInput): NormalizedKnowledgeUnitInput[] {
    // U5-b.2: document-level license (set by parsers HTML/JSON/code)
    // propagates to every unit. Per ADR DD2 license is per-unit on
    // ags_knowledge_units; the normalizer is the natural propagation
    // point since every part inherits the document's signal.
    const docLicense =
      typeof input.document.metadata?.license === "string"
        ? (input.document.metadata.license as string)
        : null;
    return input.document.parts.map((part) => ({
      workspaceId: input.workspaceId,
      sourceId: input.sourceId,
      unitType: part.unitTypeHint,
      contentText: part.text,
      contentJson: part.json ?? null,
      sourceLocation: {
        uri: input.document.metadata?.sourceUri as string | null | undefined ?? null,
        pageNumber: part.location?.pageNumber ?? null,
        lineRange: part.location?.lineRange ?? null,
        selector: part.location?.selector ?? null,
      },
      permissionContext: input.permissionContext,
      freshnessState: "fresh",
      license: docLicense,
    }));
  },
};

export function registerNormalizer(normalizer: Normalizer): void {
  normalizers.set(normalizer.key, normalizer);
}

export function clearNormalizers(): void {
  normalizers.clear();
}

export function getNormalizer(key: string): Normalizer | undefined {
  return normalizers.get(key);
}

export function listNormalizers(): ReadonlyArray<Normalizer> {
  return [...normalizers.values()];
}

let defaultsRegistered = false;

export function registerDefaultNormalizers(): void {
  if (defaultsRegistered) return;
  registerNormalizer(identityNormalizer);
  defaultsRegistered = true;
}

export function resetNormalizersToDefaults(): void {
  clearNormalizers();
  defaultsRegistered = false;
  registerDefaultNormalizers();
}
