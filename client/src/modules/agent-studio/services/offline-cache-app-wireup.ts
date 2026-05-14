/**
 * Offline cache app wire-up — V2 Phase UI-1.
 *
 * Bridges the OL-6 `bootstrapOfflineCache` composer to the live
 * tRPC client created at main.tsx boot. Extracted to its own file
 * so the wiring is unit-testable without standing up the full app.
 *
 * Why a separate vanilla tRPC client:
 *   `trpc.createClient(...)` (from `createTRPCReact<AppRouter>()`)
 *   wires the React-hooks provider; the offline-drain closures need
 *   to run OUTSIDE a React render tree (at app boot, on the
 *   `window.online` event). The vanilla `createTRPCClient<AppRouter>`
 *   returns a procedure proxy with `.mutate(input)` per procedure —
 *   exactly the shape `bootstrapOfflineCache` expects.
 *
 * The two clients share the same `httpBatchLink` URL + SuperJSON
 * transformer + credential handling, so server-side governance
 * runs identically for online and offline-drain requests.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `credential-resolver` import. tRPC handles auth via cookies.
 *   - No `dispatchMcpToolCall` import. The OL-1 deny-list excludes
 *     `mcp.dispatch` from offline queueing.
 *   - No raw `process.env.*_API_KEY` reads.
 *   - No `neo4j-driver` import.
 *   - Bootstrap failures are caught — a failed offline-cache bootstrap
 *     does NOT prevent the app from rendering.
 */

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

import type { AppRouter } from "../../../../../server/routers";
import {
  bootstrapOfflineCache,
  type BootstrapOfflineCacheResult,
} from "./offline-cache-full-bootstrap.js";

export interface MakeOfflineCacheTrpcClientOptions {
  /** Test seam — override the fetch impl. Defaults to `globalThis.fetch`. */
  readonly fetchImpl?: typeof fetch;
  /** Test seam — override the tRPC endpoint. Defaults to `/api/trpc`. */
  readonly trpcUrl?: string;
}

export function makeOfflineCacheTrpcClient(
  opts: MakeOfflineCacheTrpcClientOptions = {},
) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: opts.trpcUrl ?? "/api/trpc",
        transformer: superjson,
        fetch(input, init) {
          const f = opts.fetchImpl ?? globalThis.fetch;
          return f(input, {
            ...(init ?? {}),
            credentials: "include",
          });
        },
      }),
    ],
  });
}

export interface WireOfflineCacheToTrpcOptions
  extends MakeOfflineCacheTrpcClientOptions {
  /** Optional telemetry beacon — fires once bootstrap completes. */
  readonly onBootstrapComplete?: (result: BootstrapOfflineCacheResult) => void;
  /** Optional telemetry beacon — fires if bootstrap throws. The
   *  default is `console.warn` so a failed bootstrap surfaces but
   *  does not prevent rendering. */
  readonly onBootstrapError?: (err: unknown) => void;
}

/**
 * Top-level wire-up called from `main.tsx`. Constructs a vanilla
 * tRPC client (sibling to the React-hooks client), binds its three
 * `agentStudio.vault.*Note` mutations into the offline-cache
 * bootstrap, and starts the hydrate + listener chain.
 *
 * Returns the bootstrap promise so callers can `void` it and let
 * boot continue. Errors are routed through `onBootstrapError`
 * rather than thrown — the app must render even if the offline
 * cache can't initialize.
 */
export function wireOfflineCacheToTrpc(
  opts: WireOfflineCacheToTrpcOptions = {},
): Promise<BootstrapOfflineCacheResult | null> {
  const client = makeOfflineCacheTrpcClient(opts);
  const onError =
    opts.onBootstrapError ??
    ((err) => console.warn("[offline-cache] bootstrap failed:", err));

  // Narrow runtime view of the procedure-proxy client. tRPC v11
  // returns a typed proxy via `createTRPCClient<AppRouter>`; this
  // cast lets the offline-cache module stay tRPC-type-free at its
  // own boundary while the wire-up file owns the AppRouter import.
  const proc = client as unknown as {
    agentStudio: {
      vault: {
        updateNote: { mutate: (i: unknown) => Promise<unknown> };
        createNote: { mutate: (i: unknown) => Promise<unknown> };
        deleteNote: { mutate: (i: unknown) => Promise<unknown> };
      };
    };
  };

  return bootstrapOfflineCache({
    // Server re-runs Zod + governance on every replay; the offline
    // queue stores the exact payload at enqueue time and forwards
    // it untouched here.
    updateNote: (payload) => proc.agentStudio.vault.updateNote.mutate(payload),
    createNote: (payload) => proc.agentStudio.vault.createNote.mutate(payload),
    deleteNote: (payload) => proc.agentStudio.vault.deleteNote.mutate(payload),
  })
    .then((result) => {
      opts.onBootstrapComplete?.(result);
      return result;
    })
    .catch((err) => {
      onError(err);
      return null;
    });
}
