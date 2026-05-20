// GraphWorkspaceUtilsPanel — no-deferral continuation-39 slice 150.
//
// Closes the UI-consumer gap for graphWorkspace.{neighborhood,
// shortestPath, backendHealth} — the final 3 unconsumed endpoints
// across the partial-consumer audit cycle.
//
// Final arc of the cycle. After this lands, all 17 partial-consumer
// routers (promotion / graphCorrection / semanticEnrichment /
// graphQuality / vault / workspaceObservability / providerBindings /
// canvas / graphAgent / graphSkill / cag / goldenQuestions /
// graphProjection / racEvaluation / toolApprovals / toolKnowledge /
// graphWorkspace) are 100% UI-consumed.

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "./ui";

function parsePositiveInt(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function GraphWorkspaceUtilsPanel() {
  return (
    <div className="space-y-4" data-testid="gwu-panel">
      <BackendHealthCard />
      <NeighborhoodCard />
      <ShortestPathCard />
    </div>
  );
}

function BackendHealthCard() {
  const query = trpc.agentStudio.graphWorkspace.backendHealth.useQuery(
    undefined,
    { refetchOnWindowFocus: false },
  );
  const result = query.data as
    | {
        ok?: boolean;
        backend?: string | null;
        message?: string | null;
        [k: string]: unknown;
      }
    | undefined;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Backend health</SectionLabel>
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Probing…</p>
        ) : query.error ? (
          <p className="text-sm text-destructive" data-testid="gwu-health-error">
            {query.error.message}
          </p>
        ) : result ? (
          <pre
            className="rounded border bg-background p-2 font-mono text-xs"
            data-testid="gwu-health-body"
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        ) : null}
      </CardContent>
    </Card>
  );
}

function NeighborhoodCard() {
  const [nodeId, setNodeId] = useState("");
  const [depthRaw, setDepthRaw] = useState("1");
  const depth = parsePositiveInt(depthRaw);
  const depthValid = depth !== null && depth <= 8;
  const enabled = nodeId.trim().length > 0 && depthValid;

  const query = trpc.agentStudio.graphWorkspace.neighborhood.useQuery(
    enabled ? { nodeId: nodeId.trim(), depth } : (undefined as never),
    { enabled, refetchOnWindowFocus: false, retry: false },
  );
  const result = query.data as
    | { nodes?: Array<{ id: string }>; edges?: Array<unknown> }
    | undefined;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Neighborhood</SectionLabel>
        <p className="text-xs text-muted-foreground">
          Depth-bounded neighborhood traversal from a seed node.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="gwu-node-id">Node id</Label>
            <Input
              id="gwu-node-id"
              data-testid="gwu-node-id"
              value={nodeId}
              onChange={(e) => setNodeId(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="gwu-depth">Depth (1–8)</Label>
            <Input
              id="gwu-depth"
              data-testid="gwu-depth"
              type="number"
              min={1}
              max={8}
              value={depthRaw}
              onChange={(e) => setDepthRaw(e.target.value)}
            />
            {!depthValid && depthRaw.length > 0 ? (
              <p
                className="mt-1 text-xs text-destructive"
                data-testid="gwu-depth-error"
              >
                Must be 1–8
              </p>
            ) : null}
          </div>
        </div>
        {!enabled ? null : query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : query.error ? (
          <p className="text-sm text-destructive" data-testid="gwu-neigh-error">
            {query.error.message}
          </p>
        ) : result ? (
          <div
            className="rounded border bg-background p-2 font-mono text-xs"
            data-testid="gwu-neigh-result"
          >
            <div>
              {result.nodes?.length ?? 0} nodes ·{" "}
              {result.edges?.length ?? 0} edges
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ShortestPathCard() {
  const [fromNodeId, setFromNodeId] = useState("");
  const [toNodeId, setToNodeId] = useState("");
  const enabled =
    fromNodeId.trim().length > 0 && toNodeId.trim().length > 0;

  const query = trpc.agentStudio.graphWorkspace.shortestPath.useQuery(
    enabled
      ? { fromNodeId: fromNodeId.trim(), toNodeId: toNodeId.trim() }
      : (undefined as never),
    { enabled, refetchOnWindowFocus: false, retry: false },
  );
  const result = query.data as
    | { nodes?: Array<{ id: string }>; edges?: Array<unknown> }
    | undefined;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Shortest path</SectionLabel>
        <p className="text-xs text-muted-foreground">
          Compute the shortest path between two graph nodes.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="gwu-from">From node id</Label>
            <Input
              id="gwu-from"
              data-testid="gwu-from-node"
              value={fromNodeId}
              onChange={(e) => setFromNodeId(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="gwu-to">To node id</Label>
            <Input
              id="gwu-to"
              data-testid="gwu-to-node"
              value={toNodeId}
              onChange={(e) => setToNodeId(e.target.value)}
            />
          </div>
        </div>
        {!enabled ? null : query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : query.error ? (
          <p className="text-sm text-destructive" data-testid="gwu-path-error">
            {query.error.message}
          </p>
        ) : result ? (
          <div
            className="rounded border bg-background p-2 font-mono text-xs"
            data-testid="gwu-path-result"
          >
            <div>
              {result.nodes?.length ?? 0} nodes ·{" "}
              {result.edges?.length ?? 0} edges in path
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
