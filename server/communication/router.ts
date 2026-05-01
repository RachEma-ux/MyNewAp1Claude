/**
 * Communication — tRPC Router
 *
 * Mounted at `appRouter.communication` via the manifest. All
 * mutations are governed; all reads protected. Persistence goes
 * through the Communication service (CommunicationDB only).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  router,
  protectedProcedure,
  governedProcedure,
} from "../_core/trpc";
import * as svc from "./communication.service";
import {
  CommunicationConversationTypeSchema,
  CommunicationMessageRoleSchema,
  CommunicationMessageContentTypeSchema,
  CommunicationMeetingTypeSchema,
  CommunicationParticipantRoleSchema,
} from "./contracts";
import { communicationHealth } from "./communication.health";

function wrap<T>(p: Promise<T>): Promise<T> {
  return p.catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not connected/i.test(msg)) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "CommunicationDB unavailable",
      });
    }
    if (/not found/i.test(msg)) {
      throw new TRPCError({ code: "NOT_FOUND", message: msg });
    }
    if (/invalid .* transition/i.test(msg)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: msg });
    }
    throw err;
  });
}

// ── Sub-router: dashboard ───────────────────────────────────────────────────

const dashboardRouter = router({
  health: protectedProcedure.query(() => communicationHealth()),
  summary: protectedProcedure
    .input(z.object({ workspaceId: z.number().int().positive() }))
    .query(({ input }) => wrap(svc.getSummary(input.workspaceId))),
});

// ── Sub-router: conversations ───────────────────────────────────────────────

const conversationsSubRouter = router({
  create: governedProcedure
    .input(
      z.object({
        workspaceId: z.number().int().positive(),
        title: z.string().min(1).max(500),
        conversationType: CommunicationConversationTypeSchema.optional(),
        sourceModule: z.string().max(50).optional(),
        sourceRefId: z.number().int().positive().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(({ input, ctx }) =>
      wrap(svc.createConversation(input, ctx.user.id)),
    ),

  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.number().int().positive(),
        ownerUserId: z.number().int().positive().optional(),
        status: z.string().optional(),
        conversationType: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .query(({ input }) => wrap(svc.listConversations(input))),

  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ input }) => wrap(svc.getConversation(input.id))),

  archive: governedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input, ctx }) =>
      wrap(svc.archiveConversation(input.id, ctx.user.id)),
    ),

  delete: governedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input, ctx }) =>
      wrap(svc.deleteConversation(input.id, ctx.user.id)),
    ),

  rename: governedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        title: z.string().min(1).max(500),
      }),
    )
    .mutation(({ input, ctx }) =>
      wrap(svc.renameConversation(input.id, input.title, ctx.user.id)),
    ),
});

// ── Sub-router: messages ────────────────────────────────────────────────────

const messagesSubRouter = router({
  add: governedProcedure
    .input(
      z.object({
        conversationId: z.number().int().positive(),
        role: CommunicationMessageRoleSchema,
        content: z.string().min(1),
        contentType: CommunicationMessageContentTypeSchema.optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(({ input, ctx }) => wrap(svc.addMessage(input, ctx.user.id))),

  listByConversation: protectedProcedure
    .input(
      z.object({
        conversationId: z.number().int().positive(),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .query(({ input }) =>
      wrap(svc.listMessages(input.conversationId, input.limit, input.offset)),
    ),

  delete: governedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        workspaceId: z.number().int().positive().optional(),
      }),
    )
    .mutation(({ input, ctx }) =>
      wrap(svc.deleteMessage(input.id, ctx.user.id, input.workspaceId)),
    ),
});

// ── Sub-router: chat ────────────────────────────────────────────────────────

const chatSubRouter = router({
  sendMessage: governedProcedure
    .input(
      z.object({
        workspaceId: z.number().int().positive(),
        providerId: z.number().int().positive(),
        messages: z
          .array(
            z.object({
              role: z.enum(["system", "user", "assistant"]),
              content: z.string().min(1),
            }),
          )
          .min(1),
        conversationId: z.number().int().positive().optional(),
        conversationTitle: z.string().min(1).max(500).optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().int().min(1).max(128_000).optional(),
      }),
    )
    .mutation(({ input, ctx }) => wrap(svc.chatSendMessage(input, ctx.user.id))),
});

// ── Sub-router: meetings ────────────────────────────────────────────────────

const meetingsSubRouter = router({
  create: governedProcedure
    .input(
      z.object({
        workspaceId: z.number().int().positive(),
        title: z.string().min(1).max(500),
        meetingType: CommunicationMeetingTypeSchema.optional(),
        startTime: z.coerce.date().optional(),
        endTime: z.coerce.date().optional(),
        meetingUrl: z.string().max(1000).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(({ input, ctx }) =>
      wrap(svc.createMeeting({ ...input, createdBy: ctx.user.id }, ctx.user.id)),
    ),

  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.number().int().positive(),
        status: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .query(({ input }) => wrap(svc.listMeetings(input))),

  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ input }) => wrap(svc.getMeeting(input.id))),

  cancel: governedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        reason: z.string().optional(),
      }),
    )
    .mutation(({ input, ctx }) =>
      wrap(svc.cancelMeeting(input.id, ctx.user.id, input.reason)),
    ),

  complete: governedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input, ctx }) =>
      wrap(svc.completeMeeting(input.id, ctx.user.id)),
    ),
});

// ── Sub-router: participants ────────────────────────────────────────────────

const participantsSubRouter = router({
  add: governedProcedure
    .input(
      z.object({
        conversationId: z.number().int().positive().optional(),
        meetingId: z.number().int().positive().optional(),
        userId: z.number().int().positive().optional(),
        externalLabel: z.string().max(200).optional(),
        participantRole: CommunicationParticipantRoleSchema.optional(),
      }),
    )
    .mutation(({ input }) => wrap(svc.addParticipant(input))),

  remove: governedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) => wrap(svc.removeParticipant(input.id))),

  list: protectedProcedure
    .input(
      z.object({
        conversationId: z.number().int().positive().optional(),
        meetingId: z.number().int().positive().optional(),
      }),
    )
    .query(({ input }) => wrap(svc.listParticipants(input))),
});

// ── Sub-router: notifications ───────────────────────────────────────────────

const notificationsSubRouter = router({
  create: governedProcedure
    .input(
      z.object({
        workspaceId: z.number().int().positive(),
        userId: z.number().int().positive(),
        sourceModule: z.string().max(50).optional(),
        eventType: z.string().min(1).max(100),
        title: z.string().min(1).max(500),
        body: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(({ input, ctx }) =>
      wrap(svc.createNotification(input, ctx.user.id)),
    ),

  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.number().int().positive(),
        userId: z.number().int().positive().optional(),
        status: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .query(({ input }) => wrap(svc.listNotifications(input))),

  markRead: governedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input, ctx }) =>
      wrap(svc.markNotificationRead(input.id, ctx.user.id)),
    ),

  archive: governedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) => wrap(svc.archiveNotification(input.id))),
});

// ── Top-level router ────────────────────────────────────────────────────────

export const communicationRouter = router({
  dashboard: dashboardRouter,
  conversations: conversationsSubRouter,
  messages: messagesSubRouter,
  chat: chatSubRouter,
  meetings: meetingsSubRouter,
  participants: participantsSubRouter,
  notifications: notificationsSubRouter,
});

export type CommunicationRouter = typeof communicationRouter;
