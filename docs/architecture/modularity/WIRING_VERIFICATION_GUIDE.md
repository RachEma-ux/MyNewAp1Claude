# Wiring Verification Guide

This guide explains how to use, extend, and trust the modular wiring
verification harness shipped in PR #47/#48.

## What the harness verifies

A module is correctly wired only when **every lane that the manifest
declares is also registered at runtime**. The harness models the gap
between declaration and registration as a first-class status:

| Status            | Meaning                                              |
|-------------------|------------------------------------------------------|
| `wired`           | Declared in manifest AND registered at runtime       |
| `declared-only`   | Declared in manifest, no runtime registration found  |
| `missing`         | Required by another contract but no declaration      |
| `not-applicable`  | Module legitimately does not participate in this lane |

`declared-only` is treated as a **follow-up** (warning) by default.
This matches how PR #46 was intentionally shipped — manifests declare
the public APIs, events, and handoffs, while the corresponding
`registerPublicApi()` / `subscribeEvent()` / `registerHandoffAcceptor()`
calls land in subsequent passes.

## Severity model

| Severity     | Behavior                                         |
|--------------|--------------------------------------------------|
| `blocker`    | Harness exits non-zero. CI fails.                |
| `high`       | Harness exits non-zero. CI fails.                |
| `medium`     | Harness reports. CI passes.                      |
| `low`        | Harness reports. CI passes.                      |
| `follow-up`  | Reported with a hint. CI passes.                 |

Promote a `follow-up` to `high` once the platform owner has decided
the gap blocks merging. See `scripts/check-module-wiring.ts` for
where each finding is emitted.

## Scripts

| Script                                | Purpose                                   |
|---------------------------------------|-------------------------------------------|
| `pnpm check:wiring:module`            | Per-module manifest + registration audit  |
| `pnpm check:wiring:gateway`           | `registerPublicApi` registrations         |
| `pnpm check:wiring:event`             | Event envelope shape + subscriber wiring  |
| `pnpm check:wiring:handoff`           | Handoff types + acceptor wiring           |
| `pnpm check:wiring:frontend`          | Client manifests + nav consistency        |
| `pnpm check:wiring:runtime`           | Runtime modes + side-effect guards        |
| `pnpm check:wiring:coordinator`       | Coordinator boundary + step kinds         |
| `pnpm check:wiring`                   | All seven, sequential                     |
| `pnpm check:architecture:full`        | `check:architecture` + `check:wiring`     |

The umbrella `check:wiring` is intentionally sequential — each script
prints its own header so failures are easy to pinpoint.

## Inventory model

The shared inventory model lives at:

- `server/platform/modules/wiring-types.ts` — pure type definitions
- `server/platform/modules/wiring-inventory.ts` — static builder
- `server/platform/modules/wiring-report.ts` — markdown renderer

The builder is **side-effect-free**: it reads source files via
`readFileSync` rather than importing the manifest barrel. This means
wiring checks can run before the platform boots and never trigger
timers, DB connections, or worker threads.

If a test wants to upgrade `declared-only` → `wired` after exercising
runtime registration calls, it can call `mergeRuntimeFacts(...)`:

```ts
import { buildFullInventory, mergeRuntimeFacts } from "./wiring-inventory";

const inventory = buildFullInventory({ repoRoot: process.cwd() });
mergeRuntimeFacts(inventory, {
  registeredPublicApis: gatewayRegistrations(),
  registeredEventSubscriptions: busSubscriptions(),
  registeredHandoffAcceptors: handoffRegistrations(),
});
```

## How to add a new module correctly

1. Create `server/<folder>/manifest.ts` exporting `<key>Manifest`.
2. Add the manifest to `ALL_MANIFESTS` in
   `server/platform/modules/manifests.ts`.
3. Add an entry to `KNOWN_MODULES` in
   `server/platform/modules/wiring-inventory.ts` so the harness
   tracks it.
4. If the module has private code (repository / connection / db /
   service files), also add to `MODULE_MAP` in
   `scripts/lib/module-graph.ts` so the boundary checks police it.
5. Re-run `pnpm check:wiring` and address the new findings.

## How to wire public APIs

Inside the module's `boot()` hook:

```ts
import { registerPublicApi } from "@/server/platform/modules/module-gateway";
import { publishMethod } from "./contracts";

export const boot: ModuleHook = async () => {
  registerPublicApi({
    module: "prm",
    action: "prm.method.publish",
    handler: async (input, ctx) => publishMethod(input, ctx),
    descriptor: {
      key: "prm.method.publish",
      description: "Publish a PRM method",
      risk: "high",
      receiptRequired: true,
    },
  });
};
```

The descriptor must match the entry in `manifest.governanceActions[]`
(same `key`). The `check-gateway-wiring.ts` script will warn if the
declared `receiptRequired` does not propagate to the registration.

## How to wire events

Producing a module emits via `publishEvent` + `makeEnvelope`:

```ts
import { makeEnvelope, publishEvent } from "@/server/platform/events";

await publishEvent(
  makeEnvelope({
    eventType: "prm.method.published",
    sourceModule: "prm",
    payload: { methodId: 7 },
  }),
);
```

Consuming module subscribes inside `boot()`:

```ts
import { subscribeEvent } from "@/server/platform/events";

export const boot: ModuleHook = async () => {
  subscribeEvent("prm.method.published", "agentStudio", async (env) => {
    await refreshTemplateIndex(env.payload);
  });
};
```

Use the producer-supplied `idempotencyKey` when retrying logically
identical work — the bus will dedup downstream subscribers.

## How to wire handoffs

The receiving module registers an acceptor in its `boot()`:

```ts
import { registerHandoffAcceptor } from "@/server/platform/handoff";

registerHandoffAcceptor("pmCentral", "ps.pmCentral", async (h) => {
  await acceptIdeationFromPs(h);
  return { accepted: true };
});
```

The submitting module never writes the receiving module's DB. It
calls `submitHandoff()` and waits for the status to update.

## When to use coordinator

| Flow shape                                     | Use this              |
|------------------------------------------------|-----------------------|
| `PS → PM Central`                              | Handoff only          |
| `PS → PM Central → Code Studio`                | Coordinator           |
| `PS → PM Central → Governance → Digital HQ`   | Coordinator           |
| `Agent Studio → Code Studio → Governance`     | Coordinator           |
| `Document Upload → RAG/KGRA → Digital HQ`     | Coordinator           |
| Async notification only                        | Event                 |
| Module-local CRUD                              | Internal service only |

`check:wiring:coordinator` flags single-handoff "workflows" routed
through the coordinator as a `medium` finding — they should be
direct handoffs.

## Hardcoded routes / compatibility mode

`App.tsx` retains hardcoded `<Route>` entries from the pre-modular
era. The harness reports this as a `follow-up` until either:

1. `<ModuleRoutes />` is mounted to drive routes from the manifest
   registry, or
2. The legacy entries are migrated into per-module client manifests.

This is intentional. The harness exists to keep the gap visible.
