/**
 * RAC P11 — Configuration + observability page.
 *
 * Composes the five P11 panels in a tabbed shell:
 *
 *   Pack       — CagPackPanel (persisted CAG snapshot + composer dry-run)
 *   Sources    — RacSourcesPanel (profiles + bound sources)
 *   Policy     — RacRetrievalPolicyPanel (per-profile filter/timeout/PII)
 *   Evaluation — RacEvaluationPanel (preview retrieval + groundedness)
 *   Traces     — RacTracesPanel (lookup trace + feedback)
 *
 * Resolves the agent's current draft id once at the page level so the
 * panels share a stable `agentDraftId` and the `selectedProfileId`
 * state belongs to the page (panels stay stateless across tab toggles).
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader, LoadingState, EmptyState } from "../components/ui";
import CagPackPanel from "../components/CagPackPanel";
import RacSourcesPanel from "../components/RacSourcesPanel";
import RacRetrievalPolicyPanel from "../components/RacRetrievalPolicyPanel";
import RacEvaluationPanel from "../components/RacEvaluationPanel";
// No-deferral continuation-36 slice 141: rounds out racEvaluation
// surface by surfacing `evaluate` alongside the existing preview +
// groundedness consumers inside the Evaluation tab.
import { RacEvaluateTracePanel } from "../components/RacEvaluateTracePanel";
import RacTracesPanel from "../components/RacTracesPanel";

export default function RacPage({
  agentId,
  workspaceId = 1,
}: {
  agentId: number;
  workspaceId?: number;
}) {
  const identityQuery = trpc.agentStudio.identity.get.useQuery({ agentId });
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);

  if (identityQuery.isLoading) {
    return <LoadingState label="Loading agent…" />;
  }
  if (identityQuery.isError) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-red-400">
          Failed to load agent:{" "}
          {(identityQuery.error as { message?: string } | null)?.message ?? "unknown"}
        </CardContent>
      </Card>
    );
  }
  const draft = identityQuery.data?.draft as
    | { id: number; agentId: number }
    | null
    | undefined;
  if (!draft) {
    return (
      <EmptyState
        title="This agent has no current draft"
        description="Create or restore a draft from the Identity page before configuring RAC."
      />
    );
  }

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="RAC — Capability Pack & Retrieval"
        description="Inspect the agent's capability pack, configure retrieval profiles, run preview queries, and review trace metrics + feedback."
      />
      <Tabs defaultValue="pack">
        <TabsList>
          <TabsTrigger value="pack">Pack</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="policy">Policy</TabsTrigger>
          <TabsTrigger value="evaluation">Evaluation</TabsTrigger>
          <TabsTrigger value="traces">Traces</TabsTrigger>
        </TabsList>
        <TabsContent value="pack" className="mt-3">
          <CagPackPanel workspaceId={workspaceId} agentId={agentId} />
        </TabsContent>
        <TabsContent value="sources" className="mt-3">
          <RacSourcesPanel
            workspaceId={workspaceId}
            agentId={agentId}
            agentDraftId={draft.id}
            selectedProfileId={selectedProfileId}
            onSelectProfile={setSelectedProfileId}
          />
        </TabsContent>
        <TabsContent value="policy" className="mt-3">
          <RacRetrievalPolicyPanel
            workspaceId={workspaceId}
            profileId={selectedProfileId}
          />
        </TabsContent>
        <TabsContent value="evaluation" className="mt-3 space-y-3">
          <RacEvaluationPanel
            workspaceId={workspaceId}
            agentId={agentId}
            agentDraftId={draft.id}
          />
          <RacEvaluateTracePanel workspaceId={workspaceId} />
        </TabsContent>
        <TabsContent value="traces" className="mt-3">
          <RacTracesPanel workspaceId={workspaceId} agentId={agentId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
