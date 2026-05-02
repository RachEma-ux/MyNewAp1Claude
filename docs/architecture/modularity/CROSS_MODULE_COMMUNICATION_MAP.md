# Cross-Module Communication Map

This document defines how modules talk to each other and which lane each
flow uses.

## Lanes

| Lane            | Sync? | Governance | Persistence | Use case                                                        |
|-----------------|-------|------------|-------------|-----------------------------------------------------------------|
| Port / Adapter  | yes   | none       | none        | Same-process explicit interface, fast, no network.              |
| Module Gateway  | yes   | optional   | audit       | Governed cross-module command (e.g. PRM tells AI Types to publish a method). |
| Handoff         | async | required   | yes         | One module asks another to own a unit of work.                  |
| Event           | async | optional   | outbox/inbox| Notification fan-out, eventual consistency.                     |
| Coordinator     | async | required   | yes         | Multi-module workflow with state, retry, correlation.           |

## Important rule

> Do **not** use the coordinator for every cross-module action.

Simple ownership transfer (e.g. `PS → PM Central`) uses **handoff only**.

Use the coordinator only when the flow becomes a real multi-module workflow:

- `PS → PM Central → Code Studio`
- `PS → PM Central → Governance → Digital HQ`
- `Agent Studio → Code Studio → Governance`
- `Document Upload → RAG/KGRA indexing → Digital HQ`

## Catalog (Communication Map)

| Source          | Target          | Lane         | Governance           | Notes                                                  |
|-----------------|-----------------|--------------|----------------------|--------------------------------------------------------|
| PS              | PM Central      | handoff      | required             | PS approves a project (`VALIDATED`), the PS pm-bridge submits `pmCentral.project.receiveFromPS` then converts via `pmCentral.handoffs.convertToProject`. PS performs no PMDB writes. |
| PS              | Coordinator     | coordinator  | required             | Only for multi-module flows after handoff is accepted. |
| PM Central      | Code Studio     | handoff      | required             | "Build this" handoff.                                  |
| Agent Studio    | Code Studio     | gateway      | required             | Run a coding skill on behalf of agent.                 |
| Agent Studio    | Sandbox WF      | gateway      | required             | Execute a workflow as part of an agent run.            |
| Sandbox WF      | Code Studio     | gateway      | required             | Workflow step calls a code action.                     |
| Document upload | RAG/KGRA        | event        | optional             | `documents.uploaded` → indexing.                       |
| RAG/KGRA        | Digital HQ      | event        | none                 | `kgra.index.completed` → observability.                |
| Governance      | All modules     | event        | n/a                  | `governance.freeze` (critical), `governance.policy.updated` (high). |
| All modules     | Digital HQ      | event        | none                 | health summaries, metrics (low/batched).               |
| OpenRouter      | Code Studio     | port         | none                 | Provider routing — a port the providers feature exposes. |
| AI Types        | All modules     | port         | none                 | `catalogPort.resolveBySource()` etc. via public API.   |
| Coordinator     | any module      | gateway/handoff/event | required for sensitive | Coordinator never imports module internals.            |
| Workspace/RBAC  | All modules     | port         | n/a                  | Auth context propagated, not pulled.                   |
| Agents (chat)   | Communication   | gateway      | none for `chat.send` | Agent-linked threads created via `communication.conversation.open` handoff with `sourceModule="agents"`, `sourceRefId=agentId`. |
| Any module      | Communication   | handoff      | none for `notification.create` | Send a user notification: `communication.notification.create` (also exposed via gateway). |
| Any module      | Communication   | handoff      | none for `meeting.schedule` | Schedule an external/embedded meeting: `communication.meeting.schedule`. |
| Communication   | All modules     | event        | none                 | `communication.message.sent`, `communication.notification.created`, `communication.conversation.*`, `communication.meeting.*` — fan-out to subscribers (HQ, agents, audit). |
| Any module      | PM Central      | gateway      | receipt for `pm.handoff.convert`, `pm.project.archive`, `pm.project.status.update`, `pm.plan.approve` | Create/update PM records exclusively through `pmCentral.*` gateway actions. Direct PMDB writes from non-PM modules are forbidden. |
| PM Central      | All modules     | event        | none                 | `pm.project.*`, `pm.task.*`, `pm.milestone.*`, `pm.handoff.*` etc. — fan-out to subscribers (HQ, governance, audit). |

## Forbidden flows

- Module → another module's repository file.
- Module → another module's `getXxxDb()` connection.
- Module → another module's Drizzle schema file.
- Coordinator → any module's repository / connection / schema / private service.
- Module → cross-module SQL (raw `JOIN` across two module DBs).

## Receipts

Sensitive cross-module mutations require a **governance receipt** attached to
the gateway/handoff/coordinator request. The receipt is verified by the receiving
module's gate. Coverage is enforced by `scripts/check-governance-actions.ts`.

## Worked examples

The canonical worked examples live in
`server/platform/coordinator/coordinator-examples.test.ts`. They cover:

1. A 3-module sync chain (`alpha → beta → gamma`) via `gateway-call` —
   the basic shape of a coordinator workflow.
2. Explicit compensation: a registered compensation handler runs as a
   normal step. Unregistered compensation steps fail loudly (A2 fix).
3. Pure event lane: when the producer doesn't need a result, publish an
   event instead of submitting a workflow.

Read these tests alongside this map — they're executable docs, not just
unit tests.

## Lane-selection cheat sheet

```
Need a result?              Yes → gateway (sync) or coordinator (async + state)
                            No  → event

Are you transferring        Yes → handoff
ownership of a unit
of work?                    No  → keep ownership; gateway / event / port

Multi-module flow with      Yes → coordinator
state and rollback?         No  → single handoff or gateway-call

Cross-module SQL JOIN?      Always forbidden — use port + read.
```
