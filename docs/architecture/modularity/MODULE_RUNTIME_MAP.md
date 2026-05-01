# Module Runtime Map

Each module declares a **runtime mode** in its manifest:

- `shared` — runs inside the platform runtime, no boot/health/DB ownership.
- `embedded` — owns boot/health/DB but runs in the same process.
- `worker` — owns background jobs, schedulers, queues, or long-running work.
- `external` — may run as a separate service or process (future).

| Module             | Runtime         | Reason                                                        |
|--------------------|-----------------|---------------------------------------------------------------|
| Auth / Identity    | platform-core   | Always part of the platform shell.                            |
| Workspace / RBAC   | platform-core   | Always part of the platform shell.                            |
| Governance Center  | platform-core   | Control plane.                                                |
| Module Registry    | platform-core   | Control plane.                                                |
| Runtime Manager    | platform-core   | Control plane.                                                |
| Module Gateway     | platform-core   | Control plane.                                                |
| Handoff Manager    | platform-core   | Control plane.                                                |
| Event Bus          | platform-core   | Control plane.                                                |
| Coordinator        | platform-core   | Control plane (worker-capable).                               |
| Digital HQ         | platform-core   | Read-model layer.                                             |
| Design System      | platform-core   | Frontend shell.                                               |
| API Gateway        | platform-core   | Router composer.                                              |
| AI Types           | shared          | Platform-wide catalog; not a module DB owner.                 |
| PRM                | embedded        | Owns prmdb + boot + health.                                   |
| PSM                | embedded        | Owns psmdb + boot + health.                                   |
| HR                 | shared          | Larger refactor pending → embedded (target).                  |
| PS                 | embedded        | Owns ps schema + ideation flow + boot.                        |
| PM Central         | embedded        | Owns pm schema + boot.                                        |
| OM                 | shared          | Will move to embedded with `omdb`.                            |
| CV                 | shared          | Will move to embedded with `cvdb`.                            |
| Code Studio        | worker          | OpenCode runtime + IDE proxy + jobs. External later.          |
| Agent Studio       | worker          | Agent lifecycle scheduler.                                    |
| Sandbox WF         | worker          | Workflow executor.                                            |
| RAG / KGRA         | worker          | Indexer + query engine. External later.                       |
| OpenRouter         | embedded        | Sync service. Worker later when pulls grow.                   |

## Boot order

Runtime Manager boots in this dependency order:

1. Platform core (DB, governance, providers, workspaces) — required.
2. AI Types (catalog) — required for catalog-aware modules.
3. Embedded modules (PRM, PSM, PS, PM Central, OpenRouter).
4. Workers (Sandbox WF, Agent Studio, Code Studio, RAG/KGRA).
5. `postListen` hooks (Agent Studio MCP self-attach, OpenCode key sync).

A failure in a non-required module marks it as **degraded** but never blocks
startup. A failure in platform core or a `required: true` module blocks startup.
