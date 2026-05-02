/**
 * Module Routers — type-preserving literal record.
 *
 * tRPC v11 infers the AppRouter type from the literal object passed to
 * `router({ ... })`. Spreading a `Record<string, AnyRouter>` would erase
 * per-key types and break client-side `trpc.<module>.<...>.useQuery`
 * inference. To stay manifest-aligned without regressing the client,
 * we expose this single literal record. Adding a module = one entry here.
 *
 * The companion `manifests.ts` provides the runtime/governance/health
 * metadata. Drift between the two is detected by `scripts/check-modules.ts`.
 */

import { prmRouter } from "../../prm/prm.router";
import { psmRouter } from "../../psm/psm.router";
import { codeStudioRouter } from "../../code-studio/api/router";
import { agentStudioRouter } from "../../agent-studio/api/router";
import { sandboxWfRouter } from "../../sandbox-wf/router";
import { openRouterRouter } from "../../openrouter/router";
import { psRouter } from "../../ps/ps.router";
import { hrRouter } from "../../hr/router";
import { organizationManagementRouter } from "../../organization-management/router";
import { cultureValuesRouter } from "../../culture-values/router";
import { aiTypesRouter } from "../../ai-types/router";
import { kgraAgentRouter } from "../../kgra-agent/router";
import { communicationRouter } from "../../communication/router";
import { pmCentralRouter } from "../../pm-central/router";

export const MODULE_ROUTERS = {
  prm: prmRouter,
  psm: psmRouter,
  codeStudio: codeStudioRouter,
  agentStudio: agentStudioRouter,
  sandboxWf: sandboxWfRouter,
  openRouter: openRouterRouter,
  ps: psRouter,
  hr: hrRouter,
  organizationManagement: organizationManagementRouter,
  cultureValues: cultureValuesRouter,
  aiTypes: aiTypesRouter,
  kgraAgent: kgraAgentRouter,
  communication: communicationRouter,
  pmCentral: pmCentralRouter,
} as const;

export type ModuleRoutersRecord = typeof MODULE_ROUTERS;
export type ModuleRouterKey = keyof ModuleRoutersRecord;
