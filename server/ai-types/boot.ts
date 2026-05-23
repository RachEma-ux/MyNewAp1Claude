/**
 * AI Types Module — Boot Wiring
 *
 * Called once at server startup to wire real implementations
 * into the AI Types port interfaces. After this runs, the
 * AI Types module can call providers, agents, and governance
 * through its ports without importing them directly.
 *
 * Uses dynamic import() instead of require() for ESM compatibility
 * with the tsx runtime. All port methods are called lazily at
 * execution time, not at boot time, so circular deps are avoided.
 */

import {
  setProviderPort,
  setAgentPort,
  setGovernancePort,
  setProviderDbPort,
  type ICatalogProviderPort,
  type ICatalogAgentPort,
  type ICatalogGovernancePort,
  type ICatalogProviderDbPort,
} from "./ports";

// Cached module references — populated by async pre-load at boot,
// used synchronously at execution time (always resolved by then).
let _registryMod: any = null;
let _booted = false;

/**
 * Initialize the AI Types module by wiring external dependencies.
 * Must be called before any catalog execution or governance operation.
 *
 * Idempotent: invoked from two paths today — the direct call in
 * server/_core/index.ts (early, so subsequent startup steps can use
 * the ports) and the manifest's `boot()` hook driven by RuntimeManager.
 * The second call is a no-op.
 */
export function bootAiTypesModule() {
  if (_booted) return;
  _booted = true;
  // Pre-load the provider registry module. By the time any user
  // triggers catalog execution, this import will have resolved.
  import("../providers/registry").then((mod) => {
    _registryMod = mod;
  });

  const providerPort: ICatalogProviderPort = {
    getRegistry() {
      if (!_registryMod) {
        throw new Error("[AI Types] Provider registry not yet loaded.");
      }
      return _registryMod.getProviderRegistry();
    },
  };

  const agentPort: ICatalogAgentPort = {
    async getAgent(agentId: number) {
      const mod = await import("../agents/db");
      return mod.getAgent(agentId);
    },
  };

  const governancePort: ICatalogGovernancePort = {
    async evaluateStageReview(entryId, stage, context) {
      // Bridge between the AI Types port shape and the governance
      // module's actual signature. The port hands us an entry id +
      // free-form context; the real evaluateStageReview takes a fully
      // populated entry object and an actor object. We synthesize a
      // minimal entry from the context (or fall back to id-only) and
      // map the result shape from {stage, passed, items, score, ...}
      // to {decision, findings}.
      const mod = await import("../governance/stage-review");
      const ctxEntry = (context?.entry as Record<string, unknown>) ?? {};
      const entryShape = {
        id: entryId,
        name: typeof ctxEntry.name === "string" ? ctxEntry.name : `entry-${entryId}`,
        entryType: typeof ctxEntry.entryType === "string" ? ctxEntry.entryType : "unknown",
        tags: Array.isArray(ctxEntry.tags) ? (ctxEntry.tags as string[]) : [],
        description: typeof ctxEntry.description === "string" ? ctxEntry.description : undefined,
        config: ctxEntry.config,
        reviewState: typeof ctxEntry.reviewState === "string" ? ctxEntry.reviewState : undefined,
        status: typeof ctxEntry.status === "string" ? ctxEntry.status : undefined,
        validationStatus: typeof ctxEntry.validationStatus === "string" ? ctxEntry.validationStatus : undefined,
        capabilities: Array.isArray(ctxEntry.capabilities) ? (ctxEntry.capabilities as string[]) : undefined,
        stageReviews: (ctxEntry.stageReviews as Record<string, string>) ?? undefined,
        classifications: Array.isArray(ctxEntry.classifications) ? (ctxEntry.classifications as string[]) : undefined,
      };
      const ctxActor = (context?.actor as Record<string, unknown>) ?? {};
      const actorShape = {
        id: typeof ctxActor.id === "number" ? ctxActor.id : 0,
        role: typeof ctxActor.role === "string" ? ctxActor.role : "system",
      };
      const raw = mod.evaluateStageReview(
        entryShape,
        stage as any, // LifecycleStage — caller is responsible
        actorShape as any
      );
      // Map to the port's flat shape
      const decision: "pass" | "block" | "warn" = raw.passed
        ? "pass"
        : raw.blockers.length > 0
          ? "block"
          : "warn";
      // CheckResult shape: { itemId, name, passed, category, details, remediation? }
      // Map to the port's { code, severity, message } finding shape.
      const findings = raw.items
        .filter((i) => !i.passed)
        .map((i) => ({
          code: i.itemId,
          severity: raw.blockers.includes(i) ? "blocker" : "warning",
          message: `${i.name}: ${i.details}`,
        }));
      return { decision, findings };
    },
  };

  const providerDbPort: ICatalogProviderDbPort = {
    async getAllProviders() {
      const mod = await import("../providers/db");
      return mod.getAllProviders();
    },
    async getProviderById(id: number) {
      const mod = await import("../providers/db");
      const all = await mod.getAllProviders();
      return all.find((p: any) => p.id === id) ?? null;
    },
  };

  setProviderPort(providerPort);
  setAgentPort(agentPort);
  setGovernancePort(governancePort);
  setProviderDbPort(providerDbPort);

  console.log("[AI Types] Module ports wired successfully");

  // 2026-05-23 — backfill domain tables on every boot.
  //
  // `backfillDomainTables()` scans `catalog_entries` for rows that
  // lack a `sourceType`/`sourceId` link and creates the matching
  // `ai_type_models` / `ai_type_llms` / provider-link rows. Its
  // doc-comment names "server startup" as one of the intended call
  // sites; before this wiring it was exported but never invoked, so
  // the binding picker (`agentStudio.providerBindings.pickerAvailableModels`)
  // returned `[]` on any fresh deployment even though the catalog
  // already had `provider`/`model` rows. The fn is idempotent — it
  // skips already-linked entries — so safe to run on every boot.
  //
  // Fire-and-forget: the boot path must not block on a DB write.
  // Errors surface as a single log line; the picker degrades to an
  // empty list (existing behavior) if the backfill itself fails.
  void (async () => {
    try {
      const { backfillDomainTables } = await import("./migration");
      const result = await backfillDomainTables();
      if (
        result.modelsCreated > 0 ||
        result.llmsCreated > 0 ||
        result.providersLinked > 0 ||
        result.agentsLinked > 0
      ) {
        console.log(
          `[AI Types] Domain backfill — scanned=${result.scanned} models=${result.modelsCreated} llms=${result.llmsCreated} providers_linked=${result.providersLinked} agents_linked=${result.agentsLinked} skipped=${result.skipped} errors=${result.errors.length}`,
        );
      } else if (result.scanned > 0) {
        console.log(
          `[AI Types] Domain backfill — ${result.scanned} unlinked catalog_entries scanned, nothing to create (likely a partial-shape issue; see ai-types/migration.ts)`,
        );
      }
      // scanned=0 means everything is already linked — no log needed.
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AI Types] Domain backfill skipped — ${msg}`);
    }
  })();
}
