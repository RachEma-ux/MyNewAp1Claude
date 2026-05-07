/**
 * OpenRouter Module Manifest
 */

import type { ModuleManifest } from "../platform/modules/types";
import { openRouterRouter } from "./router";
import { okHealth } from "../platform/modules/health";
import { registerModuleHealthAction } from "../platform/modules/register-module-health-action";

export const openRouterManifest: ModuleManifest = {
  key: "openRouter",
  name: "OpenRouter — Unified Model Gateway",
  version: "1.0.0",

  runtime: { mode: "embedded", required: false },

  database: { kind: "shared", schema: "appdb", ownedTables: ["openrouter_*"] },

  router: openRouterRouter,
  routerKey: "openRouter",

  permissions: { keys: ["openRouter.read", "openRouter.write"] },

  governanceActions: [
    {
      key: "openRouter.config.update",
      description: "Update OpenRouter routing configuration",
      risk: "high",
      receiptRequired: true,
    },
    // Plan v3 D4: Model Access lives at server/openrouter/model-access/.
    // Receipt policy here matches Plan v3 Phase 20 (final receipt
    // tiering). `execute` is medium-risk by default; receipt
    // requirement at the action level is policy-based — callers
    // pass through a governance gate before invoking. Phase 17/18
    // will tighten the per-intent split (production external runs
    // require receipt; agent-test runs are policy-based).
    {
      key: "openRouter.modelAccess.execute",
      description:
        "Execute a non-streaming provider model call via Model Access",
      risk: "medium",
      receiptRequired: false,
    },
    {
      key: "openRouter.modelAccess.stream",
      description:
        "Execute a streaming provider model call via Model Access",
      risk: "medium",
      receiptRequired: false,
    },
    {
      key: "openRouter.modelAccess.validateBinding",
      description:
        "Probe a Provider Connection + model ref for runtime readiness",
      risk: "low",
      receiptRequired: false,
    },
    {
      key: "openRouter.modelAccess.embed",
      description:
        "Generate embeddings via Model Access (Phase 28.4 — D-MA-EMBED-1)",
      risk: "medium",
      receiptRequired: false,
    },
  ],

  routes: [{ path: "/openrouter", label: "OpenRouter" }],
  navigation: [{ group: "infrastructure", label: "OpenRouter", order: 20 }],

  health: async () => okHealth("OpenRouter ready"),

  publicApi: { path: "server/openrouter/public-api.ts" },
  events: { emits: ["openRouter.routing.config.updated"] },
  ports: {
    provided: [
      "openRouter.route",
      // Plan v3 D4: OpenRouter hosts Model Access (no new RTLM).
      "openRouter.modelAccess",
      "openRouter.inferenceRouting",
    ],
    consumed: [
      // Phase 4: Model Access reaches Provider Connections through
      // the internal credential resolver. The boundary is enforced
      // by scripts/check-provider-credential-resolver-boundary.ts.
      "providerConnections.credential",
    ],
  },
  communication: { modes: ["port", "gateway", "event"] },
  boot: async () => {
    registerModuleHealthAction(openRouterManifest);
    const { registerPublicApi } = await import("../platform/modules/module-gateway");
    registerPublicApi({
      module: "openRouter",
      action: "openRouter.config.update",
      handler: async (input) => {
        const payload = input as {
          id: number;
          name?: string;
          description?: string;
          config?: Record<string, unknown>;
          actorId?: number;
        };
        if (typeof payload?.id !== "number") throw new Error("id is required");
        const { updateProfile } = await import("./routing-service");
        return updateProfile(
          payload.id,
          { name: payload.name, description: payload.description, config: payload.config },
          payload.actorId,
        );
      },
      descriptor: {
        key: "openRouter.config.update",
        description: "Update OpenRouter routing configuration",
        risk: "high",
        receiptRequired: true,
      },
    });

    // Plan v3 Phase 4: Model Access facade. Per D4, OpenRouter hosts
    // Model Access; per D2, this subtree is the only allowed importer
    // of the Provider Connections internal credential resolver.
    const { execute, validateBinding } = await import("./model-access");
    // Note: `stream` is exposed through the `execute` adapter for
    // gateway-call usage — the gateway returns a single value, not an
    // async iterable. Streaming consumers (Phase 17/18) call the
    // `stream()` function directly from inside OpenRouter.

    // Plan v3 Phase 20 — per-intent receipt policy. The descriptor's
    // `receiptRequired` flag is a single static boolean so we leave
    // it `false` and enforce per-intent in the handler:
    //   - `intent === "agent-test"` → no receipt required (sandboxed
    //     test runs).
    //   - `intent === "system-internal"` → no receipt required (PMB
    //     Phase 29.4a — infrastructure calls without a user-attributed
    //     receipt source: document indexing, RAG retrieval, operator
    //     classifiers, automation invokeAgent fallbacks). Audit is
    //     captured by the correlationId + the calling subsystem's
    //     own audit log.
    //   - any other intent (`agent-run` / `chat` / `evaluation`)
    //     → receipt required; handler throws if missing.
    // See `docs/architecture/provider-model-binding/RECEIPT_POLICY.md`.
    const enforceModelAccessReceipt = (
      intent: string,
      sealed: { governanceReceiptId?: string },
      action: "execute" | "stream" | "embed",
    ): void => {
      if (intent === "agent-test" || intent === "system-internal") return;
      if (sealed?.governanceReceiptId) return;
      throw new Error(
        `[ModelAccess] Action 'openRouter.modelAccess.${action}' with intent='${intent}' requires a governance receipt. Test intent ('agent-test') and infrastructure intent ('system-internal') are exempt.`,
      );
    };

    registerPublicApi({
      module: "openRouter",
      action: "openRouter.modelAccess.execute",
      handler: async (input, sealed) => {
        const payload = input as Parameters<typeof execute>[0];
        enforceModelAccessReceipt(payload.intent, sealed ?? {}, "execute");
        return execute(payload);
      },
      descriptor: {
        key: "openRouter.modelAccess.execute",
        description:
          "Execute a non-streaming provider model call via Model Access (receipt required for non-test intents — see RECEIPT_POLICY.md)",
        risk: "medium",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "openRouter",
      action: "openRouter.modelAccess.stream",
      handler: async (input, sealed) => {
        // Gateway-call form: collect the full stream and return as a
        // single ModelAccessResult-shaped object. Direct streaming
        // consumers should import `stream` from
        // `server/openrouter/model-access` instead.
        const { stream } = await import("./model-access");
        const payload = input as Parameters<typeof stream>[0];
        enforceModelAccessReceipt(payload.intent, sealed ?? {}, "stream");
        const start = Date.now();
        let combined = "";
        let finalUsage: undefined | NonNullable<Awaited<ReturnType<typeof execute>>["usage"]>;
        let finishReason: string | undefined;
        for await (const chunk of stream(payload)) {
          combined += chunk.delta;
          if (chunk.usage) finalUsage = chunk.usage;
          if (chunk.done) finishReason = chunk.finishReason;
        }
        return {
          status: "ok" as const,
          providerConnectionId: payload.providerConnectionId,
          modelRef: payload.modelRef,
          latencyMs: Date.now() - start,
          output: combined,
          usage: finalUsage,
          correlationId: payload.correlationId,
          finishReason,
        };
      },
      descriptor: {
        key: "openRouter.modelAccess.stream",
        description:
          "Execute a streaming provider model call via Model Access (receipt required for non-test intents — see RECEIPT_POLICY.md)",
        risk: "medium",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "openRouter",
      action: "openRouter.modelAccess.validateBinding",
      handler: async (input) => {
        const payload = input as Parameters<typeof validateBinding>[0];
        return validateBinding(payload);
      },
      descriptor: {
        key: "openRouter.modelAccess.validateBinding",
        description:
          "Probe a Provider Connection + model ref for runtime readiness",
        risk: "low",
        receiptRequired: false,
      },
    });

    // Phase 28.4 — embedding-execute primitive (D-MA-EMBED-1..7).
    registerPublicApi({
      module: "openRouter",
      action: "openRouter.modelAccess.embed",
      handler: async (input, sealed) => {
        const { embed } = await import("./model-access");
        const payload = input as Parameters<typeof embed>[0];
        enforceModelAccessReceipt(payload.intent, sealed ?? {}, "embed");
        return embed(payload);
      },
      descriptor: {
        key: "openRouter.modelAccess.embed",
        description:
          "Generate embeddings via Model Access (receipt required for non-test intents — see RECEIPT_POLICY.md, D-MA-EMBED-3)",
        risk: "medium",
        receiptRequired: false,
      },
    });
  },
};
