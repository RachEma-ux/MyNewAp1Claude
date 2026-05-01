# Module Wiring Report

Generated: 2026-05-01T15:49:46.027Z

## Totals

- Modules tracked: **13**
- Fully wired: **0**
- Declared-only: **13**
- Blockers: **0**
- Follow-ups: **29**

## Per-module status

| Module | Manifest | Router | Runtime | DB | PublicAPI | Events | Handoffs | Routes | Gov | HQ |
|---|---|---|---|---|---|---|---|---|---|---|
| prm | ✓ | ✓ | WIRED | WIRED | DECL | WIRED | n/a | DECL | WIRED | WIRED |
| psm | ✓ | ✓ | WIRED | WIRED | DECL | WIRED | n/a | DECL | WIRED | WIRED |
| codeStudio | ✓ | ✓ | WIRED | WIRED | DECL | WIRED | DECL | DECL | WIRED | WIRED |
| agentStudio | ✓ | ✓ | WIRED | WIRED | DECL | WIRED | DECL | DECL | WIRED | WIRED |
| sandboxWf | ✓ | ✓ | WIRED | WIRED | DECL | WIRED | DECL | DECL | WIRED | WIRED |
| rag | ✓ | ✗ | WIRED | WIRED | DECL | DECL | n/a | n/a | WIRED | WIRED |
| openRouter | ✓ | ✓ | WIRED | WIRED | DECL | WIRED | n/a | DECL | WIRED | WIRED |
| ps | ✓ | ✓ | WIRED | WIRED | DECL | WIRED | WIRED | DECL | WIRED | WIRED |
| hr | ✓ | ✓ | WIRED | WIRED | DECL | WIRED | n/a | DECL | WIRED | WIRED |
| organizationManagement | ✓ | ✓ | WIRED | WIRED | DECL | WIRED | n/a | DECL | WIRED | WIRED |
| cultureValues | ✓ | ✓ | WIRED | WIRED | DECL | WIRED | n/a | DECL | WIRED | WIRED |
| aiTypes | ✓ | ✓ | WIRED | WIRED | DECL | WIRED | n/a | DECL | WIRED | WIRED |
| kgraAgent | ✓ | ✓ | WIRED | WIRED | DECL | WIRED | n/a | DECL | WIRED | WIRED |

## Findings

### FOLLOW-UP
- **prm** [publicApi] — 2 public API action(s) declared without registerPublicApi() at boot: prm.method.publish, prm.method.deprecate _(hint: Add registerPublicApi calls in module boot())_
- **prm** [route] — 1 route(s) declared without client manifest _(hint: Add client/src/modules/<folder>/manifest.ts and registerClientModule())_
- **psm** [publicApi] — 1 public API action(s) declared without registerPublicApi() at boot: psm.method.publish _(hint: Add registerPublicApi calls in module boot())_
- **psm** [route] — 1 route(s) declared without client manifest _(hint: Add client/src/modules/<folder>/manifest.ts and registerClientModule())_
- **codeStudio** [publicApi] — 2 public API action(s) declared without registerPublicApi() at boot: codeStudio.template.publish, codeStudio.run.execute _(hint: Add registerPublicApi calls in module boot())_
- **codeStudio** [handoff] — 1 handoff acceptor(s) declared without registerHandoffAcceptor(): codeStudio.run.requested _(hint: Add registerHandoffAcceptor calls in module boot())_
- **codeStudio** [route] — 1 route(s) declared without client manifest _(hint: Add client/src/modules/<folder>/manifest.ts and registerClientModule())_
- **agentStudio** [publicApi] — 2 public API action(s) declared without registerPublicApi() at boot: agentStudio.agent.publish, agentStudio.run.execute _(hint: Add registerPublicApi calls in module boot())_
- **agentStudio** [handoff] — 1 handoff acceptor(s) declared without registerHandoffAcceptor(): agentStudio.run.requested _(hint: Add registerHandoffAcceptor calls in module boot())_
- **agentStudio** [route] — 1 route(s) declared without client manifest _(hint: Add client/src/modules/<folder>/manifest.ts and registerClientModule())_
- **sandboxWf** [publicApi] — 2 public API action(s) declared without registerPublicApi() at boot: sandboxWf.workflow.publish, sandboxWf.execute _(hint: Add registerPublicApi calls in module boot())_
- **sandboxWf** [handoff] — 1 handoff acceptor(s) declared without registerHandoffAcceptor(): sandboxWf.execute.requested _(hint: Add registerHandoffAcceptor calls in module boot())_
- **sandboxWf** [route] — 1 route(s) declared without client manifest _(hint: Add client/src/modules/<folder>/manifest.ts and registerClientModule())_
- **rag** [publicApi] — 1 public API action(s) declared without registerPublicApi() at boot: rag.index.run _(hint: Add registerPublicApi calls in module boot())_
- **rag** [event] — 1 event subscription(s) declared without subscribeEvent(): documents.uploaded _(hint: Add subscribeEvent calls in module boot())_
- **openRouter** [publicApi] — 1 public API action(s) declared without registerPublicApi() at boot: openRouter.config.update _(hint: Add registerPublicApi calls in module boot())_
- **openRouter** [route] — 1 route(s) declared without client manifest _(hint: Add client/src/modules/<folder>/manifest.ts and registerClientModule())_
- **ps** [publicApi] — 2 public API action(s) declared without registerPublicApi() at boot: ps.ideation.publish, ps.handoff.pmCentral _(hint: Add registerPublicApi calls in module boot())_
- **ps** [route] — 1 route(s) declared without client manifest _(hint: Add client/src/modules/<folder>/manifest.ts and registerClientModule())_
- **hr** [publicApi] — 1 public API action(s) declared without registerPublicApi() at boot: hr.employee.create _(hint: Add registerPublicApi calls in module boot())_
- **hr** [route] — 1 route(s) declared without client manifest _(hint: Add client/src/modules/<folder>/manifest.ts and registerClientModule())_
- **organizationManagement** [publicApi] — 2 public API action(s) declared without registerPublicApi() at boot: om.entity.create, om.position.assign _(hint: Add registerPublicApi calls in module boot())_
- **organizationManagement** [route] — 1 route(s) declared without client manifest _(hint: Add client/src/modules/<folder>/manifest.ts and registerClientModule())_
- **cultureValues** [publicApi] — 1 public API action(s) declared without registerPublicApi() at boot: cv.value.publish _(hint: Add registerPublicApi calls in module boot())_
- **cultureValues** [route] — 1 route(s) declared without client manifest _(hint: Add client/src/modules/<folder>/manifest.ts and registerClientModule())_
- **aiTypes** [publicApi] — 1 public API action(s) declared without registerPublicApi() at boot: aiTypes.catalog.publish _(hint: Add registerPublicApi calls in module boot())_
- **aiTypes** [route] — 1 route(s) declared without client manifest _(hint: Add client/src/modules/<folder>/manifest.ts and registerClientModule())_
- **kgraAgent** [publicApi] — 1 public API action(s) declared without registerPublicApi() at boot: kgra.run.execute _(hint: Add registerPublicApi calls in module boot())_
- **kgraAgent** [route] — 1 route(s) declared without client manifest _(hint: Add client/src/modules/<folder>/manifest.ts and registerClientModule())_
