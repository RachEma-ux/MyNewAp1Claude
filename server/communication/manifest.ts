/**
 * Communication Module Manifest
 *
 * Registered top-level RTLM. Owns the dedicated `communicationdb`
 * database and the `conversations`, `messages`, `meetings`,
 * `participants`, and `notifications` domains.
 *
 * Other modules consume Communication exclusively through the
 * Module Gateway (see registerPublicApi calls in boot) or by
 * submitting handoffs to the accept types declared below.
 */

import type { ModuleManifest } from "../platform/modules/types";
import { communicationRouter } from "./router";
import { communicationHealth } from "./communication.health";
import { registerModuleHealthAction } from "../platform/modules/register-module-health-action";
import { registerPublicApi } from "../platform/modules/module-gateway";
import { registerHandoffAcceptor } from "../platform/handoff";

export const communicationManifest: ModuleManifest = {
  key: "communication",
  name: "Communication",
  version: "1.0.0",

  runtime: { mode: "embedded", required: false },

  database: {
    kind: "owned",
    key: "communicationdb",
    connect: async () => {
      const { getCommunicationDb } = await import("./connection");
      return getCommunicationDb();
    },
    ownedTables: [
      "communication_conversations",
      "communication_messages",
      "communication_meetings",
      "communication_participants",
      "communication_notifications",
    ],
  },

  router: communicationRouter,
  routerKey: "communication",

  permissions: {
    keys: [
      "communication.read",
      "communication.write",
      "communication.admin",
    ],
  },

  governanceActions: [
    {
      key: "communication.conversation.create",
      description: "Create a Communication conversation",
      risk: "low",
      receiptRequired: false,
    },
    {
      key: "communication.conversation.delete",
      description: "Delete a Communication conversation",
      risk: "medium",
      receiptRequired: true,
    },
    {
      key: "communication.message.add",
      description: "Add a message to a Communication conversation",
      risk: "low",
      receiptRequired: false,
    },
    {
      key: "communication.message.delete",
      description: "Delete a Communication message",
      risk: "medium",
      receiptRequired: true,
    },
    {
      key: "communication.chat.send",
      description: "Send a chat message through a provider",
      risk: "low",
      receiptRequired: false,
    },
    {
      key: "communication.meeting.create",
      description: "Schedule a Communication meeting",
      risk: "low",
      receiptRequired: false,
    },
    {
      key: "communication.meeting.cancel",
      description: "Cancel a scheduled Communication meeting",
      risk: "medium",
      receiptRequired: true,
    },
    {
      key: "communication.notification.create",
      description: "Create a Communication notification",
      risk: "low",
      receiptRequired: false,
    },
    {
      key: "communication.export",
      description: "Export communication records",
      risk: "high",
      receiptRequired: true,
    },
  ],

  routes: [
    { path: "/communication", label: "Communication" },
    { path: "/communication/chat", label: "Chat" },
    { path: "/communication/conversations", label: "Conversations" },
    { path: "/communication/video-meeting", label: "Video Meeting" },
    { path: "/communication/notifications", label: "Notifications" },
  ],
  navigation: [
    { group: "communication", label: "Communication", order: 5 },
  ],

  boot: async (ctx) => {
    registerModuleHealthAction(communicationManifest);

    try {
      const { seedCommunicationDb } = await import("./seed");
      const result = await seedCommunicationDb();
      if (result.seeded) {
        ctx.log("info", "communicationdb tables ensured");
      } else {
        ctx.log("warn", `seed skipped — ${result.reason ?? "unknown"}`);
      }
    } catch (err: any) {
      ctx.log("warn", `seed skipped — ${err?.message ?? err}`);
    }

    // ── Public API: conversations ──────────────────────────────────
    registerPublicApi({
      module: "communication",
      action: "communication.conversation.create",
      handler: async (input) => {
        const payload = input as {
          workspaceId?: number;
          title?: string;
          ownerUserId?: number;
          conversationType?:
            | "human"
            | "agent"
            | "system"
            | "support"
            | "meeting";
          sourceModule?: string;
          sourceRefId?: number;
          metadata?: Record<string, unknown>;
          actorId?: number;
        };
        if (typeof payload?.workspaceId !== "number" || !payload?.title) {
          throw new Error("workspaceId and title are required");
        }
        const { createConversation } = await import("./communication.service");
        const { actorId, ...rest } = payload;
        return createConversation(
          rest as Parameters<typeof createConversation>[0],
          actorId,
        );
      },
      descriptor: {
        key: "communication.conversation.create",
        description: "Create a Communication conversation",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "communication",
      action: "communication.conversations.list",
      handler: async (input) => {
        const payload = input as {
          workspaceId?: number;
          ownerUserId?: number;
          status?: string;
          conversationType?: string;
          limit?: number;
          offset?: number;
        };
        if (typeof payload?.workspaceId !== "number") {
          throw new Error("workspaceId is required");
        }
        const { listConversations } = await import("./communication.service");
        return listConversations(payload as Parameters<typeof listConversations>[0]);
      },
    });

    registerPublicApi({
      module: "communication",
      action: "communication.conversations.get",
      handler: async (input) => {
        const payload = input as { id?: number };
        if (typeof payload?.id !== "number") {
          throw new Error("id is required");
        }
        const { getConversation } = await import("./communication.service");
        return getConversation(payload.id);
      },
    });

    // ── Public API: messages ───────────────────────────────────────
    registerPublicApi({
      module: "communication",
      action: "communication.message.add",
      handler: async (input) => {
        const payload = input as {
          conversationId?: number;
          role?: "user" | "assistant" | "system" | "agent" | "bot";
          content?: string;
          contentType?: "text" | "markdown" | "json";
          senderUserId?: number;
          metadata?: Record<string, unknown>;
          actorId?: number;
        };
        if (
          typeof payload?.conversationId !== "number" ||
          !payload?.role ||
          !payload?.content
        ) {
          throw new Error("conversationId, role, content are required");
        }
        const { addMessage } = await import("./communication.service");
        const { actorId, ...rest } = payload;
        return addMessage(rest as Parameters<typeof addMessage>[0], actorId);
      },
      descriptor: {
        key: "communication.message.add",
        description: "Add a message to a Communication conversation",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "communication",
      action: "communication.messages.list",
      handler: async (input) => {
        const payload = input as {
          conversationId?: number;
          limit?: number;
          offset?: number;
        };
        if (typeof payload?.conversationId !== "number") {
          throw new Error("conversationId is required");
        }
        const { listMessages } = await import("./communication.service");
        return listMessages(payload.conversationId, payload.limit, payload.offset);
      },
    });

    // ── Public API: chat ───────────────────────────────────────────
    registerPublicApi({
      module: "communication",
      action: "communication.chat.send",
      handler: async (input) => {
        const payload = input as {
          workspaceId?: number;
          providerId?: number;
          messages?: Array<{
            role: "system" | "user" | "assistant";
            content: string;
          }>;
          conversationId?: number;
          conversationTitle?: string;
          temperature?: number;
          maxTokens?: number;
          actorId?: number;
        };
        if (
          typeof payload?.workspaceId !== "number" ||
          typeof payload?.providerId !== "number" ||
          !Array.isArray(payload?.messages) ||
          payload.messages.length === 0
        ) {
          throw new Error(
            "workspaceId, providerId, and a non-empty messages array are required",
          );
        }
        const { chatSendMessage } = await import("./communication.service");
        const { actorId, ...rest } = payload;
        return chatSendMessage(
          rest as Parameters<typeof chatSendMessage>[0],
          actorId,
        );
      },
      descriptor: {
        key: "communication.chat.send",
        description: "Send a chat message through a provider",
        risk: "low",
        receiptRequired: false,
      },
    });

    // ── Public API: meetings ───────────────────────────────────────
    registerPublicApi({
      module: "communication",
      action: "communication.meeting.create",
      handler: async (input) => {
        const payload = input as {
          workspaceId?: number;
          title?: string;
          meetingType?: "video" | "audio" | "text" | "hybrid";
          startTime?: string | Date;
          endTime?: string | Date;
          meetingUrl?: string;
          createdBy?: number;
          metadata?: Record<string, unknown>;
          actorId?: number;
        };
        if (
          typeof payload?.workspaceId !== "number" ||
          !payload?.title ||
          typeof payload?.createdBy !== "number"
        ) {
          throw new Error(
            "workspaceId, title, createdBy are required",
          );
        }
        const { createMeeting } = await import("./communication.service");
        const { actorId, ...rest } = payload;
        return createMeeting(
          {
            ...rest,
            startTime: rest.startTime ? new Date(rest.startTime) : undefined,
            endTime: rest.endTime ? new Date(rest.endTime) : undefined,
          } as Parameters<typeof createMeeting>[0],
          actorId,
        );
      },
      descriptor: {
        key: "communication.meeting.create",
        description: "Schedule a Communication meeting",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "communication",
      action: "communication.meetings.list",
      handler: async (input) => {
        const payload = input as {
          workspaceId?: number;
          status?: string;
          limit?: number;
          offset?: number;
        };
        if (typeof payload?.workspaceId !== "number") {
          throw new Error("workspaceId is required");
        }
        const { listMeetings } = await import("./communication.service");
        return listMeetings(payload as Parameters<typeof listMeetings>[0]);
      },
    });

    // ── Public API: notifications ──────────────────────────────────
    registerPublicApi({
      module: "communication",
      action: "communication.notification.create",
      handler: async (input) => {
        const payload = input as {
          workspaceId?: number;
          userId?: number;
          eventType?: string;
          title?: string;
          body?: string;
          sourceModule?: string;
          metadata?: Record<string, unknown>;
          actorId?: number;
        };
        if (
          typeof payload?.workspaceId !== "number" ||
          typeof payload?.userId !== "number" ||
          !payload?.eventType ||
          !payload?.title
        ) {
          throw new Error(
            "workspaceId, userId, eventType, title are required",
          );
        }
        const { createNotification } = await import("./communication.service");
        const { actorId, ...rest } = payload;
        return createNotification(
          rest as Parameters<typeof createNotification>[0],
          actorId,
        );
      },
      descriptor: {
        key: "communication.notification.create",
        description: "Create a Communication notification",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "communication",
      action: "communication.notifications.list",
      handler: async (input) => {
        const payload = input as {
          workspaceId?: number;
          userId?: number;
          status?: string;
          limit?: number;
          offset?: number;
        };
        if (typeof payload?.workspaceId !== "number") {
          throw new Error("workspaceId is required");
        }
        const { listNotifications } = await import("./communication.service");
        return listNotifications(
          payload as Parameters<typeof listNotifications>[0],
        );
      },
    });

    // ── Public API: governed sensitive writes ──────────────────────
    // Same business path as the tRPC governedProcedure — exposed
    // here so cross-module callers can route via Module Gateway and
    // pass a receipt. Receipt enforcement is handled by the gateway
    // dispatcher when descriptor.receiptRequired is true.
    registerPublicApi({
      module: "communication",
      action: "communication.conversation.delete",
      handler: async (input) => {
        const payload = input as { id?: number; actorId?: number };
        if (typeof payload?.id !== "number") {
          throw new Error("id is required");
        }
        const { deleteConversation } = await import("./communication.service");
        return deleteConversation(payload.id, payload.actorId);
      },
      descriptor: {
        key: "communication.conversation.delete",
        description: "Delete a Communication conversation",
        risk: "medium",
        receiptRequired: true,
      },
    });

    registerPublicApi({
      module: "communication",
      action: "communication.message.delete",
      handler: async (input) => {
        const payload = input as { id?: number; actorId?: number };
        if (typeof payload?.id !== "number") {
          throw new Error("id is required");
        }
        const { deleteMessage } = await import("./communication.service");
        return deleteMessage(payload.id, payload.actorId);
      },
      descriptor: {
        key: "communication.message.delete",
        description: "Delete a Communication message",
        risk: "medium",
        receiptRequired: true,
      },
    });

    registerPublicApi({
      module: "communication",
      action: "communication.meeting.cancel",
      handler: async (input) => {
        const payload = input as {
          id?: number;
          reason?: string;
          actorId?: number;
        };
        if (typeof payload?.id !== "number") {
          throw new Error("id is required");
        }
        const { cancelMeeting } = await import("./communication.service");
        return cancelMeeting(payload.id, payload.actorId, payload.reason);
      },
      descriptor: {
        key: "communication.meeting.cancel",
        description: "Cancel a scheduled Communication meeting",
        risk: "medium",
        receiptRequired: true,
      },
    });

    registerPublicApi({
      module: "communication",
      action: "communication.export",
      handler: async (input) => {
        // Export is a high-risk governance-gated read. The
        // implementation returns the requested workspace's
        // conversations + messages snapshot via the service.
        const payload = input as {
          workspaceId?: number;
          actorId?: number;
        };
        if (typeof payload?.workspaceId !== "number") {
          throw new Error("workspaceId is required");
        }
        const { listConversations, getSummary } = await import(
          "./communication.service"
        );
        const [conversations, summary] = await Promise.all([
          listConversations({ workspaceId: payload.workspaceId, limit: 200 }),
          getSummary(payload.workspaceId),
        ]);
        return {
          workspaceId: payload.workspaceId,
          summary,
          conversations,
          exportedAt: new Date().toISOString(),
        };
      },
      descriptor: {
        key: "communication.export",
        description: "Export communication records",
        risk: "high",
        receiptRequired: true,
      },
    });

    // ── Public API: health ─────────────────────────────────────────
    registerPublicApi({
      module: "communication",
      action: "communication.health",
      handler: async () => {
        const { communicationHealth } = await import("./communication.health");
        return communicationHealth();
      },
    });

    // ── Handoff acceptors ──────────────────────────────────────────
    // Literal type strings used so check:wiring:handoff verifies
    // them statically; constants live in handoffs.ts.
    registerHandoffAcceptor(
      "communication",
      "communication.conversation.open",
      async (handoff) => {
        const payload = handoff.payload as {
          workspaceId?: number;
          title?: string;
          ownerUserId?: number;
          conversationType?:
            | "human"
            | "agent"
            | "system"
            | "support"
            | "meeting";
          sourceModule?: string;
          sourceRefId?: number;
          metadata?: Record<string, unknown>;
        };
        if (typeof payload?.workspaceId !== "number" || !payload?.title) {
          return {
            accepted: false,
            reason: "workspaceId and title are required",
          };
        }
        try {
          const { createConversation } = await import("./communication.service");
          await createConversation(
            payload as Parameters<typeof createConversation>[0],
            payload.ownerUserId,
          );
          return { accepted: true };
        } catch (err: any) {
          ctx.log(
            "warn",
            `communication.conversation.open handoff failed: ${err?.message ?? err}`,
          );
          return { accepted: false, reason: err?.message ?? "internal error" };
        }
      },
    );

    registerHandoffAcceptor(
      "communication",
      "communication.meeting.schedule",
      async (handoff) => {
        const payload = handoff.payload as {
          workspaceId?: number;
          title?: string;
          meetingType?: "video" | "audio" | "text" | "hybrid";
          startTime?: string | Date;
          createdBy?: number;
          metadata?: Record<string, unknown>;
        };
        if (
          typeof payload?.workspaceId !== "number" ||
          !payload?.title ||
          typeof payload?.createdBy !== "number"
        ) {
          return {
            accepted: false,
            reason: "workspaceId, title, createdBy are required",
          };
        }
        try {
          const { createMeeting } = await import("./communication.service");
          await createMeeting(
            {
              workspaceId: payload.workspaceId,
              title: payload.title,
              meetingType: payload.meetingType,
              startTime: payload.startTime ? new Date(payload.startTime) : undefined,
              createdBy: payload.createdBy,
              metadata: payload.metadata,
            },
            payload.createdBy,
          );
          return { accepted: true };
        } catch (err: any) {
          ctx.log(
            "warn",
            `communication.meeting.schedule handoff failed: ${err?.message ?? err}`,
          );
          return { accepted: false, reason: err?.message ?? "internal error" };
        }
      },
    );

    registerHandoffAcceptor(
      "communication",
      "communication.notification.create",
      async (handoff) => {
        const payload = handoff.payload as {
          workspaceId?: number;
          userId?: number;
          eventType?: string;
          title?: string;
          body?: string;
          sourceModule?: string;
          metadata?: Record<string, unknown>;
        };
        if (
          typeof payload?.workspaceId !== "number" ||
          typeof payload?.userId !== "number" ||
          !payload?.eventType ||
          !payload?.title
        ) {
          return {
            accepted: false,
            reason: "workspaceId, userId, eventType, title are required",
          };
        }
        try {
          const { createNotification } = await import(
            "./communication.service"
          );
          await createNotification(
            payload as Parameters<typeof createNotification>[0],
            payload.userId,
          );
          return { accepted: true };
        } catch (err: any) {
          ctx.log(
            "warn",
            `communication.notification.create handoff failed: ${err?.message ?? err}`,
          );
          return { accepted: false, reason: err?.message ?? "internal error" };
        }
      },
    );
  },

  health: communicationHealth,

  publicApi: { path: "server/communication/public-api.ts" },
  events: {
    emits: [
      "communication.conversation.created",
      "communication.conversation.archived",
      "communication.conversation.deleted",
      "communication.message.sent",
      "communication.meeting.scheduled",
      "communication.meeting.cancelled",
      "communication.notification.created",
      "communication.notification.read",
    ],
  },
  handoffs: {
    accepts: [
      "communication.conversation.open",
      "communication.meeting.schedule",
      "communication.notification.create",
    ],
    produces: [],
  },
  ports: {
    provided: ["communication.read", "communication.notifications"],
    consumed: [],
  },
  communication: { modes: ["gateway", "handoff", "event"] },
};
