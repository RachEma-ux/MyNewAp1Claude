/**
 * VaultExplorerDashboardPage — group landing for the "Vault Explorer"
 * sidebar group. Surfaces the four child views (Vault Notes, Graph
 * Exploration, Impact Analysis, Runtime Traces) as navigation cards
 * with a one-line description, alongside live counts read from the
 * Native Graph Workspace runtime (`agentStudio.graphWorkspace.*`
 * tRPC namespace per `docs/architecture/agent-studio-native-graph-workspace.md`).
 *
 * The four child pages each render one focused panel from the legacy
 * monolith `GraphWorkspacePage`. This dashboard is the entry point
 * that orients operators to the four discrete capabilities of the
 * Native Graph Workspace runtime.
 */

import { useLocation } from "wouter";
import {
  Network,
  FileText,
  GitBranch,
  TrendingUp,
  Activity,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "../components/ui";

interface NavCard {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly route: string;
  readonly icon: typeof FileText;
  readonly color: string;
}

const CARDS: ReadonlyArray<NavCard> = [
  {
    key: "vault-notes",
    label: "Vault Notes",
    description:
      "Browse and edit Markdown notes across vaults — backed by the DB-canonical vault store with optional FS-sync.",
    route: "/agent-studio/vault-notes",
    icon: FileText,
    color: "text-emerald-400",
  },
  {
    key: "vault-graph",
    label: "Graph Exploration",
    description:
      "Local + global views of the typed knowledge graph projected from vault notes (entities, references, embeds).",
    route: "/agent-studio/vault-graph",
    icon: GitBranch,
    color: "text-purple-400",
  },
  {
    key: "vault-impact",
    label: "Impact Analysis",
    description:
      "Run the 7 impact_* Cypher templates against a seed node to surface knowledge / runtime / governance dependencies.",
    route: "/agent-studio/vault-impact",
    icon: TrendingUp,
    color: "text-amber-400",
  },
  {
    key: "vault-traces",
    label: "Runtime Traces",
    description:
      "Runtime + decision trace timelines for any `agsRuntimeRuns` row, projected as graph paths.",
    route: "/agent-studio/vault-traces",
    icon: Activity,
    color: "text-blue-400",
  },
];

export default function VaultExplorerDashboardPage() {
  const [, navigate] = useLocation();

  return (
    <div className="p-4 space-y-4" data-testid="vault-explorer-dashboard">
      <PageHeader
        icon={<Network className="h-5 w-5" />}
        title="Vault Explorer"
        subtitle="Native graph workspace runtime — four focused surfaces on top of the DB-canonical vault store and its Neo4j projection."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <Card
              key={card.key}
              className="cursor-pointer transition-colors hover:border-primary/60"
              onClick={() => navigate(card.route)}
              data-testid={`vault-dashboard-card-${card.key}`}
            >
              <CardContent className="pt-5 pb-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-5 w-5 ${card.color}`} />
                    <span className="text-sm font-semibold">{card.label}</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {card.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-muted/30">
        <CardContent className="pt-4 pb-3 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Runtime backing
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            All four surfaces read from the same runtime: vault notes are stored DB-canonical
            in <code className="font-mono">ags_vault_notes</code> (with optional FS-sync), projected
            into Neo4j Community via the <code className="font-mono">GraphRepository</code> port,
            and queried through the registered <code className="font-mono">ags_query_templates</code> Cypher
            patterns. See{" "}
            <span className="font-mono">docs/architecture/agent-studio-native-graph-workspace.md</span> for
            the canonical 5-layer architecture.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
