/**
 * Code Studio Module Manifest
 *
 * Runtime: worker — owns codedb, OpenCode runtime, IDE proxy.
 */

import type { ModuleManifest } from "../platform/modules/types";
import { codeStudioRouter } from "./api/router";
import { dbPingHealth } from "../platform/modules/health";
import { registerModuleHealthAction } from "../platform/modules/register-module-health-action";
import { registerHandoffAcceptor } from "../platform/handoff";
import type { CodeStudioRunHandoffPayload } from "./handoffs";

export const codeStudioManifest: ModuleManifest = {
  key: "codeStudio",
  name: "Code Studio",
  version: "1.0.0",

  runtime: { mode: "worker", required: false },

  database: {
    kind: "owned",
    key: "codedb",
    connect: async () => {
      const { getCodeDb } = await import("./connection");
      return getCodeDb();
    },
  },

  router: codeStudioRouter,
  routerKey: "codeStudio",

  permissions: {
    keys: [
      "codeStudio.read",
      "codeStudio.write",
      "codeStudio.run",
      "codeStudio.template.publish",
    ],
  },

  governanceActions: [
    {
      key: "codeStudio.template.publish",
      description: "Publish a Code Studio template",
      risk: "medium",
      receiptRequired: true,
    },
    {
      key: "codeStudio.run.execute",
      description: "Execute a Code Studio run",
      risk: "medium",
      receiptRequired: true,
    },
  ],

  routes: [{ path: "/code-studio", label: "Code Studio" }],
  navigation: [{ group: "build", label: "Code Studio", order: 10 }],

  boot: async (ctx) => {
    registerModuleHealthAction(codeStudioManifest);
    try {
      const { seedCodeDb } = await import("./seed");
      await seedCodeDb();
    } catch (err: any) {
      ctx.log("warn", `seed skipped — ${err?.message ?? err}`);
    }
    // Literal type string used so check:wiring:handoff can verify
    // statically; CODE_STUDIO_HANDOFFS.runRequested is the constant.
    registerHandoffAcceptor("codeStudio", "codeStudio.run.requested", async (handoff) => {
      const payload = handoff.payload as Partial<CodeStudioRunHandoffPayload>;
      const templateKey = payload?.templateKey;
      if (!templateKey) {
        return { accepted: false, reason: "templateKey missing from payload" };
      }
      try {
        const repo = await import("./repository");
        const orchestrator = await import("./worker/job-orchestrator");
        const job = await repo.createJob({
          title: `${templateKey} (handoff ${handoff.handoffId.slice(0, 8)})`,
          description: `Handoff from ${handoff.fromModule}`,
          objective: templateKey,
          constraints: payload.inputs,
          sourceModule: handoff.fromModule,
          sourceWorkflowId: handoff.correlationId,
          actorUserId: typeof handoff.actorId === "number" ? handoff.actorId : undefined,
        });
        await repo.createHandoff({
          jobId: job.id,
          direction: "inbound",
          sourceModule: handoff.fromModule,
          payload: { handoffId: handoff.handoffId, ...payload },
        });
        await orchestrator.startJob(job.id);
        return { accepted: true };
      } catch (err: any) {
        ctx.log("warn", `codeStudio.run.requested handoff failed: ${err?.message ?? err}`);
        return { accepted: false, reason: err?.message ?? "internal error" };
      }
    });
  },

  postListen: async (ctx) => {
    try {
      const { syncProviderKeysToOpenCode } = await import("./opencode/provider-sync");
      const result = await syncProviderKeysToOpenCode();
      if (result.synced.length > 0) {
        ctx.log("info", `Synced provider keys: ${result.synced.join(", ")}`);
      }
      if (result.errors.length > 0) {
        ctx.log("warn", `Sync errors: ${result.errors.join(", ")}`);
      }
    } catch {
      /* non-fatal */
    }
  },

  health: async () => {
    const { getCodeDb } = await import("./connection");
    return dbPingHealth("CODEDB", getCodeDb);
  },

  publicApi: { path: "server/code-studio/public-api.ts" },
  events: { emits: ["codeStudio.run.completed", "codeStudio.run.failed"] },
  handoffs: { accepts: ["codeStudio.run.requested"], produces: [] },
  ports: { provided: ["codeStudio.run"], consumed: [] },
  runtimePorts: [
    {
      key: "opencode-runtime",
      label: "OpenCode Runtime",
      mode: "external",
      protocol: "http",
      env: "OPENCODE_URL",
      defaultUrl: "http://127.0.0.1:4096",
      defaultHost: "127.0.0.1",
      defaultPort: 4096,
      externallyManaged: true,
      description: "OpenCode runtime HTTP endpoint targeted by Code Studio.",
    },
    {
      key: "opencode-web",
      label: "OpenCode Web",
      mode: "range",
      protocol: "http",
      envBase: "OPENCODE_WEB_BASE_PORT",
      envMax: "OPENCODE_WEB_MAX_PORT",
      defaultRange: [4200, 4299],
      defaultHost: "127.0.0.1",
      runtimeOwned: true,
      description: "Per-session OpenCode Web instances; one TCP port per running instance.",
    },
    {
      key: "codedb",
      label: "CODEDB (Postgres)",
      mode: "external",
      protocol: "postgres",
      env: "DATABASE_URL_CODEDB",
      defaultPort: 5432,
      defaultHost: "127.0.0.1",
      defaultUrl: "postgres://127.0.0.1:5432/codedb",
      externallyManaged: true,
      description: "Code Studio module-owned database; falls back to local Postgres.",
    },
  ],
  communication: { modes: ["gateway", "handoff", "event", "coordinator"] },
};
