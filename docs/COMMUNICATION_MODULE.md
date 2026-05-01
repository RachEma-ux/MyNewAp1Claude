# Communication Module

Top-level RTLM module that owns all chat, conversations, meeting records, and
in-app notifications. Replaces the old loose `server/chat/`,
`server/routers/conversations.ts`, and `server/routers/notifications.ts`
collection — they remain only as thin compatibility shims that delegate to
this module's service.

## Identity

| Field        | Value             |
|--------------|-------------------|
| `key`        | `communication`   |
| `name`       | Communication     |
| `routerKey`  | `communication`   |
| `runtime`    | `embedded`        |
| `database`   | `communicationdb` (owned) |
| `baseRoute`  | `/communication`  |

## Folder layout

```
server/communication/
  manifest.ts                 — ModuleManifest registered with the platform
  router.ts                   — tRPC router (mounted at appRouter.communication)
  public-api.ts               — re-exports for other modules
  contracts.ts                — Zod schemas + DTOs
  events.ts                   — emitted event constants + payload types
  handoffs.ts                 — accepted handoff constants + payload types
  ports.ts                    — provided port interfaces
  connection.ts               — getCommunicationDb()
  seed.ts                     — CREATE TABLE IF NOT EXISTS for the 5 tables
  communication.repository.ts — pure CommunicationDB queries
  communication.service.ts    — business logic + audit + event emission
  communication.validation.ts — lifecycle transition rules
  communication.health.ts     — health() implementation
  __tests__/                  — unit tests

client/src/modules/communication/
  manifest.ts                 — ClientModuleManifest (routes + nav)
  pages/                      — 5 pages
    CommunicationDashboardPage.tsx
    CommunicationChatPage.tsx
    CommunicationConversationsPage.tsx
    CommunicationVideoMeetingPage.tsx
    CommunicationNotificationsPage.tsx
  components/                 — 6 shared UI bits
    CommunicationSummaryCards.tsx
    ConversationList.tsx
    MessageThread.tsx
    ChatComposer.tsx
    MeetingList.tsx
    NotificationList.tsx

drizzle/tables/communicationdb.ts — Drizzle schema for the 5 tables
```

## Database

Dedicated DB `communicationdb`. Connected via
`getCommunicationDb()` (private to the module). Env var
`DATABASE_URL_COMMUNICATIONDB` overrides; the default replaces the DB name
in `DATABASE_URL` with `/communicationdb`.

Tables (all owned, all private to Communication):

| Table                         | Purpose                                  |
|-------------------------------|------------------------------------------|
| `communication_conversations` | Top-level conversation records           |
| `communication_messages`      | Messages inside a conversation           |
| `communication_meetings`      | Meeting records (record-of, not WebRTC)  |
| `communication_participants`  | Participants in a conversation/meeting   |
| `communication_notifications` | In-app notifications targeted at a user  |

## Public API (Module Gateway)

Other modules call these via `gatewayCall("communication.<action>", payload)`.
Implemented in `manifest.ts → boot()` via `registerPublicApi`.

| Action                                  | Risk    | Receipt |
|-----------------------------------------|---------|---------|
| `communication.conversation.create`     | low     | no      |
| `communication.conversations.list`      | low     | no      |
| `communication.conversations.get`       | low     | no      |
| `communication.message.add`             | low     | no      |
| `communication.messages.list`           | low     | no      |
| `communication.chat.send`               | low     | no      |
| `communication.meeting.create`          | low     | no      |
| `communication.meetings.list`           | low     | no      |
| `communication.notification.create`     | low     | no      |
| `communication.notifications.list`      | low     | no      |
| `communication.health`                  | low     | no      |

Sensitive write actions (`communication.conversation.delete`,
`communication.message.delete`, `communication.meeting.cancel`,
`communication.export`) are governance-listed in the manifest with
`receiptRequired: true` and exposed only via the tRPC router's
`governedProcedure` paths.

## Events emitted

Names live in `events.ts → COMMUNICATION_EVENTS`. All envelopes carry
`sourceModule: "communication"` and `workspaceId`.

| Event                                   | Payload (key fields)                         |
|-----------------------------------------|----------------------------------------------|
| `communication.conversation.created`    | conversationId, workspaceId, conversationType|
| `communication.conversation.archived`   | conversationId, workspaceId                  |
| `communication.conversation.deleted`    | conversationId, workspaceId                  |
| `communication.message.sent`            | messageId, conversationId, role, length      |
| `communication.meeting.scheduled`       | meetingId, workspaceId, meetingType          |
| `communication.meeting.cancelled`       | meetingId, workspaceId, reason?              |
| `communication.notification.created`    | notificationId, workspaceId, userId          |
| `communication.notification.read`       | notificationId, workspaceId, userId          |

## Handoffs accepted

Producers `submitHandoff({ targetModule: "communication", type: "<...>" })`.

| Type                                | Use                                          |
|-------------------------------------|----------------------------------------------|
| `communication.conversation.open`   | Another module asks Communication to own a thread (e.g. agent chat). |
| `communication.meeting.schedule`    | Schedule a meeting on the producer's behalf. |
| `communication.notification.create` | Push a user notification.                    |

## Ports provided

`ports.ts` declares `CommunicationReadPort` and
`CommunicationNotificationsPort` for in-process callers that need a typed
interface (no gateway round-trip).

## Frontend routes

| Path                            | Page                            |
|---------------------------------|---------------------------------|
| `/communication`                | CommunicationDashboardPage      |
| `/communication/chat`           | CommunicationChatPage           |
| `/communication/conversations`  | CommunicationConversationsPage  |
| `/communication/video-meeting`  | CommunicationVideoMeetingPage   |
| `/communication/notifications`  | CommunicationNotificationsPage  |

Legacy paths redirect to the canonical routes above:

- `/chat` → `/communication/chat`
- `/conversations` → `/communication/conversations`
- `/video-meeting` → `/communication/video-meeting`

## Compatibility shims (legacy routers)

Two routers stay registered so existing clients keep working:

- `appRouter.chat` (`server/chat/router.ts`) — `sendMessage`,
  `listConversations`, `deleteConversation`, `bulkDeleteConversations`,
  `sendMessageStream`, `saveConversation` all delegate to the Communication
  service. Provider-domain helpers (`getAvailableProviders`,
  `testProvider`) stay in place — they're not Communication-owned.
- `appRouter.conversations` (`server/routers/conversations.ts`) — delegates
  to Communication, mapping `agentId` → `conversationType="agent"` +
  `sourceModule="agents"` + `sourceRefId=agentId`. Returns the legacy
  `{id, workspaceId, userId, agentId, title}` shape so AgentChat /
  CatalogAgentChat keep working unchanged.

These shims do **not** write to any DB themselves — Communication is the
sole writer.

## Observability

- Hamburger menu: `Communication` group with Dashboard / Chat /
  Conversations / Video Meeting / Notifications.
- Digital HQ module page picks up the manifest automatically.
- Application Wiring Inventory (AWI) lists the module's routes, public
  APIs, events, handoffs, and ports.

## Out-of-scope follow-up

`server/agents/db.ts` still uses the legacy `conversations`/`messages`
tables for agent-domain internal use (separate from chat/conversations
ownership). Migrating that to a Communication-backed read is tracked as a
follow-up task — not part of this PR.
