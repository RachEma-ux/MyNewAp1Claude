/**
 * Provider Bindings Admin page — no-deferral continuation-29 slice 120.
 *
 * Global Agent Studio page reachable at
 * `/agent-studio/provider-bindings-admin`. Closes the partial-consumer
 * gap on `providerBindings.{listForAgent, remove, resolveForRun,
 * testRunWithBinding}` — 4 unconsumed endpoints (7 already consumed
 * by the per-agent binding picker shipped at Plan v3 Phase 14).
 */

import { Plug } from "lucide-react";

import { PageHeader } from "../components/ui";
import { ProviderBindingsAdminPanel } from "../components/ProviderBindingsAdminPanel";

export default function ProviderBindingsAdminPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Provider Bindings Admin"
        subtitle="Long-tail operator surface for the providerBindings.* surface — list bindings for an agent, resolve+remove by (draftId, role), and Phase-16 test runs that gate on the binding's policy + Model Access validators."
        icon={<Plug className="h-5 w-5" />}
      />
      <ProviderBindingsAdminPanel />
    </div>
  );
}
