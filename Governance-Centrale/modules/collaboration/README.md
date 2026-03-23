# Collaboration — Module Governance

## Overview

Collaboration covers chat, conversations, and messaging features.

## Governance Status: Minimal

- Chat uses `protectedProcedure` for conversation management
- No governance overlay on chat mutations
- Chat streaming endpoint has no governance gate

## Runtime References

| File | Location | Reason |
|---|---|---|
| Chat server | `server/chat/` | Runtime chat streaming |
| Chat router | `server/routers/conversations.ts` | Runtime tRPC router |
