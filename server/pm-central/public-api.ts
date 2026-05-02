/**
 * PM Central — Public API
 *
 * Re-exports the contracts/events/handoffs/ports surface other
 * modules consume, plus the manifest reference. Gateway handler
 * registration happens inside the manifest's `boot()` hook.
 */

export * from "./contracts";
export * from "./events";
export * from "./handoffs";
export * from "./ports";
export { pmCentralManifest } from "./manifest";
