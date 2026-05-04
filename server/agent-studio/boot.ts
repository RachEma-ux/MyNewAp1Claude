/**
 * AI Agent Studio — Boot Entry Point
 *
 * Phase 12.5: single-call boot for the entire Agent Studio module.
 * Called once from server/_core/index.ts at startup. Replaces both
 * the previous (implicit) DB-via-main-app pattern AND the Phase 10
 * scheduler self-start side effect.
 *
 * Why a wrapper module:
 *  - Keeps the platform-file edit at +1 line in _core/index.ts (under
 *    the 22-line additive footprint budget). Without this, we'd add
 *    5 lines for the seed try/catch + extra lines for any future
 *    Agent Studio boot work.
 *  - Formalizes the Phase 10 scheduler self-start. Previously the
 *    scheduler used a top-level `ensureSchedulerStarted()` side
 *    effect at module-load time, kicked off when the runtime
 *    sub-router imported it. That implicit pattern is fragile
 *    (depends on import order) — the explicit boot call here is
 *    cleaner and easier to audit.
 *  - Mirrors how server/_core/index.ts already wires per-module seed
 *    functions (seedWfDb, seedPrmDb, seedPsmDb, seedCodeDb).
 *
 * What this function does, in order:
 *  1. Seed ASDB — runs CREATE TABLE IF NOT EXISTS for all 32 ags_*
 *     tables. Idempotent. Failures logged but non-fatal.
 *  2. Start the Phase 10 scheduler — 60s tick loop that fires
 *     scheduled agents. Uses unref() so it doesn't keep the dev
 *     server alive after exit.
 */

