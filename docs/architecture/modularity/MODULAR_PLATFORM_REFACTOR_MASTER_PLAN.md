# Modular Platform Refactor — Master Plan

This document is the authoritative plan for the modular platform refactor of
`MyNewAp1Claude`. It supersedes any earlier scattered plans (`Phase2-Comparison.md`,
the WS workshop docs, and the legacy roadmap notes).

---

## Core principle

> Modules own. Coordinator coordinates. Governance controls. Digital HQ observes.

The coordinator is **not** a central owner and must never become a god module.

## Target architecture (one paragraph)

A monolithic platform core plus self-registering modules with private data
ownership and explicit cross-module communication lanes (port/adapter, gateway,
handoff, event, coordinator). Cross-module SQL, foreign DB connections, and
private-internal imports are forbidden and enforced at CI time. The coordinator
runs **real multi-module workflows only** — simple ownership transfers (e.g.
`PS → PM Central`) use handoff alone.

## Allowed cross-module communication lanes

| Lane            | Use case                                                                 |
|-----------------|--------------------------------------------------------------------------|
| Port / Adapter  | Fast synchronous internal calls through explicit interfaces.             |
| Module Gateway  | Governed synchronous cross-module commands.                              |
| Handoff         | One module asking another module to own a unit of work.                  |
| Event           | Async notifications and background workflows.                            |
| Coordinator     | Real multi-module workflows that need state, retry, or correlation.      |

Anything else is forbidden.

## Forbidden patterns

- Direct repository imports across modules.
- Cross-module SQL queries.
- Calling another module's private service.
- Writing to another module's DB.
- Importing another module's DB connection.
- Importing another module's private schema.
- Coordinator importing private module internals.
- Coordinator writing module databases.
- Coordinator owning module business logic.
- Ungoverned sensitive cross-module mutations.
- Global router/layout files manually hardcoding every module.

## Phase status

| Phase | Title                                          | Status      |
|-------|------------------------------------------------|-------------|
| 1     | Baseline audit                                 | Done        |
| 2     | Module manifest infrastructure                 | Done        |
| 3     | Module Registry                                | Done        |
| 4     | Router composition                             | Done        |
| 5     | Runtime Manager                                | Done        |
| 6     | DB ownership foundations                       | Done        |
| 7     | DB access enforcement scripts                  | Done        |
| 8     | Public/private contract pattern (pilot)        | Done (pilots) |
| 9     | Import boundary enforcement scripts            | Done        |
| 10    | Module Gateway                                 | Done        |
| 11    | Handoff Manager                                | Done        |
| 12    | Event Bus foundation                           | Done        |
| 13    | Coordinator upgrade                            | Done        |
| 14    | Governance integration                         | Done        |
| 15    | Frontend modularization                        | Done (foundation) |
| 16    | Digital HQ observability foundations           | Done (foundation) |
| 17    | Pilot module migrations                        | In progress |
| 18    | CI enforcement                                 | Done        |

See `MODULE_BOUNDARY_MAP.md`, `MODULE_RUNTIME_MAP.md`, `MODULE_DATABASE_OWNERSHIP.md`,
`CROSS_MODULE_COMMUNICATION_MAP.md`, `FORBIDDEN_ACCESS_AUDIT.md`,
`COORDINATOR_RULES.md`, `EVENT_PRIORITY_MODEL.md`, `MIGRATION_GUIDE.md` for the
detailed maps and procedures.
