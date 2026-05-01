# Module Wiring Report

Generated: 2026-05-01T18:03:23.685Z

## Totals

- Modules tracked: **13**
- Fully wired: **0**
- Declared-only: **13**
- Blockers: **0**
- Follow-ups: **13**

## Per-module status

| Module | Manifest | Router | Runtime | DB | PublicAPI | Events | Handoffs | Routes | Gov | HQ |
|---|---|---|---|---|---|---|---|---|---|---|
| prm | ✓ | ✓ | WIRED | WIRED | DECL | WIRED | n/a | WIRED | WIRED | WIRED |
| psm | ✓ | ✓ | WIRED | WIRED | DECL | WIRED | n/a | WIRED | WIRED | WIRED |
| codeStudio | ✓ | ✓ | WIRED | WIRED | DECL | WIRED | WIRED | WIRED | WIRED | WIRED |
| agentStudio | ✓ | ✓ | WIRED | WIRED | DECL | WIRED | WIRED | WIRED | WIRED | WIRED |
| sandboxWf | ✓ | ✓ | WIRED | WIRED | DECL | WIRED | WIRED | WIRED | WIRED | WIRED |
| rag | ✓ | ✗ | WIRED | WIRED | DECL | WIRED | n/a | n/a | WIRED | WIRED |
| openRouter | ✓ | ✓ | WIRED | WIRED | DECL | WIRED | n/a | WIRED | WIRED | WIRED |
| ps | ✓ | ✓ | WIRED | WIRED | DECL | WIRED | WIRED | WIRED | WIRED | WIRED |
| hr | ✓ | ✓ | WIRED | WIRED | DECL | WIRED | n/a | WIRED | WIRED | WIRED |
| organizationManagement | ✓ | ✓ | WIRED | WIRED | DECL | WIRED | n/a | WIRED | WIRED | WIRED |
| cultureValues | ✓ | ✓ | WIRED | WIRED | DECL | WIRED | n/a | WIRED | WIRED | WIRED |
| aiTypes | ✓ | ✓ | WIRED | WIRED | DECL | WIRED | n/a | WIRED | WIRED | WIRED |
| kgraAgent | ✓ | ✓ | WIRED | WIRED | DECL | WIRED | n/a | WIRED | WIRED | WIRED |

## Findings

### FOLLOW-UP
- **prm** [publicApi] — 2 public API action(s) declared without registerPublicApi() at boot: prm.method.publish, prm.method.deprecate _(hint: Add registerPublicApi calls in module boot())_
- **psm** [publicApi] — 1 public API action(s) declared without registerPublicApi() at boot: psm.method.publish _(hint: Add registerPublicApi calls in module boot())_
- **codeStudio** [publicApi] — 2 public API action(s) declared without registerPublicApi() at boot: codeStudio.template.publish, codeStudio.run.execute _(hint: Add registerPublicApi calls in module boot())_
- **agentStudio** [publicApi] — 2 public API action(s) declared without registerPublicApi() at boot: agentStudio.agent.publish, agentStudio.run.execute _(hint: Add registerPublicApi calls in module boot())_
- **sandboxWf** [publicApi] — 2 public API action(s) declared without registerPublicApi() at boot: sandboxWf.workflow.publish, sandboxWf.execute _(hint: Add registerPublicApi calls in module boot())_
- **rag** [publicApi] — 1 public API action(s) declared without registerPublicApi() at boot: rag.index.run _(hint: Add registerPublicApi calls in module boot())_
- **openRouter** [publicApi] — 1 public API action(s) declared without registerPublicApi() at boot: openRouter.config.update _(hint: Add registerPublicApi calls in module boot())_
- **ps** [publicApi] — 2 public API action(s) declared without registerPublicApi() at boot: ps.ideation.publish, ps.handoff.pmCentral _(hint: Add registerPublicApi calls in module boot())_
- **hr** [publicApi] — 1 public API action(s) declared without registerPublicApi() at boot: hr.employee.create _(hint: Add registerPublicApi calls in module boot())_
- **organizationManagement** [publicApi] — 2 public API action(s) declared without registerPublicApi() at boot: om.entity.create, om.position.assign _(hint: Add registerPublicApi calls in module boot())_
- **cultureValues** [publicApi] — 1 public API action(s) declared without registerPublicApi() at boot: cv.value.publish _(hint: Add registerPublicApi calls in module boot())_
- **aiTypes** [publicApi] — 1 public API action(s) declared without registerPublicApi() at boot: aiTypes.catalog.publish _(hint: Add registerPublicApi calls in module boot())_
- **kgraAgent** [publicApi] — 1 public API action(s) declared without registerPublicApi() at boot: kgra.run.execute _(hint: Add registerPublicApi calls in module boot())_
