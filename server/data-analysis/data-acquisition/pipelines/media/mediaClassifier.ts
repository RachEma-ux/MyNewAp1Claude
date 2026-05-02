/**
 * Media pipeline — image / audio / video classifier.
 *
 * Pure mime-type-based classification. The worker performs the actual
 * decode + metadata extraction; this layer chooses the dispatch.
 */

export type MediaKind = "image" | "audio" | "video" | "unknown";

export function classifyMedia(input: {
  mimeType?: string;
  filename?: string;
}): { kind: MediaKind; recommendedProcessor: string } {
  const mt = (input.mimeType ?? "").toLowerCase();
  const name = (input.filename ?? "").toLowerCase();
  if (mt.startsWith("image/") || /\.(png|jpe?g|gif|webp|tiff?)$/.test(name)) {
    return { kind: "image", recommendedProcessor: "media_metadata" };
  }
  if (mt.startsWith("audio/") || /\.(mp3|wav|flac|m4a|ogg)$/.test(name)) {
    return { kind: "audio", recommendedProcessor: "media_metadata" };
  }
  if (mt.startsWith("video/") || /\.(mp4|mov|webm|mkv|avi)$/.test(name)) {
    return { kind: "video", recommendedProcessor: "media_metadata" };
  }
  return { kind: "unknown", recommendedProcessor: "fallback_chain" };
}
