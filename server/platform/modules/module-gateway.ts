/**
 * Module Gateway — Platform Modular
 *
 * Governed synchronous cross-module calls.
 *
 * A module exposes a typed public API. Other modules invoke it via the
 * gateway, which:
 *   - resolves the target module's manifest,
 *   - verifies the action exists,
 *   - enforces governance receipt for sensitive actions,
 *   - applies timeout + retry policy,
 *   - assigns a correlationId,
 *   - records audit information,
 *   - calls the target's public function.
 *
 * The gateway never imports another module's private internals. Callers
 * register their public API functions via `registerPublicApi`.
 */

import type {
  ModuleGovernanceActionDescriptor,
  ModuleKey,
} from "./types";
import { getModuleRegistry } from "./registry";
import { sealContext, type ModuleCallContext, type SealedModuleCallContext } from "./boundary";

type Handler = (input: unknown, ctx: SealedModuleCallContext) => unknown | Promise<unknown>;

interface RegisteredAction {
  module: ModuleKey;
  action: string;
  handler: Handler;
  descriptor?: ModuleGovernanceActionDescriptor;
}

const registry = new Map<string, RegisteredAction>();

function key(module: ModuleKey, action: string) {
  return `${module}::${action}`;
}

export interface GatewayCallOptions {
  /** Optional ms timeout for the call. Default: 30s. */
  timeoutMs?: number;
  /** Optional retry policy (only retries network-style errors thrown by handler). */
  maxAttempts?: number;
}

export interface RegisterPublicApiOptions {
  module: ModuleKey;
  action: string;
  handler: Handler;
  descriptor?: ModuleGovernanceActionDescriptor;
}

/** A module registers a public API entrypoint with the gateway. */
export function registerPublicApi(opts: RegisterPublicApiOptions): void {
  const k = key(opts.module, opts.action);
  if (registry.has(k)) {
    // Allow re-register only if same descriptor — useful in dev tsx watch.
    const prev = registry.get(k)!;
    if (prev.descriptor?.key === opts.descriptor?.key && prev.module === opts.module) {
      registry.set(k, { ...prev, handler: opts.handler });
      return;
    }
    throw new Error(
      `[ModuleGateway] Duplicate registration: ${opts.module}.${opts.action}`,
    );
  }
  registry.set(k, {
    module: opts.module,
    action: opts.action,
    handler: opts.handler,
    descriptor: opts.descriptor,
  });
}

export interface GatewayCall<I = unknown, O = unknown> {
  ctx: ModuleCallContext;
  input: I;
  options?: GatewayCallOptions;
}

export async function gatewayCall<I = unknown, O = unknown>(
  call: GatewayCall<I, O>,
): Promise<O> {
  const { ctx, input, options } = call;
  const sealed = sealContext(ctx);

  const k = key(ctx.targetModule, ctx.actionKey);
  const entry = registry.get(k);
  if (!entry) {
    throw new Error(`[ModuleGateway] Unknown action '${ctx.actionKey}' on '${ctx.targetModule}'`);
  }

  // Verify module is enabled.
  const targetManifest = getModuleRegistry().get(entry.module);
  if (!targetManifest) {
    throw new Error(`[ModuleGateway] Target module '${entry.module}' not registered`);
  }

  // Governance receipt enforcement
  if (entry.descriptor?.receiptRequired && !sealed.governanceReceiptId) {
    throw new Error(
      `[ModuleGateway] Action '${entry.action}' on '${entry.module}' requires a governance receipt`,
    );
  }

  // Timeout + retry
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 1);
  const timeoutMs = options?.timeoutMs ?? 30_000;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await withTimeout(entry.handler(input, sealed), timeoutMs);
      return result as O;
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts) break;
      // Retry-on-network-error heuristic
      const msg = err instanceof Error ? err.message : String(err);
      if (!/timeout|ECONNRESET|EAI_AGAIN|ETIMEDOUT/i.test(msg)) break;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function withTimeout<T>(p: Promise<T> | T, ms: number): Promise<T> {
  if (!(p instanceof Promise)) return p;
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`[ModuleGateway] Call timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Test/debug helper — list registered actions. */
export function listRegisteredActions(): Array<{ module: string; action: string }> {
  return [...registry.values()].map((e) => ({ module: e.module, action: e.action }));
}

/** Test-only — clears all registrations. */
export function __resetGatewayForTests(): void {
  registry.clear();
}
