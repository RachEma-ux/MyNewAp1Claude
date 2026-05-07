/**
 * OpenRouter Model Access — barrel
 *
 * Plan v3 Phase 4. Exposes the public Model Access API. Gateway
 * action registration lives in `server/openrouter/manifest.ts`.
 */

export { execute, stream, validateBinding } from "./execute";
export { embed } from "./embed";
export type {
  ModelAccessIntent,
  ModelAccessMessage,
  ModelAccessExecuteInput,
  ModelAccessUsage,
  ModelAccessResult,
  ModelAccessStreamChunk,
  ModelAccessEmbedInput,
  ModelAccessEmbedResult,
  ValidateBindingInput,
  ValidateBindingResult,
} from "./types";
export { ModelAccessError } from "./types";
