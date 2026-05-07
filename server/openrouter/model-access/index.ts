/**
 * OpenRouter Model Access — barrel
 *
 * Plan v3 Phase 4. Exposes the public Model Access API. Gateway
 * action registration lives in `server/openrouter/manifest.ts`.
 */

export { execute, stream, validateBinding } from "./execute";
export { embed } from "./embed";
export {
  runViaOpenllmBridge,
  deriveOpenllmWsUrl,
} from "./run-via-openllm-bridge";
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
  BridgePermissionDecision,
  BridgePermissionResolver,
  BridgeMcpServerConfig,
  BridgeSessionConfigResult,
  BridgeUsage,
  RunViaOpenllmBridgeInput,
  RunViaOpenllmBridgeResult,
} from "./types";
export { ModelAccessError } from "./types";
