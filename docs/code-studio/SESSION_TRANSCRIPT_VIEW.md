# Code Studio — Session Transcript View

## Overview

Session transcripts are now persisted and viewable in the UI. When a job uses
OpenCode, the orchestrator fetches all session messages after each phase and
persists them into `code_session_messages`.

## How Transcripts Are Persisted

1. Job executes phases via OpenCode session
2. After all phases complete (before marking job as `completed`), the orchestrator calls `persistSessionTranscript()`
3. This fetches all messages from OpenCode via `GET /session/:id/message`
4. Each message is normalized and stored in `code_session_messages` with:
   - `session_id` — link to the Code Studio session record
   - `opencode_message_id` — original OpenCode message ID
   - `role` — `user`, `assistant`, `system`, `tool`
   - `content_preview` — first 8000 chars of message text
   - `tool_calls` — JSON of any tool invocations

## Viewing Transcripts

In the Job Detail page, the Sessions tab now includes an expandable transcript
viewer for each session:

1. Click the message icon on any session card
2. The transcript panel expands inline showing all persisted messages
3. Messages are color-coded by role (assistant messages highlighted)
4. Timestamps shown where available

## API

```
codeStudio.sessions.messages({ sessionId: number, limit?: number })
```

Returns ordered list of `code_session_messages` for the given session.

## Limitations

- Transcripts are persisted once at job completion, not streamed in real-time
- Content is truncated to 8000 chars per message for storage efficiency
- Tool call details are stored as JSON but not rendered in detail in v1
