/**
 * Publish-target registry — Phase 19-α V1+ first slice.
 *
 * In-process pusher registry. The service-layer `executePublish()`
 * looks up the pusher for a target's `targetType`, calls
 * `withProviderCredential` if a `providerConnectionId` is bound,
 * and invokes the pusher inside the credential closure.
 *
 * Why a registry rather than a switch:
 *   - Allows V1.5+ to add new target types without modifying the
 *     execution dispatcher.
 *   - Allows tests to substitute a no-op pusher per target type
 *     without monkey-patching the credential resolver.
 *
 * Closed at module scope (no per-call mutation in production code);
 * the `__resetRegistryForTests()` helper is the only mutation seam.
 */

import type { PublishPusher, PublishTargetType } from "./types.js";

const pushers = new Map<PublishTargetType, PublishPusher>();

export function registerPublishPusher(
  targetType: PublishTargetType,
  pusher: PublishPusher,
): void {
  pushers.set(targetType, pusher);
}

export function getPublishPusher(
  targetType: PublishTargetType,
): PublishPusher | undefined {
  return pushers.get(targetType);
}

export function listRegisteredTargetTypes(): PublishTargetType[] {
  return [...pushers.keys()];
}

/**
 * Test seam — clears the registry. Production code MUST NOT call
 * this. Source-scan tests pin the visibility of this symbol.
 */
export function __resetRegistryForTests(): void {
  pushers.clear();
}
