/**
 * OpenRouter Model Access — barrel
 *
 * Plan v3 Phase 4. Exposes the public Model Access API. Gateway
 * action registration lives in `server/openrouter/manifest.ts`.
 */

export { execute, stream, validateBinding } from "./execute";
export type {
  ModelAccessIntent,
  ModelAccessMessage,
  ModelAccessExecuteInput,
  ModelAccessUsage,
  ModelAccessResult,
  ModelAccessStreamChunk,
  ValidateBindingInput,
  ValidateBindingResult,
} from "./types";
export { ModelAccessError } from "./types";
