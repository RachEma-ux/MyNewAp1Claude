/**
 * Native Graph Workspace — Graph ontology schema summary panel.
 *
 * Phase 13 §6. Consumes `agentStudio.graphAgent.schemaSummary` (§4
 * tRPC procedure) and renders the prompt-safe node/edge type
 * catalog operators can inspect to understand what shape data the
 * Graph Agent is reasoning over.
 *
 * The same shape the agent sees in its prompt — useful for
 * operators tuning Skill Packs and debugging why a query "doesn't
 * find" a node type that hasn't been registered in the ontology.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Network } from "lucide-react";
import {
  EmptyState,
  ErrorCallout,
  LoadingState,
  PageHeader,
  SectionLabel,
} from "./ui";

export default function GraphSchemaSummaryPanel() {
  const query = trpc.agentStudio.graphAgent.schemaSummary.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const summary = query.data;

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <PageHeader
          title="Graph Schema (Prompt-Safe View)"
          subtitle="The ontology shape the Graph Agent sees in its prompt. Loaded from ags_graph_ontology_node_types + edge_types."
          icon={<Network className="h-4 w-4" />}
          badges={
            summary?.truncated ? (
              <Badge
                variant="outline"
                className="text-[9px] px-1.5 py-0 h-4 bg-yellow-500/15 text-yellow-300 border-yellow-500/40"
              >
                truncated
              </Badge>
            ) : null
          }
        />

        {query.isLoading ? (
          <LoadingState label="Loading ontology…" />
        ) : query.isError ? (
          <ErrorCallout
            title="Failed to load schema summary"
            message={query.error?.message ?? "Unknown error"}
          />
        ) : !summary ||
          (summary.nodeTypes.length === 0 && summary.edgeTypes.length === 0) ? (
          <EmptyState
            icon={<Network />}
            title="No ontology registered"
            description="ags_graph_ontology_node_types and edge_types are empty. Boot-time seeds populate these tables."
          />
        ) : (
          <div className="space-y-4">
            <div>
              <SectionLabel>
                Node types ({summary.nodeTypes.length}
                {summary.truncated && summary.nodeTypeCountTotal > summary.nodeTypes.length
                  ? ` of ${summary.nodeTypeCountTotal}+`
                  : ""}
                )
              </SectionLabel>
              {summary.nodeTypes.length === 0 ? (
                <p className="text-[10px] text-muted-foreground/70">
                  No node types.
                </p>
              ) : (
                <div className="space-y-1.5 mt-1.5">
                  {summary.nodeTypes.map((n) => (
                    <div
                      key={n.typeKey}
                      className="border border-border/40 rounded px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono">{n.typeKey}</span>
                        <span className="text-xs text-muted-foreground">
                          {n.displayName}
                        </span>
                        {n.category && (
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1 py-0 h-4"
                          >
                            {n.category}
                          </Badge>
                        )}
                      </div>
                      {n.description && (
                        <p className="text-[10px] text-muted-foreground mt-1 break-words">
                          {n.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <SectionLabel>
                Edge types ({summary.edgeTypes.length}
                {summary.truncated && summary.edgeTypeCountTotal > summary.edgeTypes.length
                  ? ` of ${summary.edgeTypeCountTotal}+`
                  : ""}
                )
              </SectionLabel>
              {summary.edgeTypes.length === 0 ? (
                <p className="text-[10px] text-muted-foreground/70">
                  No edge types.
                </p>
              ) : (
                <div className="space-y-1.5 mt-1.5">
                  {summary.edgeTypes.map((e) => (
                    <div
                      key={e.typeKey}
                      className="border border-border/40 rounded px-3 py-2"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono">{e.typeKey}</span>
                        <span className="text-xs text-muted-foreground">
                          {e.displayName}
                        </span>
                        {e.cardinality && (
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1 py-0 h-4"
                          >
                            {e.cardinality}
                          </Badge>
                        )}
                        {!e.isDirected && (
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1 py-0 h-4"
                          >
                            undirected
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {e.sourceNodeTypeKeys.join(", ") || "*"}
                        {" → "}
                        {e.targetNodeTypeKeys.join(", ") || "*"}
                      </p>
                      {e.description && (
                        <p className="text-[10px] text-muted-foreground mt-1 break-words">
                          {e.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