export async function bootAgentStudio(): Promise<void> {
  // Step 1: ASDB schema seed (Phase 12.5)
  try {
    const { seedAsDb } = await import("./db/seed");
    await seedAsDb();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ASDB] Seed skipped — ${message}`);
  }

  // Step 2: Boot-time agent seeds (Phase 19 follow-up)
  //
  // Idempotent seed functions that materialize meta-agents required
  // for Studio self-hosting. Currently ships one: the Agent Studio
  // Expert (a meta-agent that creates other agents). Each seed
  // function checks for existing rows before inserting, so restarts
  // are safe — existing agents are skipped with a log line.
  //
  // Why boot-time instead of a one-shot SQL file:
  //  - Fresh dev installs, CI test runs, and the deployed tunnel
  //    all get the same agents without manual psql steps
  //  - Drizzle gives compile-time schema validation vs brittle SQL
  //  - Future meta-agents (QA bot, migration helper) slot in here
  try {
    const { seedAgentStudioExpert } = await import(
      "./db/seed-agent-studio-expert"
    );
    const result = await seedAgentStudioExpert();
    if (result.created) {
      console.log(
        `[ASDB] Agent Studio Expert seeded at id=${result.agentId}`
      );
    } else if (result.agentId > 0) {
      console.log(
        `[ASDB] Agent Studio Expert present at id=${result.agentId} (${result.reason})`
      );
    } else {
      console.warn(
        `[ASDB] Agent Studio Expert seed skipped: ${result.reason}`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ASDB] Agent Studio Expert seed failed: ${message}`);
  }

  // Step 2b: Boot-time seed for the 5 fixture agents (legacy parity).
  try {
    const { seedLegacyFixtures } = await import("./db/seed-legacy-fixtures");
    const result = await seedLegacyFixtures();
    if (result.created > 0) {
      console.log(
        `[ASDB] Legacy fixtures seeded — ${result.created} created, ${result.skipped} already present (of ${result.total})`
      );
    } else if (result.total > 0) {
      console.log(
        `[ASDB] Legacy fixtures present — ${result.skipped}/${result.total} already seeded`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ASDB] Legacy fixtures seed failed: ${message}`);
  }

  // Step 3: Phase 10 scheduler — formalized boot path
  try {
    const { ensureSchedulerStarted } = await import("./services/scheduler");
    ensureSchedulerStarted();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ags-scheduler] start skipped — ${message}`);
  }

  // Step 4: Public API handlers for agentStudio.agent.publish + agentStudio.run.execute
  try {
    const { registerPublicApi } = await import("../platform/modules/module-gateway");
    registerPublicApi({
      module: "agentStudio",
      action: "agentStudio.agent.publish",
      handler: async (input) => {
        const payload = input as {
          agentId: number;
          versionId: number;
          targetEnvironment: string;
          releaseNotes?: string;
          publishedBy?: number;
        };
        const repo = await import("./repository");
        return repo.publishRelease(payload);
      },
      descriptor: {
        key: "agentStudio.agent.publish",
        description:
          "Publish an agent (lifecycle-only flip + agsAgentReleases insert; no catalog writes)",
        // Plan v3 Phase 20 — see RECEIPT_POLICY.md.
        risk: "medium",
        receiptRequired: true,
      },
    });
    registerPublicApi({
      module: "agentStudio",
      action: "agentStudio.run.execute",
      handler: async (input) => {
        const payload = input as {
          agentId: number;
          versionId?: number;
          environment?: string;
          inputPayload?: Record<string, unknown>;
          triggeredBy?: number;
        };
        if (typeof payload?.agentId !== "number") throw new Error("agentId is required");
        const repo = await import("./repository");
        return repo.appendRuntimeRun({
          agentId: payload.agentId,
          versionId: payload.versionId,
          environment: payload.environment ?? "production",
          status: "queued",
          triggerType: "gateway",
          triggeredBy: payload.triggeredBy,
          inputPayload: payload.inputPayload ?? {},
        });
      },
      descriptor: {
        key: "agentStudio.run.execute",
        description: "Execute an agent run",
        risk: "medium",
        receiptRequired: true,
      },
    });

    // Plan v3 Phase 12 — provider/model binding gateway actions.
    // All six wrap server/agent-studio/bindings.ts. None return any
    // credential material.
    registerPublicApi({
      module: "agentStudio",
      action: "agentStudio.providerBindings.list",
      handler: async (input) => {
        const { agentId } = input as { agentId: number };
        if (typeof agentId !== "number") throw new Error("agentId is required");
        const { listBindingsForAgent } = await import("./bindings");
        return listBindingsForAgent(agentId);
      },
      descriptor: {
        key: "agentStudio.providerBindings.list",
        description: "List provider bindings for an agent (no credentials)",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "agentStudio",
      action: "agentStudio.providerBindings.create",
      handler: async (input) => {
        const { upsertAgentProviderBinding } = await import("./bindings");
        const payload = input as Parameters<
          typeof upsertAgentProviderBinding
        >[0];
        return upsertAgentProviderBinding(payload);
      },
      descriptor: {
        key: "agentStudio.providerBindings.create",
        description:
          "Create a provider binding (calls Phase 8 eligibility gate)",
        risk: "medium",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "agentStudio",
      action: "agentStudio.providerBindings.update",
      handler: async (input) => {
        const { upsertAgentProviderBinding } = await import("./bindings");
        const payload = input as Parameters<
          typeof upsertAgentProviderBinding
        >[0];
        return upsertAgentProviderBinding(payload);
      },
      descriptor: {
        key: "agentStudio.providerBindings.update",
        description:
          "Update an existing provider binding (re-runs eligibility gate)",
        risk: "medium",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "agentStudio",
      action: "agentStudio.providerBindings.remove",
      handler: async (input) => {
        const { draftId, role } = input as { draftId: number; role?: string };
        if (typeof draftId !== "number") throw new Error("draftId is required");
        const { removeAgentProviderBinding } = await import("./bindings");
        const removed = await removeAgentProviderBinding(draftId, role);
        return { draftId, role: role ?? "primary", removed };
      },
      descriptor: {
        key: "agentStudio.providerBindings.remove",
        description: "Delete a provider binding by (draftId, role)",
        risk: "medium",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "agentStudio",
      action: "agentStudio.providerBindings.validate",
      handler: async (input) => {
        const { draftId, role } = input as { draftId: number; role?: string };
        if (typeof draftId !== "number") throw new Error("draftId is required");
        const { validateBindingPolicy } = await import("./bindings");
        return validateBindingPolicy(draftId, role);
      },
      descriptor: {
        key: "agentStudio.providerBindings.validate",
        description:
          "Reference/policy validation of a binding — no upstream HTTP probe",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "agentStudio",
      action: "agentStudio.providerBindings.resolveForRun",
      handler: async (input) => {
        const { resolveForRun } = await import("./bindings");
        const payload = input as Parameters<typeof resolveForRun>[0];
        return resolveForRun(payload);
      },
      descriptor: {
        key: "agentStudio.providerBindings.resolveForRun",
        description:
          "Resolve a binding for runtime use — returns refs only, no credentials",
        risk: "low",
        receiptRequired: false,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ags-publicApi] registration skipped — ${message}`);
  }

  // Step 5: Handoff acceptor for agentStudio.run.requested
  //
  // Receives a request from another module (PM Central, Sandbox WF, etc.)
  // to start a runtime run for a known agent. The acceptor delegates to
  // the same `appendRuntimeRun` repository function the regular runtime
  // runner uses, so the handoff path and the in-process path produce
  // identical run records.
  try {
    const { registerHandoffAcceptor } = await import("../platform/handoff");
    // Literal type string used so check:wiring:handoff can verify
    // statically; AGENT_STUDIO_HANDOFFS.runRequested in handoffs.ts
    // is the canonical constant.
    registerHandoffAcceptor(
      "agentStudio",
      "agentStudio.run.requested",
      async (handoff) => {
        const payload = handoff.payload as {
          agentId?: number;
          versionId?: number;
          environment?: string;
          inputPayload?: Record<string, unknown>;
        };
        if (typeof payload?.agentId !== "number") {
          return { accepted: false, reason: "agentId missing from payload" };
        }
        try {
          const repo = await import("./repository");
          await repo.appendRuntimeRun({
            agentId: payload.agentId,
            versionId: payload.versionId,
            environment: payload.environment ?? "production",
            status: "queued",
            triggeredBy: typeof handoff.actorId === "number" ? handoff.actorId : undefined,
            triggerType: "handoff",
            inputPayload: payload.inputPayload ?? {},
          });
          return { accepted: true };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.warn(`[ags-handoff] agentStudio.run.requested failed: ${msg}`);
          return { accepted: false, reason: msg };
        }
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ags-handoff] acceptor registration skipped — ${message}`);
  }

  // Step 6: MCP hardening Phase 5.1 — subscribe the persisted transition
  // log to the FSM event bus. Every successful FSM transition appends one
  // row to ags_mcp_transitions (capped per server inside the repo helper).
  // Subscriber runs async (decision #9b inside connection-events.ts) so a
  // slow DB write cannot block the FSM critical path.
  try {
    const { onTransition } = await import("./services/mcp/connection-events");
    const repo = await import("./repository");
    onTransition((t) => {
      const reason =
        ("reason" in t.to ? (t.to as { reason?: string }).reason : undefined) ??
        ("reason" in t.event
          ? (t.event as { reason?: string }).reason
          : undefined) ??
        null;
      void repo
        .recordMcpTransition(
          t.serverId,
          t.from.kind,
          t.to.kind,
          t.event.type,
          reason
        )
        .catch((e) => {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn(
            `[ags-mcp] transition log write failed for #${t.serverId}: ${msg}`
          );
        });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ags-mcp] transition subscriber skipped — ${message}`);
  }
}

/**
 * Post-listen boot steps — MCP server auto-reconnect.
 *
 * Called from server/_core/index.ts AFTER `server.listen()` resolves,
 * because some MCP servers (notably `studio-self`) are http transports
 * that point at the Studio's own `/api/mcp` endpoint. If we auto-
 * connect before the listener is ready, those self-loop servers
 * fail with "fetch failed".
 *
 * Root cause this fixes: the MCP manager keeps connection state in a
 * process-local `connections` map and the registry keeps tool
 * snapshots in another process-local `snapshots` map. Both are reset
 * on every dev-server restart and on every HMR reload of the
 * mcp-manager module. The DB rows still read status="connected" from
 * the previous process lifetime, which is stale and misleading.
 *
 * Symptom users hit without this fix: chat with an agent whose draft
 * has MCP tools → chat-stream.ts buildToolsForDraft calls getSnapshot
 * → returns undefined → tools list passed to OpenAI is empty → the
 * model free-associates a tool call in prose instead of emitting a
 * structured tool_calls delta → output looks garbled/broken.
 */
export async function bootAgentStudioPostListen(): Promise<void> {
  try {
    const repo = await import("./repository");
    const { connectMcpServer } = await import("./services/mcp/mcp-manager");
    const servers = await repo.listAllMcpServers();
    let connected = 0;
    let failed = 0;
    for (const server of servers) {
      if (!server.enabled) continue;
      try {
        const result = await connectMcpServer({ serverId: server.id });
        if (result.status === "connected") {
          connected++;
        } else {
          failed++;
          console.warn(
            `[ags-mcp] auto-connect failed for #${server.id} ${server.name}: ${result.error ?? "unknown"}`
          );
        }
      } catch (e) {
        failed++;
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(
          `[ags-mcp] auto-connect exception for #${server.id} ${server.name}: ${msg}`
        );
      }
    }
    if (connected > 0 || failed > 0) {
      console.log(
        `[ags-mcp] auto-connect: ${connected} connected, ${failed} failed`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ags-mcp] auto-connect skipped — ${message}`);
  }
}
