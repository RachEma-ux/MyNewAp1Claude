/**
 * Approval event bus admin tRPC router — PR-V1-168.
 *
 * Mirrors `region-admin-router.ts::getPubsubStatus` (PR-V1-167):
 * exposes the cross-process pubsub state so operators can confirm
 * D-RESUME-5 (#916) is actually wired in multi-process deployments.
 *
 * Mounted at `agentStudio.approvalBus.*`. Single procedure today
 * (`getPubsubStatus`); the namespace exists so future approval-bus
 * observability lands here rather than spreading across multiple
 * routers.
 *
 * `adminProcedure` — bus state isn't workspace-scoped (cross-tenant
 * ops concern); only operators view it.
 */

import { adminProcedure, router } from "../../../_core/trpc.js";
import { getApprovalBusPubsubStatus } from "./approval-event-bus-pubsub.js";

export const approvalBusAdminRouter = router({
  /**
   * Cross-process approval-decided pubsub status. Returns the
   * LISTEN connection state, the last received event's approval
   * id + timestamp, lifetime message + malformed-payload counters,
   * and reconnect-attempt count.
   *
   * Useful operator questions:
   *   - Is D-RESUME-5 wired? → `subscribed && connectedAt != null`
   *   - Are events flowing? → `messagesReceived > 0` recently
   *   - Are payloads consistent? → `malformedReceived == 0`
   */
  getPubsubStatus: adminProcedure.query(async () => {
    return getApprovalBusPubsubStatus();
  }),
});
