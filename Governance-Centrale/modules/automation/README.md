# Automation — Module Governance

## Overview

Automation covers workflow builder, triggers, actions, and workflow executions.

## Governance Status: Minimal

- Workflow mutations use `protectedProcedure` (no `governedProcedure`)
- No dedicated governance overlay for automation
- Workflow execution has no freeze check or audit logging

## Runtime References

| File | Location | Reason |
|---|---|---|
| Automation server | `server/automation/` | Runtime workflow engine |
| Workflow routers | `server/routers/workflows.ts`, `triggers.ts` | Runtime tRPC routers |
| Workflow builder UI | `client/src/pages/AutomationPage.tsx` | Vite build tree |
